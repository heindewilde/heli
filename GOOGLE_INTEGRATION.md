# Google Integration Roadmap

## Context

Heli has Google OAuth sign-in (done) with a complete-signup onboarding step for new users
(done — `src/routes/auth/complete-signup/`, `registerWithGoogle()` + `isNewGoogleUser()` in
`auth.ts`). This plan extends that into a full Google integration suite: contacts import,
token persistence, calendar sync, and eventually Gmail logging. Each phase builds on the
previous. Phases 1 and 4 are standalone (no persistent tokens). Phases 2–5 form a sequential
stack.

---

## Phase 1 — Google Contacts Import

**No new DB tables. One-shot OAuth. Highest value, lowest complexity.**

### What it does
User clicks "Import from Google Contacts" in Settings. A new OAuth flow requests
`https://www.googleapis.com/auth/contacts.readonly` as an incremental scope. Tokens
are used immediately to fetch the Google People API, mapped to Heli's schema, then discarded.
A preview step shows what will be imported with duplicate detection before committing.

### New files
- `src/routes/auth/google/contacts/+server.ts` — initiates incremental OAuth (state cookie with `next=/settings?import=contacts`)
- `src/routes/auth/google/contacts/callback/+server.ts` — exchanges code, fetches contacts, returns to settings with import data in URL/cookie
- `src/routes/api/import/+server.ts` — `POST` endpoint: receives `{ kind: 'people'|'companies', records: [...] }`, deduplicates against existing data, inserts, returns `{ imported, duplicates, errors }`
- `src/lib/server/google.ts` — shared Google API fetch helpers (contacts, calendar, gmail userinfo)

### Existing code to reuse
- `src/routes/auth/google/+server.ts` — copy the state-cookie pattern exactly
- `src/routes/auth/google/callback/+server.ts` — copy the code-exchange pattern
- `src/lib/server/auth.ts` → `OAUTH_SENTINEL`, `$env/dynamic/private` for credentials
- `src/lib/server/og.ts` → no SSRF needed (Google APIs are safe), but use same `fetch` pattern
- `createId()` from `@paralleldrive/cuid2` for IDs
- `sanitize-html` for any notes fields imported from Google

### Field mapping: Google → Heli
```
Google People API field          → people column
─────────────────────────────────────────────────
person.names[0].displayName      → name (required)
person.emailAddresses[0].value   → email
person.phoneNumbers[0].value     → phone
person.addresses[0].formattedValue → location
person.organizations[0].name     → suggestedCompanyName
person.organizations[0].title    → role
person.biographies[0].value      → notes (sanitized)
source: 'google_contacts'        → source
```

### Dedup logic
- Exact match on `email` → skip (already exists)
- Exact match on `name` (case-insensitive) with no email → flag as possible duplicate, let user decide

### Settings UI changes
- `src/routes/settings/+page.svelte` — add "Connected accounts" section with "Import from Google Contacts" button
- Import preview modal: table of contacts to be imported, count of duplicates, confirm/cancel

### Critical files
- `src/lib/server/schema.ts` — read-only (no new tables)
- `src/lib/server/migrate.ts` — read-only (no migration needed)
- `src/routes/settings/+page.svelte`
- `src/routes/settings/+page.server.ts`

---

## Phase 2 — OAuth Token Storage

**Infrastructure prerequisite for Phases 3 and 5.**

### What it does
Stores Google OAuth access + refresh tokens in the DB so subsequent API calls
can be made without re-prompting the user.

### Schema changes
New `oauth_tokens` table (regional DB, same DB as users):
```sql
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,           -- 'google'
  scope TEXT NOT NULL,              -- space-separated scopes granted
  access_token TEXT NOT NULL,
  refresh_token TEXT,               -- null if not returned (short-lived grants)
  expires_at INTEGER NOT NULL,      -- ms timestamp
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_oauth_tokens_user_provider
  ON oauth_tokens(user_id, provider);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user
  ON oauth_tokens(user_id);
```

### New code
- `src/lib/server/schema.ts` — add `oauthTokens` table definition
- `src/lib/server/migrate.ts` — add DDL + ALTERS entries
- `src/lib/server/google.ts` — add `getValidToken(userId, region)`: reads token, refreshes if within 60s of expiry via `https://oauth2.googleapis.com/token`, updates DB, returns access token

