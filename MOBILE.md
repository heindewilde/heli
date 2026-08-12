# The Heli mobile app

An Expo (React Native) app for iOS and Android, living in `mobile/`. It is a
first-class client of `/api/v1` — the same public API a third party would use —
and it shares real modules with the web app rather than reimplementing them.

This document is the "why", the way `CLAUDE.md` is for the web app. Read it
before changing anything under `mobile/`, or anything in `src/lib/` that
`mobile/tsconfig.json` lists.

---

## Running it

```bash
cd mobile
npm install
npm run tokens         # generates src/theme/tokens.ts from ../src/app.css
npx expo run:ios       # or: npx expo run:android
```

The first iOS build runs `pod install` and compiles the native project, so it
takes several minutes and a fair amount of CPU. After that, `npx expo start`
attaches to the existing build in seconds.

**A dev build, not Expo Go.** The share extension, notifications and SecureStore
are config plugins with native code, so Expo Go cannot run this app.

**If `expo run:ios` asks for a signing certificate**, it has selected a
connected physical device. Unplug it, or build for the simulator explicitly:

```bash
cd mobile/ios
xcodebuild -workspace Heli.xcworkspace -scheme Heli \
  -configuration Debug -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath ./build CODE_SIGNING_ALLOWED=NO
```

To pair it: run the web app, open **Settings → Devices**, press *Pair a device*,
and type the code into the app. On the simulator the server URL needs to be
reachable from it — `http://localhost:5173` works, since the simulator shares
the host's network.

### Developing against `expo start --web`

`expo start --web` renders the same app through react-native-web and costs a
fraction of a simulator, which makes it a good way to check screens, routing and
API wiring. Three things do not work there, all for the same reason — they are
native modules:

| | Why | Handled |
|---|---|---|
| SecureStore | no web implementation | falls back to `localStorage`, **web only**, see `api/credentials.ts` |
| Notifications | no native module | guarded; the app is quiet rather than throwing |
| **The SQLite mirror** | `expo-sqlite`'s WASM backend needs cross-origin isolation (COOP/COEP), which the dev server does not send | **not handled** — lists stay empty on web |

The last one is the limit of what web can verify. Everything up to it — pairing,
the API client, auth headers, navigation, layout — is real; anything that reads
from the mirror is not. Use a simulator or a device for that.

The app must also be allowed through CORS to talk to a local server, since a
browser sends an `Origin` and a phone does not:

```bash
EXTENSION_ORIGINS=http://localhost:8085 node build/index.js
```

`scripts/dev-pair.ts` mints a pairing code without going through Settings:

```bash
DB_PATH=/tmp/heli-dev/dev.db npx tsx scripts/dev-pair.ts
```

**What still needs your accounts:** EAS builds and store submission (Expo,
Apple, Google), and push *delivery*, which needs APNs/FCM credentials in EAS
and a physical device — the simulator cannot receive a notification at all.

---

## The isolation, and why it is not an npm workspace

`mobile/` follows the `extension/` precedent exactly: its own `package.json`,
its own `node_modules`, its own TypeScript version, its own release cadence.

A workspace would make the app's `npm ci` install React Native's dependency
tree and carry it into the Docker builder layer. The extension avoids that for
esbuild's handful of dev dependencies; here the tree is an order of magnitude
larger, and it would land in the closure `adapter-node` externalises against and
`scripts/check-budget.ts` measures.

The guards, all of which matter:

| Guard | Why |
|---|---|
| `mobile` in `.dockerignore` | the Dockerfile does `COPY . .` |
| `"exclude": ["extension", "mobile"]` in the root `tsconfig.json` | note this array *replaces* the extended one |
| svelte-check runs off `.svelte-kit/tsconfig.json` | its `include` only covers `src/`, `test/`, `tests/` |
| a separate `mobile` job in `.github/workflows/ci.yml` | the cost of the above: `npm run check` cannot type-check this app |

**No Expo dependency may ever enter the root `package.json`.** It would move
`check-budget.ts`'s `prodPackages`/`prodBytes` and can trip `check-externals.ts`.

---

## Metro, and the two settings that are load-bearing

```js
config.watchFolders = [path.join(repoRoot, 'src', 'lib')];
config.resolver.blockList = /…\/heli\/node_modules\/.*/;
config.resolver.nodeModulesPaths = [path.join(projectRoot, 'node_modules')];
```

**`watchFolders` is `src/lib`, not the repo root.** Metro refuses to resolve a
file outside `projectRoot` unless it sits under a watch folder, which is what
makes `import { cleanUrl } from '../../src/lib/cleanUrl'` work at all. Watching
the whole repo would additionally pull the app's `node_modules`, `build/`,
`.svelte-kit/` and `data/*.db` into Metro's file map — a slow start, and a
resolver that can see packages this bundle must never contain.

