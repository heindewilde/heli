# Heli browser extension

One-click capture into [Heli](https://heli.so). Reads the page you are on,
shows you what it found, and saves it with tags and a note.

## Why it exists

The bookmarklet posts a URL to the server, which then fetches that URL itself.
For most of the web that is fine. For the pages people actually want to save it
is not: LinkedIn serves the server a sign-up wall, which is why
`src/lib/server/og.ts` keeps an `AUTHWALL_PATTERNS` list at all.

The extension reads the **rendered, authenticated** DOM in your own browser. It
sees what you see.

## Building

Deliberately separate from the app. It has its own `package.json` and its own
`node_modules`, is excluded from the root `tsconfig.json`, and is listed in
`.dockerignore` because the app's Dockerfile does `COPY . .`. It is **not** an
npm workspace — that would make the app's `npm ci` install these dependencies
and carry them into the Docker builder layer.

```bash
cd extension
npm install
npm run build     # or: npm run watch
```

Then load `extension/dist/` as an unpacked extension:
Chrome → Extensions → Developer mode → **Load unpacked**.

## Connecting

In Heli: **Settings → Personal access tokens**, create one with the `capture`
scope. In the extension's options page, paste your Heli address and the token.
The options page verifies both against `/api/v1/me` before storing them, so a
typo shows up there rather than as a mystery failure on your first capture.

`capture` on its own is enough. It covers `POST /capture` plus `GET` on `/me`,
`/lookup` and `/tags` — the three reads the extension performs before it can do
anything — and nothing else. It cannot reach `/people`, `/companies` or
`/search`.

A token is needed rather than your session cookie because the cookie is
`SameSite=Lax` and will never be sent from `chrome-extension://…`. That is a
browser guarantee, not a limitation to route around.

### Cross-origin

`/api/v1` answers a cross-origin caller only from an allow-listed origin. The
published extension's id is built into the server, so nothing to do there. A
build you loaded unpacked has a per-install id, so add it to `EXTENSION_ORIGINS`
on the server you are pointing at:

```
EXTENSION_ORIGINS=chrome-extension://<id>
```

The options page shows the exact string to use at the bottom. Without it every
request fails as `TypeError: Failed to fetch`, which is all the browser will tell
a page about a blocked request — the options page translates it.

## Testing before a release

There is no browser test runner here; the adapters are covered from the app's
suite (`tests/extension-adapters.test.ts`, `tests/extension-capture.test.ts`),
and everything else is verified by hand against a real Heli. Fixtures are fetched
HTML, i.e. pre-hydration, so a selector aimed at client-rendered content can look
dead in a test and work in the browser. That is what this pass is for.

```bash
cd extension
npm ci
npm run typecheck
npm run build
```

1. `chrome://extensions` → **Developer mode** → **Load unpacked** →
   `extension/dist/`.
2. Copy the extension's id from that page.
3. Start the app with the id allowed:
   `EXTENSION_ORIGINS=chrome-extension://<id> npm run dev`
4. In Heli, mint a token with **only** the `capture` scope.
5. Extension options → `http://localhost:5173` + that token → **Save**.

Then walk this list. Each line is a bug that has actually shipped:

- [ ] A `capture`-only token connects. (It used to 403 on `/me`.)
- [ ] The origin hint at the bottom of the options page matches the id in
      `chrome://extensions`.
- [ ] Unset `EXTENSION_ORIGINS`, restart, save again → the error names the env
      var, rather than `Failed to fetch`.
- [ ] A LinkedIn `/in/…` profile saves as a person, and the employer shows up on
      `/people/<id>` as *Works at …* with a link button. (The field used to be
      parsed, shown, and dropped.)
- [ ] Save the same profile again → "Already in Heli", one record, and an edit
      you made in the app survives.
- [ ] Clear a field before saving a second time → it is preserved, not blanked.
- [ ] A LinkedIn `/company/…` page saves as a company, description included.
- [ ] Stop the dev server, reopen the popup → the form still renders, without the
      "Already in Heli" banner. (It used to show an error page instead.)
- [ ] A page with no useful markup → empty editable fields, no error.
- [ ] `localStorage.__heli_debug = 1` in a page's console, then open the popup →
      the console lists which strategy filled each field. Anything unexpectedly
      empty is a rotted selector; fix the strategy list and add a fixture.
- [ ] `npm run package` produces `heli-extension-<version>.zip`, and the version
      inside matches `package.json`.

### Checking selectors without installing anything

`dist/content.js` is a self-contained IIFE that reads the page and assigns the
result to `window.__heliCapture`. So the parser can be checked against any live
page straight from DevTools — no unpacked build, no token, no server:

```js
// paste the whole contents of extension/dist/content.js, then:
__heliCapture   // → { kind, name, role, company, …, via: { name: 'jsonld:name', … } }
```

`via` names the strategy that filled each field. This is the only way to check
the selectors that target client-rendered markup, and it is worth doing on a
logged-in LinkedIn profile in particular — the hashed class names in
`src/adapters/linkedin.ts` are the most rot-prone code here, and logged-out
LinkedIn is an authwall, so no test fixture can cover them.

When a field comes back empty or `via` shows it fell through to a meta tag,
update that strategy list and save the trimmed markup as a fixture in
`tests/fixtures/`.

### Known state, last checked against live pages

| Site | Result |
|---|---|
| LinkedIn person | **Name, role, company, avatar.** No `og:`, no JSON-LD, no `<h1>`, all classes hashed — so everything hangs off accessibility markup: the profile link's `aria-label` for the name, the other `<p>` in that block for the headline, its ` at ` tail for the employer, `[aria-label="Profile photo"]` for the picture. `location` is deliberately left empty; see below. |
| LinkedIn company | Name, industry, location all resolve. Still on the older DOM. |
| GitHub user | Name, employer, location, avatar and bio all resolve from `itemprop` microdata and `og:image`. No `role` — a GitHub profile has no job title. |
| GitHub repo | Name and description resolve. Note the name element is `<strong itemprop=name><a>` before hydration and `<div itemprop=name>` after, so the selector matches on the attribute alone. |
| X | Name, bio, location and avatar resolve from `data-testid`. No `role`. |
| Generic | `og:site_name` / JSON-LD, else the hostname. A deep path deliberately does **not** use the page title. |

Two things are left empty on purpose rather than guessed. A LinkedIn person's
**location** has no semantic anchor — reaching it means counting paragraphs, and
that shape of guess is what once resolved "29M followers" as a company's location.
And the employer is taken from the headline rather than from the top card's
`/company/` links, because on a live profile those resolved to BlackRock,
Carhartt and Ford Motor Company: promoted content rendered in the same container.

**There is no JSON to intercept.** A LinkedIn profile load makes no API calls —
the page is 1.2 MB of server-rendered markup (`data-sdui-screen`,
`data-sdui-component`), so there is no Voyager payload for a `document_start`
script to capture. The DOM is the only source. Verified directly; don't spend a
day rediscovering it.

Re-run the check above when a capture starts arriving blank; the table is a
snapshot, not a guarantee.

## Permissions

`activeTab`, `scripting` and `storage` — no `<all_urls>`. The content script is
injected only when you open the popup, so Chrome describes the extension as
running on click, which is the truth.

## Adapters

`src/adapters/` holds one per site: LinkedIn, GitHub, X, and a generic
Open Graph + JSON-LD fallback.

Site markup rots. Every field therefore resolves through an ordered list of
strategies — JSON-LD, then Open Graph, then CSS selectors — first non-empty
wins, and **every parsed field is editable in the popup before saving**. When a
selector breaks, the field arrives empty and you type it; the extension does not
break.

To see which strategy produced which field, run `localStorage.__heli_debug = 1`
in the page's console and open the popup.

`cleanUrl` is imported from the app's `src/lib/cleanUrl.ts` rather than copied.
Those rules decide whether two spellings of a LinkedIn URL are the same record,
so the extension and the server have to agree exactly.