Tokens are stored in the **Calendar and Gmail incremental auth callbacks** (Phases 3 and 5),
not at sign-in. This sidesteps the complete-signup flow gap (new users' sign-in tokens are
gone by the time they finish onboarding) and is cleaner — tokens are stored with exactly the
scopes that were granted.

The sign-in callback (`src/routes/auth/google/callback/+server.ts`) does **not** need to
be modified for Phase 2.

### Key detail
`refresh_token` is only returned by Google on first authorization or when `prompt=consent`
is passed. Use `access_type=offline&prompt=consent` on the Calendar/Gmail incremental auth
URLs to ensure a refresh token is returned. Store it when present; never overwrite with null.

---

## Phase 3 — Google Calendar → Interactions

**Requires Phase 2 (stored tokens).**

### What it does
A "Sync Google Calendar" button in Settings fetches the user's calendar events from the
past 90 days and upcoming 30 days, matches attendees to existing people by email, and
creates interactions of type `'meeting'`. A Google event ID is stored to prevent re-importing.

### Schema changes
- Add `external_id TEXT` column to `interactions` (via ALTERS)
- Unique index `uq_interactions_user_external` on `(user_id, external_id)` — prevents duplicate calendar imports

### Field mapping: Google Calendar → interactions
```
Google Calendar field           → interactions column
──────────────────────────────────────────────────────
event.summary                   → title
event.description (sanitized)   → body
event.start.dateTime (or .date) → occurred_at
'meeting'                       → type
event.id                        → external_id
event.attendees[].email         → match → interaction_people rows
event.organizer.email domain    → match company → company_id
```

