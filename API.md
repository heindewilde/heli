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

| | Limit |
|---|---|
| `GET` | 120 / minute |
| Everything else | 30 / minute |

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

| | |
|---|---|
| `GET /me` | Who this token is, which workspace, which scopes. |
| `GET /people` | `?q=` `?cursor=` `?limit=` (max 100) |
| `POST /people` | `{ name, url?, role?, companyId?, email?, phone?, location?, notes? }` |
| `GET /people/:id` | |
| `PATCH /people/:id` | Any of the above, plus `isFavorite`, `isArchived`. |
| `DELETE /people/:id` | |
| `GET /companies` | `?q=` `?cursor=` `?limit=` |
| `POST /companies` | `{ name, url?, industry?, location?, description?, notes? }` |
| `GET /search?q=` | Across people, companies, interactions, projects, collections, pipelines. |
| `GET /tags?scope=person\|company` | With usage counts. |
| `GET /lookup?url=` | Whether a URL is already saved. |
| `POST /capture` | One-shot save with tags and a note — see below. |
| `GET /tokens`, `POST /tokens`, `DELETE /tokens/:id` | Cookie session only. |

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
  new one.
