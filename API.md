# Heli API

A small, stable HTTP API over your workspace. It exists so you can script
against Heli, wire it into something else, or build your own capture — without
scraping the UI.

Everything lives under `/api/v1`. The rest of `/api/*` is the app's own private
surface: it changes whenever the UI does, it has no scope checks, and tokens are
rejected there on purpose.

## Authentication

Create a token in **Settings → Personal access tokens**. It is shown once.

```bash
curl https://your.heli/api/v1/me \
  -H "Authorization: Bearer heli_eu_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

There are two kinds of bearer credential, and they differ in one way that
matters: a **personal access token** is pinned to one workspace, while a
**paired device** — the mobile app — follows you across all of them.

A token:

- acts as **you**, in **one workspace** — the one that was active when you
  created it;
- can never do more than your role allows. Scopes only ever narrow further, and
  your role is read fresh on every request, so being demoted takes effect
  immediately without touching your tokens;
- stops working the moment you revoke it, or when you leave the workspace;
- cannot manage tokens. Minting and revoking are cookie-session only, so a
  leaked token cannot mint a replacement for itself.

Only a SHA-256 hash is stored. If you lose a token, revoke it and make another.

### Paired devices

The mobile app authenticates with a device credential, minted by pairing rather
than by pasting: **Settings → Devices** shows a QR containing
`https://<your-heli>/pair#c=<code>`. The code is single-use, expires after two
minutes, and lives in the URL *fragment* so it never reaches a server log.

A device token looks like `heli_<region>_dev_<43 chars>` and differs from a
personal access token in exactly two ways:

- it is **not bound to a workspace**. Send `X-Heli-Workspace: <id>` to choose
  one; omit it and the server uses the last one that device acted in, then your
  default membership. Naming a workspace you are not a member of is `403`.
  Every response echoes `X-Heli-Workspace` with the workspace actually used.
- **losing a membership does not unpair it.** That workspace simply stops
  answering, and the device keeps working everywhere else — the same way a
  browser session behaves.

Like tokens, a device cannot manage credentials: `/tokens`, `/pairing` and
`/devices` are cookie-session only, so a stolen phone cannot mint itself a
replacement. The one exception is `/devices/self`, which takes no id and can
only register a push token or sign that device out.

### Replay-safe writes

Send `Idempotency-Key: <8–200 chars>` on any `POST` and the response is stored
and replayed verbatim if the same key arrives again, with `Idempotent-Replay:
true`. Keys are scoped to your workspace and expire after 24 hours; only
successes are recorded, so retrying a failure re-runs it.

This exists for offline clients: the dangerous case is not a failed request but
an ambiguous one — the write landed, the response did not — where retrying is
the only correct move and would otherwise duplicate the record.

### Scopes

| Scope | Grants |
|---|---|
| `read` | Every `GET`. |
| `write` | Create, update and delete records. |
| `capture` | `POST /capture`, plus `GET` on `/me`, `/lookup` and `/tags` — exactly what the browser extension needs, and nothing else. |

`write` implies `capture`. `capture` implies `read` on those three endpoints
only: the extension has to verify its token, ask whether a page is already
saved, and offer tag suggestions, so a scope that could not do those would be
narrower than its own purpose. It does not reach `/people`, `/companies` or
`/search`.

A token missing the scope for a call gets `403` with
`{ "error": { "code": "forbidden", "message": "Token is missing the \"read\" scope." } }`.

### Rate limits

Keyed by **token**, not by user, so throttling a runaway script never locks your
browser session out of the app.

| | Token | Paired device |
|---|---|---|
| `GET` | 120 / minute | 600 / minute |
| Everything else | 30 / minute | 120 / minute |

A device is one person's app rather than a script: opening it after a week
offline replays a queue and fetches several lists at once, which is a burst
rather than abuse. Keyed by device, so one phone cannot throttle another.

Over the limit returns `429` with `Retry-After: 60`.

## Shape

Success is `{ "data": … }`. Paginated collections add `nextCursor`, which is
`null` on the last page:

```json
{ "data": [ … ], "nextCursor": "eyJ..." }
```

Errors are `{ "error": { "code": …, "message": … } }` with codes
`unauthorized`, `forbidden`, `not_found`, `invalid_request`, `rate_limited`,
`server_error`.

Pass `?cursor=` back verbatim to get the next page. Cursors encode
`(created_at, id)`, so inserts during pagination cannot make you skip or repeat
a row.

## Endpoints

