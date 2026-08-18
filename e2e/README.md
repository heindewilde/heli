# Browser tests

Vitest here is server-side only, and always has been — it calls helpers and
handlers, never a component. That gap let a real bug ship: a ticked row rendered
as unticked, because `preventDefault()` on a checkbox click makes the browser
restore `input.checked` after every handler has run. Six hundred passing tests
could not see it.

These run against a **production build**, not `vite dev`. The failure mode
CLAUDE.md documents at length — a lazily-imported component blanking every page
on hydration — appears only in a built app.

```
npm run build      # required: the specs boot build/index.js
npm run test:e2e
npm run test:e2e -- --ui        # pick through them interactively
npm run test:e2e -- --headed    # watch it drive
```

`global-setup.ts` seeds a temp database through the app's own `register()` and
`savePerson()`, writes the session id to `e2e/.state.json` (gitignored), and
`fixtures.ts` hands it to the browser as a cookie. Signing in through the form
would make every spec depend on the auth UI.

Every spec fails on a console error. That is deliberate: the hydration crash
throws once and leaves markup that still looks server-rendered, so an assertion
on visible text can pass while the app is dead.