**The root `node_modules` is blocked, not merely deprioritised.** Without it a
package missing from `mobile/node_modules` resolves out of the app's closure
instead: it works on the machine that has it and produces a broken bundle
everywhere else — the mobile equivalent of what `check-externals.ts` prevents on
the server.

**`disableHierarchicalLookup: true` is the wrong lever and was tried first.** It
also stops Metro descending into *nested* `node_modules`, and Expo's own tree
relies on them — `node_modules/expo/node_modules/expo-asset` is not hoisted, so
the bundle failed on the first import inside `expo` itself. Blocking one
absolute path keeps nested resolution working while closing the only hole that
matters.

**`mobile/.npmrc` sets `engine-strict=false`.** The repo root sets it true and
npm reads `.npmrc` upward from the install directory; several packages in the
Expo tree declare engine ranges that would fail `npm ci` here for no reason.

---

## Shared code

Modules are **imported by relative path and never copied** — the arrangement
`extension/src/content.ts` already uses. The list lives in one place,
`mobile/tsconfig.json`'s `include`, because that file has to name every module
for type-checking anyway.

`scripts/check-shared.ts` runs in `npm run check` and enforces three things:

- **A** — every shared module imports only other shared modules or `node:`
  builtins. No packages, no `$lib`/`$app`/`$env` aliases.
- **B** — `mobile/` only reaches into `src/lib` for modules on the list.
- **C** — nothing under `mobile/` is a *copy* of a shared module.

Rule A is the one that will bite. **A shared module must stay dependency-free**,
because the Metro blockList leaves it no fallback resolution — and the failure
would surface only in the mobile CI job, in a different install, long after a
change that looks entirely reasonable in the web app. The lint runs next to the
web code being edited so that never happens.

Three refactors were needed to make the current list portable, and they are the
template for the next one:

1. **Split data from `lucide-svelte`.** `interactions.ts` became
   `interactionMeta.ts` (labels, `dayBucket`, `formatTime`, `formatLastSeen`,
   the date-input helpers) plus an icon map; `collectionIcons.ts` became
   `collectionIconNames.ts` plus a map. The same split the codebase already made
   for `cleanUrl` and `projectTypes`.
2. **Export token *names*, not `var()` strings.** `stageColors.ts`,
   `priority.ts` and `statuses.ts` now export the custom-property name, and the
   `var()` maps are derived from it. A `var()` reference needs a cascade; React
   Native has none.
3. **Relative imports inside shared modules.** `outreach/platforms.ts` imported
   `$lib/interactionTypes`; Metro has no such alias.

**One thing that must not be "tidied":** `TYPE_META`'s tone strings in
`interactions.ts` are literal Tailwind classes (`text-[var(--color-info)]`) that
duplicate `TYPE_TONE_TOKEN` in `interactionMeta.ts`. Tailwind v4 extracts
classes by scanning source text, so building them from the token map would
type-check, pass every test, and ship every icon with no colour.

---

## Design tokens

`scripts/tokens.mjs` (repo root) parses `src/app.css` once and serves both
satellites. `extension/scripts/tokens.mjs` re-exports it and emits CSS;
`mobile/scripts/tokens.mjs` emits `mobile/src/theme/tokens.ts` — gitignored,
rebuilt by `npm run tokens`, which `prestart` and `typecheck` both run.

The parser's hard-won details are documented in that file and are not
negotiable: strip comments first, brace-count to the true block end, skip
matches where `;` precedes `{`, and search the **single-quoted**
`[data-theme='dark']` spelling. Each corresponds to a real failure that shipped
the wrong palette silently.

What the mobile emitter has to convert, because RN's style parser rejects it:

| From | To | Where |
|---|---|---|
| `rgb(37 99 235 / 0.40)` | `rgba(37, 99, 235, 0.4)` | `--color-interactive-ring`, `--color-row-hover` |
| `hsl(200 35% 58%)` | `#6ea0b9` | all 24 `--stage-*` |
| `0.5rem` | `8` | `--radius-*`, `--text-*` |
| `cubic-bezier(...)` | `[0.22, 1, 0.36, 1]` | `--ease-*` |

The space-separated `rgb()` form fails by rendering **nothing** rather than
throwing, which is why `color()` in the emitter asserts nothing unconverted
escapes.

**Shadows are not generated.** `--shadow-panel` is three stacked layers
including an inset ring; RN expresses one, and iOS and Android disagree about
that one. `mobile/src/theme/elevation.ts` is hand-written against the three
*role* names, and the emitter **throws** if `app.css` grows a role it does not
implement. A build failure is right: a missing shadow is invisible in review and
reads as a deliberate flat style.