Everything below needs `read` for `GET` and `write` for anything else, unless
noted. Endpoints marked **cookie only** reject bearer credentials entirely.

### Identity

| | |
|---|---|
| `GET /me` | Who you are, which workspace, your role, every workspace you belong to, and which kind of credential this is. |
| `DELETE /account` | Delete your account. Requires `currentPassword`, or `confirmEmail` for OAuth-only accounts. |

### Devices and pairing

| | |
|---|---|
| `POST /pairing` | **Cookie only.** Mint a pairing code. Returns `{ code, expiresAt, url, qr }`, where `qr` is a `boolean[][]` grid. |
| `GET /pairing/:code` | **Cookie only.** `pending` \| `claimed` \| `expired`. |
| `DELETE /pairing/:code` | **Cookie only.** Cancel it. |
| `POST /pairing/claim` | **Unauthenticated.** `{ code, deviceName, platform, appVersion }` → a device token. Single use, IP rate-limited. |
| `GET /devices` | **Cookie only.** Your paired devices. |
| `DELETE /devices/:id` | **Cookie only.** Unpair one. |
| `PATCH /devices/self` | **Device only.** `{ pushToken }`, or `null` to turn notifications off. |
| `DELETE /devices/self` | **Device only.** Sign this device out. |

### People and companies

| | |
|---|---|
| `GET /people` | `?q=` `?cursor=` `?limit=` (max 100) |
| `POST /people` | `{ name, url?, role?, companyId?, email?, phone?, location?, notes? }` |
| `GET /people/:id` | |
| `PATCH /people/:id` | Any of the above, plus `isFavorite`, `isArchived`. |
| `DELETE /people/:id` | |
| `GET /companies` | `?q=` `?cursor=` `?limit=` |
| `POST /companies` | `{ name, url?, industry?, location?, description?, notes? }` |
| `GET /companies/:id` | |
| `PATCH /companies/:id` | `name`, `industry`, `location`, `sizeBand`, `description`, `notes`, `isFavorite`, `isArchived`. |
| `DELETE /companies/:id` | |

### Interactions

| | |
|---|---|
| `GET /interactions` | `?q=` `?personId=` `?companyId=` `?type=` `?from=` `?to=` `?limit=` (max 100) |
| `POST /interactions` | `{ type, title, body?, occurredAt?, companyId?, personIds?, projectIds? }` — returns the finished row, not just an id. |
| `GET /interactions/:id` | |
| `PATCH /interactions/:id` | |
| `DELETE /interactions/:id` | |
| `POST /interactions/:id/people` | `{ personId }`. Idempotent. |
| `DELETE /interactions/:id/people` | `{ personId }` |

No cursor here: interactions order by `occurredAt`, and by relevance when
searching, so the `(created_at, id)` cursor does not apply. Narrow with filters.

### Reminders and tasks

| | |
|---|---|
| `GET /reminders` | **Yours only.** Reminders are personal, never shared. |
| `POST /reminders` | `{ kind, refId, remindAt }` where `kind` is `person` \| `company` \| `interaction` \| `project`. |
| `DELETE /reminders/:id` | |
| `GET /tasks?kind=&refId=` | Tasks hang off one record and are shared. |
| `POST /tasks` | `{ kind, refId, title, dueAt? }` |
| `PATCH /tasks/:id` | `title`, `dueAt`, `completed` (boolean). |
| `DELETE /tasks/:id` | |

### Vocabulary

| | |
|---|---|
| `GET /tags?scope=person\|company` | With usage counts. |
| `POST /tags` | `{ scope, entityId, name }` — creates the tag if new, then attaches. Idempotent. |
| `DELETE /tags?scope=&entityId=&tagId=` | Detach from one record. |
| `DELETE /tags/:id` | **Admin.** Delete the tag everywhere. |
| `GET /statuses?scope=` | |
| `POST /statuses` | `{ scope, name, tone }` |
| `DELETE /statuses?scope=&id=` | **Admin.** |

### Time

| | |
|---|---|
| `GET /time` | `?user=` (`me` default, or `all`) `?project=` `?from=` `?to=` `?billable=` — returns `{ items, running }`. |
| `POST /time` | Backfill a finished entry. |
| `PATCH /time/:id` | |
| `DELETE /time/:id` | |
| `POST /time/start` | Idempotent: returns the running entry with `alreadyRunning: true` and `200` if one is going. |
| `POST /time/stop` | Returns `null` when nothing was running — not an error. |

