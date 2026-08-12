import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import { getTemplate } from '$lib/server/outreach';
import { createInteraction } from '$lib/server/saveInteraction';
import { createReminder } from '$lib/server/reminders-query';
import { PLATFORMS, isOutreachPlatform } from '$lib/outreach/platforms';
import { idempotencyKeyFrom, withIdempotency } from '$lib/server/idempotency';

const DAY_MS = 86_400_000;

/**
 * Record that a rendered template was actually sent — by the user, elsewhere.
 *
 * The body comes from the client rather than being re-rendered here, because
 * the preview is editable: what gets logged has to be what was *copied*, not
 * what the template would have produced. `createInteraction` sanitizes and caps
 * it.
 *
 * Idempotent by key, and this is the endpoint that most needs it. "Mark as
 * sent" is deliberately a separate press from "Copy", so it is exactly the kind
 * of action someone taps again when a spinner hangs — and logging the same
 * message twice, with two follow-up reminders, is a mess to unpick by hand.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const s = requireApiScope(locals, 'write');

  let body: {
    templateId?: string;
    personId?: string;
    subject?: string | null;
    body?: string | null;
    remindInDays?: number | null;
  };
  try {
    body = await request.json();
  } catch {
    return apiError('invalid_request', 'Body must be JSON.', 400);
  }

  if (typeof body.templateId !== 'string' || !body.templateId) {
    return apiError('invalid_request', '`templateId` is required.', 400);
  }
  if (typeof body.personId !== 'string' || !body.personId) {
    return apiError('invalid_request', '`personId` is required.', 400);
  }

  const template = await getTemplate(s, body.templateId);
  if (!template) return apiError('not_found', 'No such template.', 404);
  if (!isOutreachPlatform(template.platform)) {
    return apiError('invalid_request', 'That template has an unknown platform.', 400);
  }

  const spec = PLATFORMS[template.platform];
  const title =
    spec.hasSubject && body.subject?.trim() ? body.subject.trim() : `Outreach: ${template.name}`;

  return withIdempotency(s, idempotencyKeyFrom(request), async () => {
    let created: { id: string };
    try {
      created = await createInteraction(s, {
        occurredAt: Date.now(),
        type: spec.interactionType,
        title,
        body: body.body ?? null,
        personIds: [body.personId as string],
        outreachTemplateId: template.id
      });
    } catch (err) {
      return apiError('invalid_request', (err as Error).message, 400);
    }

    // The nudge is a personal reminder, not a shared task: "I'll chase this
    // myself" is what the follow-up offset means.
    const days = body.remindInDays ?? template.nudgeDays;
    let reminderId: string | null = null;
    if (days && Number.isFinite(days) && days > 0) {
      try {
        const reminder = await createReminder(s, {
          kind: 'person',
          refId: body.personId as string,
          remindAt: Date.now() + Math.floor(days) * DAY_MS
        });
        reminderId = reminder.id;
      } catch {
        // A logged interaction with no reminder beats losing the log because
        // the follow-up could not be scheduled.
        reminderId = null;
      }
    }

    return apiOk({ id: created.id, reminderId }, { status: 201 });
  });
};
