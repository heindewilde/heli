import { error, json, type RequestHandler } from '@sveltejs/kit';
import { requireScope } from '$lib/server/scope';
import { getTemplate } from '$lib/server/outreach';
import { createInteraction } from '$lib/server/saveInteraction';
import { createReminder } from '$lib/server/reminders-query';
import { PLATFORMS, isOutreachPlatform } from '$lib/outreach/platforms';

const DAY_MS = 86_400_000;

/**
 * Record that a rendered template was actually sent.
 *
 * The body comes from the client, not from re-rendering server-side, because
 * the preview is editable — what we log has to be what was copied, not what the
 * template would have produced. `createInteraction` sanitizes and caps it.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);

  let body: {
    templateId?: string;
    personId?: string;
    companyId?: string;
    subject?: string | null;
    body?: string | null;
    remindInDays?: number | null;
  };
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }

  if (!body.templateId || typeof body.templateId !== 'string') throw error(400, 'missing_template');

  const personId = typeof body.personId === 'string' && body.personId ? body.personId : null;
  const companyId = typeof body.companyId === 'string' && body.companyId ? body.companyId : null;
  // Exactly one. Neither is nothing to log against; both would be a message
  // claimed to have gone to two different recipients.
  if (!personId === !companyId) throw error(400, 'missing_recipient');

  const template = await getTemplate(s, body.templateId);
  if (!template) throw error(404, 'not_found');
  if (!isOutreachPlatform(template.platform)) throw error(400, 'invalid_platform');
  /**
   * The recipient has to agree with who the template addresses.
   * `interactions.outreach_template_id` is the only provenance an outreach
   * message leaves behind, so a company template logged against a person would
   * make that record say something untrue and nothing would ever catch it.
   */
  if ((template.target === 'company') !== !!companyId) throw error(400, 'target_mismatch');

  const spec = PLATFORMS[template.platform];
  // The subject is part of the message on the platforms that have one, so it
  // belongs in the title rather than being dropped.
  const title =
    spec.hasSubject && body.subject?.trim() ? body.subject.trim() : `Outreach: ${template.name}`;

  let created: { id: string };
  try {
    created = await createInteraction(s, {
      occurredAt: Date.now(),
      type: spec.interactionType,
      title,
      body: body.body ?? null,
      personIds: personId ? [personId] : undefined,
      companyId: companyId ?? undefined,
      outreachTemplateId: template.id
    });
  } catch (err) {
    throw error(400, (err as Error).message);
  }

  // The nudge is a personal reminder, not a shared task: "I'll chase this
  // myself" is what the follow-up offset means.
  const days = body.remindInDays ?? template.nudgeDays;
  let reminderId: string | null = null;
  if (days && Number.isFinite(days) && days > 0) {
    try {
      // `REMINDER_KINDS` already carries 'company', and `refExists` already has
      // the branch — a company nudge needed no schema change.
      const reminder = await createReminder(s, {
        kind: personId ? 'person' : 'company',
        refId: (personId ?? companyId)!,
        remindAt: Date.now() + Math.floor(days) * DAY_MS
      });
      reminderId = reminder.id;
    } catch {
      // A logged interaction with no reminder beats losing the log because the
      // follow-up could not be scheduled.
      reminderId = null;
    }
  }

  return json({ id: created.id, reminderId }, { status: 201 });
};