A running entry is simply one whose `endedAt` is null. There is no duration
field: both timestamps are stored and duration is derived, so they cannot drift.

### Projects and planning

| | |
|---|---|
| `GET /projects` | `?q=` `?status=` `?type=` `?sort=` — returns `{ items, total }`. |
| `POST /projects` | |
| `GET /projects/:id` | `?include=links,milestones,goals,allocations` for one round trip. |
| `PATCH /projects/:id` | Changing `billingType` **clears** the money columns that type no longer owns. |
| `DELETE /projects/:id` | |
| `GET /capacity` | `?weeks=` `?from=` — committed hours per person per week. |
| `GET /workspace/members` | Members with their weekly capacity. |
| `GET /workspace/capacity` | |
| `PATCH /workspace/capacity` | `{ userId?, weeklyCapacityMinutes }`. Your own is yours; a colleague's is admin-only. |

### Collections and pipelines

| | |
|---|---|
| `GET /collections`, `POST /collections` | |
| `GET`, `PATCH`, `DELETE /collections/:id` | |
| `POST /collections/:id/items` | `{ kind, refId }`. Idempotent. |
| `DELETE /collections/:id/items?kind=&refId=` | |
| `GET /pipelines`, `POST /pipelines` | |
| `GET`, `PATCH /pipelines/:id` | |
| `DELETE /pipelines/:id` | **Admin.** |
| `GET`, `POST /pipelines/:id/items` | |
| `POST /pipelines/:id/items/:itemId/move` | `{ toStageId }`. Idempotent — moving to the current stage is a no-op. |

### Outreach

| | |
|---|---|
| `GET /outreach` | `?q=` `?platform=` `?archived=` |
| `POST /outreach` | `{ name, platform, subject?, body, visibility?, nudgeDays? }` |
| `GET`, `PATCH`, `DELETE /outreach/:id` | |
| `POST /outreach/sent` | `{ templateId, personId, subject?, body?, remindInDays? }` — logs an interaction and optionally schedules a follow-up. |

Heli renders and logs messages; it never sends them. There is no send endpoint
and there will not be one — which is also why this works identically for
LinkedIn, X and WhatsApp, none of which expose a send API.

### Search, capture and calendars

| | |
|---|---|
| `GET /search?q=&perKind=` | Across people, companies, interactions, projects, collections, pipelines. |
| `GET /lookup?url=` | Whether a URL is already saved. |
| `POST /capture` | One-shot save with tags and a note — see below. |
| `GET /calendar` | Subscribed feeds, **always redacted**: the feed URL is a credential and is never returned. |
| `GET /tokens`, `POST /tokens`, `DELETE /tokens/:id` | **Cookie only.** |

`POST` with a `url` that already exists returns `200` and the existing record
rather than `201` and a duplicate — the same dedup rule the app itself uses.

### `POST /capture`

The browser extension's single write. One request carries the record, its tags
and an optional note, so a client does not have to fan out to three endpoints
and handle three partial failures.

```jsonc
{
  "url": "https://www.linkedin.com/in/ada",
  "kind": "person",        // optional; inferred from the URL
  "name": "Ada Lovelace",
  "role": "Engineer",
  "email": "ada@example.com",
  "tags": ["conference"],
  "note": "Met at the meetup — wants an intro to Grace."
}
```

Returns `{ id, kind, dedup, href, interactionId, row }`. The note becomes an
interaction; `interactionId` is `null` if you did not send one.

## Notes and caveats

- **Revocation takes up to 30 seconds to propagate to other server processes.**
  Validated tokens are cached in-process for 30s to keep a burst of calls from
  being one database read each. The process that handled the revoke drops its
  own entry immediately.
- **`lastUsedAt` updates at most hourly**, and never blocks a request. It is for
  recognising a stale token in Settings, not an audit log.
- **CORS** is closed by default. Set `EXTENSION_ORIGINS` to a comma-separated
  list (`chrome-extension://<id>`) to allow specific origins.
  `Access-Control-Allow-Credentials` is never sent — the only way in is an
  explicit bearer token, so a mistake in the origin list still cannot ride
  someone's session cookie.
- **One workspace per token.** To act on another, switch workspace and mint a
  new one — or pair a device, which carries `X-Heli-Workspace` per request and
  needs no second credential.
- **Push notification bodies are generic**, by design. Expo's relay, APNs and
  FCM are all third parties and this is a CRM, so "you asked to be reminded
  about someone you follow" traverses them and the name does not. The app
  fetches the detail when you open it.
