/**
 * A minimal RFC 5545 reader — the subset a CRM needs, and no more.
 *
 * Zero dependencies, and deliberately no timezone database: offsets are
 * computed with `Intl.DateTimeFormat`, which every supported Node already
 * carries. Shipping tzdata to resolve `TZID=Europe/Amsterdam` would be several
 * hundred kilobytes for arithmetic the platform already does.
 */

export type IcsAttendee = {
  email: string;
  name: string | null;
  /** ACCEPTED / DECLINED / TENTATIVE / NEEDS-ACTION, when the calendar says. */
  partstat: string | null;
};

export type IcsEvent = {
  uid: string;
  /** Set when this is one instance of a recurring series. Part of the identity. */
  recurrenceId: string | null;
  summary: string | null;
  description: string | null;
  location: string | null;
  start: number | null;
  end: number | null;
  allDay: boolean;
  cancelled: boolean;
  /** Present when the event repeats. v1 does not expand these — see below. */
  rrule: string | null;
  organizer: IcsAttendee | null;
  attendees: IcsAttendee[];
};

export type IcsParseResult = {
  events: IcsEvent[];
  /** Recurring events skipped, surfaced in Settings so the choice is visible. */
  recurringSkipped: number;
  /** TZIDs Intl could not resolve; those events fall back to UTC. */
  unknownTimezones: string[];
};

/* ── line handling ───────────────────────────────────────────────────────── */

/**
 * Undo RFC 5545 line folding.
 *
 * Non-negotiable and must happen before anything else: Google folds at 75
 * octets, cheerfully in the middle of a UID, and a parser that reads folded
 * lines produces garbage identity keys rather than obvious errors.
 */
function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

type Prop = { name: string; params: Record<string, string>; value: string };

function parseProp(line: string): Prop | null {
  // Find the colon that ends the name+params, skipping any inside quotes.
  let colon = -1;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === ':' && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon === -1) return null;

  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...paramParts] = head.split(';');
  const params: Record<string, string> = {};
  for (const part of paramParts) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value };
}

function unescapeText(v: string): string {
  return v
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/* ── time ────────────────────────────────────────────────────────────────── */

/**
 * Offset of `utcMs` in `tz`, in minutes. Formats the instant in the target zone,
 * reads the wall-clock back as if it were UTC, and takes the difference.
 */
function zoneOffsetMinutes(utcMs: number, tz: string): number | null {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).formatToParts(new Date(utcMs));
  } catch {
    return null; // Unknown TZID.
  }
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second')
  );
  return (asUtc - utcMs) / 60_000;
}

function parseDateValue(
  prop: Prop,
  unknownTimezones: Set<string>
): { at: number | null; allDay: boolean } {
  const v = prop.value.trim();

  // VALUE=DATE — a whole day, no time component.
  if (prop.params.VALUE === 'DATE' || /^\d{8}$/.test(v)) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
    if (!m) return { at: null, allDay: true };
    return { at: Date.UTC(+m[1], +m[2] - 1, +m[3]), allDay: true };
  }

  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
  if (!m) return { at: null, allDay: false };
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);

  if (m[7] === 'Z') return { at: naive, allDay: false };

  const tz = prop.params.TZID;
  if (!tz) return { at: naive, allDay: false }; // Floating local time; UTC is the honest guess.

  // Two passes: the offset depends on the instant, and the instant on the
  // offset. One correction is enough except within the hour a DST change
  // happens, where no answer is unambiguous anyway.
  const first = zoneOffsetMinutes(naive, tz);
  if (first === null) {
    unknownTimezones.add(tz);
    return { at: naive, allDay: false };
  }
  const approx = naive - first * 60_000;
  const second = zoneOffsetMinutes(approx, tz) ?? first;
  return { at: naive - second * 60_000, allDay: false };
}

/* ── attendees ───────────────────────────────────────────────────────────── */

const SKIP_CUTYPES = new Set(['RESOURCE', 'ROOM']);

function parseAttendee(prop: Prop): IcsAttendee | null {
  const cutype = prop.params.CUTYPE?.toUpperCase();
  if (cutype && SKIP_CUTYPES.has(cutype)) return null;

  const email = prop.value.replace(/^mailto:/i, '').trim().toLowerCase();
  if (!email || !email.includes('@')) return null;

  return {
    email,
    name: prop.params.CN ? unescapeText(prop.params.CN) : null,
    partstat: prop.params.PARTSTAT?.toUpperCase() ?? null
  };
}

/* ── parse ───────────────────────────────────────────────────────────────── */

export function parseIcs(text: string): IcsParseResult {
  const lines = unfold(text);
  const events: IcsEvent[] = [];
  const unknownTimezones = new Set<string>();
  let recurringSkipped = 0;

  let calendarCancelled = false;
  let current: Partial<IcsEvent> & { attendees: IcsAttendee[] } = { attendees: [] };
  let inEvent = false;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      current = { attendees: [], cancelled: false, allDay: false };
      continue;
    }
    if (line === 'END:VEVENT') {
      inEvent = false;
      if (!current.uid) continue;
      // v1 does not expand recurrence. Correct expansion with EXDATE, BYSETPOS,
      // UNTIL and COUNT is 500+ lines and a bug factory, and a weekly 1:1
      // producing 52 interactions a year is noise rather than signal. The
      // counter is what tells us whether that judgement was right.
      if (current.rrule) {
        recurringSkipped++;
        continue;
      }
      events.push({
        uid: current.uid,
        recurrenceId: current.recurrenceId ?? null,
        summary: current.summary ?? null,
        description: current.description ?? null,
        location: current.location ?? null,
        start: current.start ?? null,
        end: current.end ?? null,
        allDay: current.allDay ?? false,
        cancelled: calendarCancelled || (current.cancelled ?? false),
        rrule: null,
        organizer: current.organizer ?? null,
        attendees: current.attendees
      });
      continue;
    }

    const prop = parseProp(line);
    if (!prop) continue;

    if (!inEvent) {
      if (prop.name === 'METHOD' && prop.value.toUpperCase() === 'CANCEL') calendarCancelled = true;
      continue;
    }

    switch (prop.name) {
      case 'UID':
        current.uid = prop.value.trim();
        break;
      case 'RECURRENCE-ID':
        current.recurrenceId = prop.value.trim();
        break;
      case 'SUMMARY':
        current.summary = unescapeText(prop.value);
        break;
      case 'DESCRIPTION':
        current.description = unescapeText(prop.value);
        break;
      case 'LOCATION':
        current.location = unescapeText(prop.value);
        break;
      case 'RRULE':
        current.rrule = prop.value;
        break;
      case 'STATUS':
        if (prop.value.toUpperCase() === 'CANCELLED') current.cancelled = true;
        break;
      case 'DTSTART': {
        const { at, allDay } = parseDateValue(prop, unknownTimezones);
        current.start = at;
        current.allDay = allDay;
        break;
      }
      case 'DTEND': {
        const { at } = parseDateValue(prop, unknownTimezones);
        current.end = at;
        break;
      }
      case 'ORGANIZER': {
        const a = parseAttendee(prop);
        if (a) current.organizer = a;
        break;
      }
      case 'ATTENDEE': {
        const a = parseAttendee(prop);
        if (a) current.attendees.push(a);
        break;
      }
    }
  }

  return { events, recurringSkipped, unknownTimezones: [...unknownTimezones] };
}