### Attendee matching
Query `people` by email for each attendee. If matched, insert into `interaction_people`.
If unmatched, skip (don't create phantom people — user can import them via Phase 1 first).

### New files / changes
- `src/lib/server/google.ts` — add `fetchCalendarEvents(accessToken, timeMin, timeMax)`
- `src/routes/api/sync/calendar/+server.ts` — `POST`, protected, triggers sync, returns `{ created, skipped }`
- Settings UI — "Sync Google Calendar" button with last-synced timestamp

### Incremental auth
If user signed in without calendar scope, request it via a new `/auth/google/calendar`
incremental OAuth route (same pattern as contacts) before allowing sync.

---

## Phase 4 — "People I've Emailed" (Gmail implicit contacts)

**Standalone — no token storage needed. Piggybacks on Phase 1 import flow.**

### What it does
Gmail exposes a lightweight "other contacts" endpoint — people you've emailed but haven't
explicitly saved in Google Contacts. Scope: `https://www.googleapis.com/auth/contacts.other.readonly`.
Add this as a second import source in the same Phase 1 UI ("Import from Gmail contacts").

### Implementation
- New OAuth route: `src/routes/auth/google/gmail-contacts/+server.ts`
- Fetch from `https://people.googleapis.com/v1/otherContacts` (same People API, different collection)
- Reuse Phase 1's `src/routes/api/import/+server.ts` — identical ingestion pipeline
- Settings UI: second button "Import from Gmail contacts" alongside Phase 1 button

---

## Phase 5 — Gmail Thread Logging

**Requires Phase 2 (stored tokens). Biggest lift, highest long-term value.**

### What it does
Reads Gmail threads where the user is a participant, matches the other party to existing
people in Heli by email, and creates interactions of type `'email'`. Only threads involving
known Heli contacts are imported (no mass-import of all email).

### Scope
`https://www.googleapis.com/auth/gmail.readonly`

### Key complexity
- Gmail API returns threads/messages in base64-encoded MIME. Need to decode and extract:
  `From`, `To`, `Subject`, `Date` headers plus text body (prefer `text/plain` part).
- Dedup via `external_id` (Gmail thread ID) — same mechanism as Phase 3.
- Only import threads where at least one participant email matches a person in the user's Heli DB.

### New files
- `src/lib/server/gmail.ts` — `fetchThreadsForContacts(accessToken, emails[])`, MIME decoder, header extractor
- `src/routes/api/sync/gmail/+server.ts` — `POST`, protected, triggers sync
- Settings UI — "Sync Gmail" section, shown only if calendar is connected (natural progression)

---

## Dependency tree

```
Phase 1 (Contacts Import)     ← standalone
Phase 4 (Gmail Contacts)      ← standalone, reuses Phase 1 pipeline
Phase 2 (Token Storage)       ← standalone infrastructure
Phase 3 (Calendar Sync)       ← requires Phase 2
Phase 5 (Gmail Threads)       ← requires Phase 2, natural after Phase 3
```

---

## Shared infrastructure: `src/lib/server/google.ts`

Central module built incrementally across phases:

```typescript
// Phase 1
export async function fetchGoogleContacts(accessToken: string): Promise<GoogleContact[]>

// Phase 2
export async function getValidToken(userId: string, region: string): Promise<string>
export async function refreshAccessToken(refreshToken: string): Promise<{ access_token, expires_in }>

// Phase 3
export async function fetchCalendarEvents(accessToken: string, timeMin: Date, timeMax: Date): Promise<CalendarEvent[]>

// Phase 5
export async function fetchGmailThreads(accessToken: string, emailAddresses: string[]): Promise<GmailThread[]>
```

---

## Verification for each phase

**Phase 1:** Sign in with Google → Settings → click "Import from Google Contacts" → Google consent screen appears → return to Settings → preview modal shows contacts → confirm → contacts appear in /people

**Phase 2:** Sign in with Google → check DB `oauth_tokens` table has a row for the user with non-null `access_token`; wait for expiry window, trigger a Phase 3 sync → token is transparently refreshed (check `updated_at` advances)

**Phase 3:** Connect Calendar → Settings → "Sync Google Calendar" → interactions appear with `type='meeting'` on /interactions; run sync again → no duplicates created (external_id constraint)

**Phase 4:** Settings → "Import from Gmail contacts" → Google consent → contacts return that weren't in Google Contacts proper

**Phase 5:** Connect Gmail → "Sync Gmail" → email threads with known Heli contacts appear as interactions with `type='email'`

---

## Files touched across all phases

| File | Phases | Status |
|---|---|---|
| `src/lib/server/auth.ts` | done (`registerWithGoogle`, `isNewGoogleUser`) | ✓ done |
| `src/routes/auth/google/callback/+server.ts` | done (pending cookie + new-user redirect) | ✓ done |
| `src/routes/auth/complete-signup/+page.server.ts` | done | ✓ done |
| `src/routes/auth/complete-signup/+page.svelte` | done | ✓ done |
| `src/lib/server/schema.ts` | 2, 3 | pending |
| `src/lib/server/migrate.ts` | 2, 3 | pending |
| `src/lib/server/google.ts` | 1, 2, 3, 4, 5 (new, built incrementally) | ✓ Phase 1 done |
| `src/routes/auth/google/contacts/+server.ts` | 1 (new) | ✓ done |
| `src/routes/auth/google/contacts/callback/+server.ts` | 1 (new) | ✓ done |
| `src/routes/auth/google/calendar/+server.ts` | 3 (new, stores tokens here) | pending |
| `src/routes/auth/google/calendar/callback/+server.ts` | 3 (new, stores tokens here) | pending |
| `src/routes/auth/google/gmail-contacts/+server.ts` | 4 (new) | pending |
| `src/routes/auth/google/gmail/+server.ts` | 5 (new, stores tokens here) | pending |
| `src/routes/auth/google/gmail/callback/+server.ts` | 5 (new, stores tokens here) | pending |
| `src/routes/api/import/+server.ts` | 1, 4 (new) | ✓ Phase 1 done |
| `src/routes/api/sync/calendar/+server.ts` | 3 (new) | pending |
| `src/routes/api/sync/gmail/+server.ts` | 5 (new) | pending |
| `src/routes/settings/+page.server.ts` | 1, 2, 3, 4, 5 | ✓ Phase 1 done |
| `src/routes/settings/+page.svelte` | 1, 2, 3, 4, 5 | ✓ Phase 1 done |