Note `--text-xs` is 13px and `--text-sm` is 15px — not Tailwind's defaults.
Generating the scale is the only way that stays true.

---

## Devices: how the app authenticates

A paired device is **closer to a session than to an API token**, and the
`devices` table reflects that.

`api_tokens` is workspace-scoped: a NOT NULL `workspace_id`, membership in both
`TENANT_TABLES` and `PERSONAL_TABLES`, and deletion when its owner leaves that
workspace. A phone cannot work that way — it has to follow its owner across
every workspace they belong to, the way a browser session does.

So `devices` has **no `workspace_id` column at all**, and is in **neither**
`TENANT_TABLES` nor `PERSONAL_TABLES`. Consequences worth stating:

- **Removing a member does not unpair their phone.** The membership row
  disappears, the per-request lookup fails for that workspace, and the device
  goes on working in the others. `reassignAuthorship` never sees it, because
  there is nothing workspace-owned to hand over.
- **`deleteAccount` cleans up via the `user_id` cascade**, alongside sessions.
- **`devices.last_workspace_id` and `device_pairings.workspace_id` carry no
  foreign key.** A device outlives the workspaces it visits, and an FK would
  make `deleteAccount`'s purge of a sole-owner workspace fail on a row that is
  only a UI hint. `sessions.active_workspace_id` is nullable for the same reason.

**Which workspace a request acts in comes from `X-Heli-Workspace`**, falling
back to `last_workspace_id` and then to the default membership. The role is read
from the membership row on every validation, exactly as for a session and a PAT.
Not a member → **403, never 404** — a 404 would confirm which workspace ids do
not exist.

**The LRU is keyed `<tokenHash>:<workspaceId>`.** Keying by hash alone would let
a role cached for workspace A answer a request for workspace B.

**Token format is `heli_<region>_dev_<43 base64url>`, and the tail length is
pinned at 43.** base64url contains both `d` and `_`, so a PAT body *can* begin
`dev_` — but a PAT body is 43 characters and a device body is 47. Do not loosen
`{43}` to `+`; it is the same class of bug as the `split('_')` one `tokens.ts`
documents.

### Pairing

Cookie session → `POST /api/v1/pairing` mints a 50-bit code (Crockford base32,
no I/L/O/U), TTL 120s, single-use, stored as a SHA-256 hash. The QR encodes
`https://<origin>/pair#c=<code>`.

- **The code is in the fragment**, which browsers never send to a server — so a
  live credential cannot reach an access log, a `Referer`, or a proxy trace.
- **The origin travels inside the payload**, which is what makes this work for a
  self-hoster with no typing.
- **Single use is a conditional UPDATE confirmed by `rowsAffected === 1`** — the
  same pattern as the scheduler lease. The loser's freshly-minted device row is
  deleted rather than left live.
- **`claim` is the only unauthenticated endpoint in the app.** Every failure
  returns the same 404 with the same message; distinguishing them would make it
  an oracle for which codes exist.

**No bearer credential can manage credentials.** `denyBearer` blocks both PATs
and devices on `/api/v1/tokens*`, `/api/v1/pairing*` and `/api/v1/devices`. A
stolen phone is exactly the case where the web must be the only place that can
issue a replacement or revoke it. The one exception is
`PATCH|DELETE /api/v1/devices/self`, which acts on `locals.token.id` and takes
no id parameter, so a device can register its push token and sign *itself* out
and nothing more.

---

## The QR encoder

`src/lib/server/qr.ts`, hand-rolled — byte mode, EC level M, versions 1–10. The
repo already hand-rolls PNG decoding in `extension/scripts/resize.mjs` for the
same reason.

It runs **server-side** and returns a `boolean[][]` that the settings page draws
as `<rect>` elements. An encoder in the browser bundle would be measured by
`check-budget.ts` on every page, for a screen most people open twice; a grid also
means no `{@html}` and so no sanitize question.

**Its failure mode is unusually nasty.** Every bug found while writing it
produced a matrix that looks exactly like a QR code — right size, three finders,
plausible noise — and that no scanner will read. Two are pinned in
`tests/qr.test.ts` by name:

1. The finder's white **separator** was painted dark wherever it crossed the
   `c === 0 || c === 6` edge test. Finders are located *by* their separator.
2. The 15-bit format string was written **least-significant bit first**. The code
   then advertises the bit-reverse of the mask actually applied.

The fixture in that test is a full matrix verified to decode by a real scanner.
That is the check that would have caught both, and it needs no dependency.

---

## What makes it feel native rather than ported

