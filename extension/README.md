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

A token is needed rather than your session cookie because the cookie is
`SameSite=Lax` and will never be sent from `chrome-extension://…`. That is a
browser guarantee, not a limitation to route around.

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
