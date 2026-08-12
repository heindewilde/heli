/**
 * Record that a message was sent.
 *
 * The body posted here is the **edited** draft, not a re-render of the template.
 * The preview is editable, so a re-render would log something the user never
 * sent — which defeats the point of logging it.
 *
 * Both composers (the dialog on a person page and the bulk run screen) called
 * this endpoint with the same five fields and the same error handling; it is one
 * function so a change to the contract cannot reach only one of them.
 */
export type LogSendInput = {
  templateId: string;
  personId: string;
  subject: string;
  body: string;
  remindInDays: number | null;
};

export type LogSendResult = { ok: true; reminderId: string | null } | { ok: false };

export async function logSend(input: LogSendInput): Promise<LogSendResult> {
  try {
    const res = await fetch('/api/outreach/sent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    });
    if (!res.ok) return { ok: false };
    // A reminder that failed to save does not fail the log — the server reports
    // it as a null id rather than an error, and the caller words its toast
    // accordingly.
    const { reminderId } = (await res.json()) as { reminderId: string | null };
    return { ok: true, reminderId };
  } catch {
    return { ok: false };
  }
}
