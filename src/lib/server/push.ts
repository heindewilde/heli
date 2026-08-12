import { and, eq, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { db } from './db';
import { devices, reminders } from './schema';
import { withTimeout } from './fetchGuard';

/**
 * Push notifications for due reminders.
 *
 * Rides the scheduler that already exists — one 60s interval, one lease per
 * regional database — rather than introducing a second timer. `CLAUDE.md` says
 * of that seam: *"don't take it in the same change as something else"*, which is
 * why this lands on its own.
 *
 * Expo's push service rather than APNs and FCM directly. Talking to those means
 * two sets of credentials per deployment, and Heli is self-hostable — every
 * self-hoster would need an Apple developer account and a Firebase project
 * before a single notification worked. One HTTP POST to a fixed URL needs no
 * dependency and no configuration.
 *
 * **Notification bodies are deliberately generic.** Expo's relay, APNs and FCM
 * are all third parties, and this is a CRM: "Reminder about someone you follow"
 * traverses them, the name does not. The app fetches the detail when it opens.
 * That is a rule, not a placeholder — do not "improve" it by interpolating the
 * person's name.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Bounded like MAX_FEEDS_PER_TICK, and for the same reason: the tick is shared. */
const MAX_PER_TICK = 200;
/** Expo accepts up to 100 messages per request. */
const BATCH = 100;

const KIND_LABEL: Record<string, string> = {
  person: 'someone you follow',
  company: 'a company you follow',
  interaction: 'a conversation',
  project: 'a project'
};

export type DuePush = {
  reminderId: string;
  userId: string;
  kind: string;
  refId: string;
  pushTokens: string[];
};

/**
 * Claim due reminders and return what to send.
 *
 * The claim is a stamp on `notified_at`, written **before** anything is sent.
 * That ordering is the whole delivery guarantee: another process, or the next
 * tick, cannot pick up a row that is already claimed. A crash between the stamp
 * and the send loses one notification; the reverse ordering would send the same
 * one every minute until it succeeded. Losing a push is a minor annoyance —
 * repeating one at 03:00 is how an app gets deleted.
 */
export async function claimDueReminders(region: string, now: number): Promise<DuePush[]> {
  const d = db(region);

  const due = await d
    .select({
      id: reminders.id,
      userId: reminders.userId,
      kind: reminders.kind,
      refId: reminders.refId
    })
    .from(reminders)
    .where(and(lte(reminders.remindAt, now), isNull(reminders.notifiedAt)))
    .orderBy(reminders.remindAt)
    .limit(MAX_PER_TICK);

  if (due.length === 0) return [];

  const out: DuePush[] = [];
  for (const r of due) {
    // Claim first. `rowsAffected` confirms this process won the row — the same
    // conditional-update pattern the scheduler lease uses.
    const claimed = await d
      .update(reminders)
      .set({ notifiedAt: now })
      .where(and(eq(reminders.id, r.id), isNull(reminders.notifiedAt)))
      .run();
    if (claimed.rowsAffected !== 1) continue;

    // Reminders are personal, so this only ever reaches their owner's devices —
    // never a colleague's, even in a shared workspace.
    const targets = await d
      .select({ pushToken: devices.pushToken })
      .from(devices)
      .where(
        and(
          eq(devices.userId, r.userId),
          isNull(devices.revokedAt),
          isNotNull(devices.pushToken)
        )
      );

    const tokens = targets.map((t) => t.pushToken).filter((t): t is string => !!t);
    if (tokens.length > 0) {
      out.push({ reminderId: r.id, userId: r.userId, kind: r.kind, refId: r.refId, pushTokens: tokens });
    }
  }
  return out;
}

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  data: { kind: string; refId: string; reminderId: string };
};

export function buildMessages(due: DuePush[]): ExpoMessage[] {
  const messages: ExpoMessage[] = [];
  for (const item of due) {
    for (const to of item.pushTokens) {
      messages.push({
        to,
        title: 'Reminder',
        // Generic on purpose — see the note at the top of this file.
        body: `You asked to be reminded about ${KIND_LABEL[item.kind] ?? 'a record'}.`,
        sound: 'default',
        // The payload routes the tap. Ids are opaque and are useless without a
        // credential, so they are safe to carry where the words are not.
        data: { kind: item.kind, refId: item.refId, reminderId: item.reminderId }
      });
    }
  }
  return messages;
}

/**
 * Send in batches of 100.
 *
 * Not `fetchGuarded`: that is the SSRF guard for user-supplied URLs, and this
 * host is a fixed constant. `withTimeout` from the same module still applies —
 * a hung request here would hold the scheduler's single `running` guard and
 * delay calendar sync behind it.
 */
export async function sendPush(messages: ExpoMessage[]): Promise<number> {
  let sent = 0;
  for (let i = 0; i < messages.length; i += BATCH) {
    const chunk = messages.slice(i, i + BATCH);
    const { signal, done } = withTimeout(10_000);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(chunk),
        signal
      });
      if (res.ok) sent += chunk.length;
      else console.error('[push] expo rejected a batch', res.status);
    } catch (err) {
      // The reminders are already claimed, so this batch is simply lost. That
      // is the trade made above, and it is the right one.
      console.error('[push] send failed', (err as Error).message);
    } finally {
      done();
    }
  }
  return sent;
}

/** One region's worth of work. Called from the scheduler's tick. */
export async function pushTick(region: string, now: number): Promise<number> {
  if (process.env.PUSH_DISABLED === '1') return 0;
  const due = await claimDueReminders(region, now);
  if (due.length === 0) return 0;
  return sendPush(buildMessages(due));
}