The API work is most of the *lines*; this section is most of the *difference*.
Each of these is a small decision that is invisible when right and unmistakable
when wrong.

**Press feedback is a spring, not a fade.** `ui/Pressable` scales 2–3% on the UI
thread via Reanimated. `TouchableOpacity`'s default fade reads as something
switching off rather than being pressed, and a web app signals "pressable" with
hover, which a finger does not have.

**`ui/Screen` reimplements the iOS large title properly.** It scrolls away with
the content rather than on a threshold, the compact title fades in as it goes,
and the hairline appears only once something is behind it. Native driver, so it
tracks the finger instead of arriving a frame late.

**`ui/SwipeRow` reveals its action behind the row**, arms past a threshold, and
buzzes *at* the threshold rather than on release — so a swipe can be made
without watching. `activeOffsetX` is what stops it fighting the vertical scroll.

**Haptics are used by meaning, sparingly.** Nothing for navigation, where the
screen moving is the feedback. A tick when a value changes and the confirmation
is otherwise invisible. A notification pattern for errors. Android's selection
tick is a hard buzz on much hardware, so it stays iOS-only.

**Text goes through Dynamic Type**, capped at 1.4×. An app that ignores the
system text size is identifiable as a port on sight; an uncapped one turns a
list row into three lines of truncation, which helps nobody.

**Geist is cut into four static weights.** React Native selects a face by family
name and its variable-font weight behaviour differs across platforms — asking
for 600 can silently render 400. `Text` sets the family and *not* `fontWeight`
alongside it, or iOS synthesises a second bold on an already-bold face.

**The iOS icon has no alpha channel at all.** All-opaque is not enough: App
Store validation rejects an icon that merely has the channel, and it tells you
at submission. `mobile/scripts/icons.mjs` emits true RGB.

**Timers derive from `startedAt` on every tick** rather than incrementing. A
counter drifts when the JS thread is busy and stops entirely while backgrounded,
so a timer left running over lunch comes back an hour short.

**Search has a stale-response guard**, not just a debounce. Without it a slow
answer for "an" lands after a fast one for "anna" and the list flickers
backwards as you type.

**Permissions are requested at the point of use.** The notification prompt lives
in the reminders section, never at launch — a cold prompt on first run is the
fastest route to a permanent "Don't Allow", and iOS only lets you ask once.

**Screens read SQLite, never the network.** Fetching writes to the mirror and a
change bus repaints. That inversion is what makes offline a property of the app
rather than a mode it switches into.

## Things that do **not** transfer from the web app

- **The code-splitting hazard is Rollup's, not Metro's.** `CLAUDE.md` documents
  a production-only hydration crash caused by a second dynamic import above
  `RichText`, and rules about legacy-mode route nodes. Metro bundles a single
  graph; none of that applies. Do not cargo-cult it here — it would cost a
  feature for no reason.
- **`scripts/check-overlays.ts` hardcodes `ROOT = 'src'`** and will not see
  `mobile/`. The equivalent discipline is that there is exactly one overlay
  primitive, `Sheet`.
- **Popovers.** An anchored panel is a pointer idiom; every `Popover` call site
  becomes a bottom sheet. `Select`'s whole reason for existing on the web — that
  an OS menu ignored the theme — is not a complaint anyone makes about a phone,
  so the native control is right here.

## Things that **do** transfer

- **Never `invalidateAll()` to display something you already have.** The v1
  create endpoints return the finished row in list shape; insert it.
- **Optimistic with rollback**, mirroring `src/lib/client/listCache.svelte.ts`.
- **Rich text is the same Squire**, with `blockTag: 'P'` and the same
  `PASTE_TAGS`. Three of its four load-bearing properties fail silently.
- **Copy and "Mark as sent" stay two steps.** A queue is exactly where a
  one-click shortcut logs messages nobody sent.
- **Reminders are personal**; a push goes only to its owner's devices.

---

## Releases

`mobile/package.json` carries its own version, **independent of the repo root**.
Every push to `main` auto-bumps a `v*` tag and deploys the web app; coupling
would mean a store submission per web deploy. Mobile tags are `mobile-v*`, which
matches neither `fly-deploy.yml`'s `v[0-9]*.[0-9]*.[0-9]*` filter nor
`docker.yml`'s `v*`.

`app.config.ts` reads the version from `package.json` and the brand strings from
`src/lib/branding.ts` — the latter by *parsing* the file, because this config is
evaluated by Node before Metro exists and cannot import a `.ts` file from
outside its root.

**Server URL at first run.** One binary must reach `heli.so`, a self-hosted VPS
and `localhost`. The QR carries the origin so the common path involves no
typing; manual entry is the fallback, validated against the unauthenticated
`GET /api/health`.
