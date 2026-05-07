# Gusto UX/UI scan

Calibrated for: **indie professional / founder tracking ~50–500 contacts**. Two passes — functionality first, design polish second. Inside each, P0 → P1 → P2.

This is a working memo, not the spec. Treat it as a punch list to pick from after Phase 5 and before Phase 6 ship.

---

## Functionality

### P0 — these break the core promise

**1. Paste-a-link enrichment is invisible after redirect.** The signature feature: paste link → see a real entity. But `SaveBar` redirects to `/people/[id]` *before* enrichment finishes (it's fire-and-forget). The detail page shows a "Enriching…" spinner once, then never updates. The user has to manually refresh to see the name/avatar/role appear. For an indie professional saving someone they just met, the first impression is "I pasted a link and got 'satyanadella' with no avatar." This needs polling or SSE while `source==='parsing'`. Recommended: 1.5s `setInterval` calling `invalidateAll()` until source flips to null, with a 30s ceiling. The dashboard's "Recently saved" has the same problem.

**2. No bulk capture path on first save.** First-time user on the empty dashboard has one CTA: "Paste a link." Great for one. But an indie founder onboarding 200 contacts from LinkedIn or a Notion list will paste, wait, paste, wait — friction multiplies. We removed CSV import from scope, which I think is the right call, but we should compensate: let the SaveBar accept multi-line input and queue saves (one POST per line, sequential, surface progress in a toast like "Saving 7 of 23"). This is a "surprisingly useful extra" that fits the spreadsheet replacement story.

**3. Reminders don't actually remind anyone.** They appear in the sidebar popover and that's it. For an indie user this is the difference between "I'll remember to follow up with that investor" and forgetting. v1 has zero delivery. Even cheapest path — render the popover badge in red when there's an overdue item, and the document.title — would make this useful. SSE/email/push are bigger lifts; do the cheap visible signals first.

**4. Mobile sidebar is broken.** Spec says "collapsible on <768px" but `+layout.svelte` just hides the sidebar at narrow widths via no breakpoint logic — actually looking again, the sidebar isn't in a responsive container at all. The whole `flex w-48 shrink-0` is always visible, which on a phone makes the main content pinched. For an indie professional the "share to Gusto from my phone" flow lands on a layout that's broken before they see the data. Either drawer-style overlay or hide-with-toggle.

**5. No way to discover keyboard shortcuts.** `?` opens `ShortcutHelp`, but a new user doesn't know `?` exists. The HelpCircle icon in the topbar is hidden on mobile (`hidden …sm:inline-flex`) and a stick-thin glyph on desktop. The whole "keyboard-first" promise is invisible. Recommend: small "Press ? for shortcuts" hint in the dashboard onboarding, plus the existing icon needs a clearer affordance.

### P1 — meaningful papercuts

**6. SaveBar UX is sparse on errors.** Errors surface as `"Couldn't save (parse_failed)"` — the error code leaks into the toast. The user has no idea what `parse_failed` means. Map known codes (`parse_failed` → "That link looks malformed", `private_address` → "That link points to a private network", `bad_scheme` → "Only http(s) links can be saved", `rate_limited` → "Slow down a sec", etc.) — same map used in `/save/+page.svelte`, just hoisted to a shared helper.

**7. Dedup feedback is weak.** On dedup, SaveBar shows "Already saved — opening it" and goes to the existing entity. Good. But once landed, there's nothing to indicate *why* you're there. Especially confusing if the user pasted a similar URL and got matched to a totally different existing entry. Show a small banner on the detail page: "You already saved this." with a "What changed?" hint. Could leverage `?dedup=1` (already in `/save`) — extend to SaveBar too.

**8. Save flow can't go back.** After SaveBar redirects to `/people/[id]`, there's no "undo" or "discard" affordance. If the user pasted by accident, they have to hit Delete and confirm. A "Just saved" inline banner with "Undo" (5s grace) on the freshly-created stub would be in keeping with the rest of the toast pattern.

**9. Settings page has the bookmarklet but no "test it" affordance.** A user adds the bookmarklet, then has no idea if it worked until they happen to be on a webpage and click it. Recommend: a "Try it on this page" button right under the drag affordance, which does the bookmarklet's redirect on the current Gusto Settings tab — but only as a smoke test, with a toast saying "Looks good — drag to your bookmarks bar to use it elsewhere."

**10. Notes editor dual-mode is confusing.** `NotesEditor` shows a dashed-border-on-hover button when not editing — but it's a low-affordance "click anywhere here" pattern. New users won't know notes are clickable. Either show a small pencil icon at the corner on hover, or a permanent placeholder "Click to add notes" that's unambiguous.

**11. Inline name editing doesn't auto-save on blur.** On `/people/[id]`, name editor commits on Enter or blur — *but* if the input loses focus to the favorite/archive buttons in the header, the save races with their click. This is a subtle race I noted in Phase 4 around PersonPicker; same root cause. Verify this works with a real click-test before shipping.

**12. CommandPalette doesn't scope by type.** Today `cmd-K stripe` returns Stripe (company) and any person whose name contains "stripe". Useful for sniffing. But for an indie user who knows what they're looking for, scope filters help: `cmd-K p:satya` for people, `cmd-K c:stripe` for companies, `cmd-K i:meeting` for interactions. Optional, but a real time-saver once you have 500 contacts.

**13. Empty "Recent interactions" + "Recently saved" don't render anything on the dashboard.** A brand new user on the dashboard sees **only** the three count cards (all 0) and the welcome line. No further guidance, no "save your first link" CTA below that explains *what to paste*. The Landing page does this well; the signed-in dashboard should mirror it on first-run.

**14. No way to add a tag to an entity from the list page.** TagInput only lives on the detail page. To tag someone you have to: open detail → focus tag input → type → save → back. Bulk-tagging 20 people is brutal. Even a small inline tag chip "+ tag" on each list row, opening a popover, would be a big win.

**15. Auth `?next=` round-trip works for `/save` but not for any deep link.** If a logged-out user hits `/people/abc123` (e.g. clicked a reminder link in another tab), they get redirected to `/auth` with no `next=`, so they end up on the dashboard. Move the "preserve next" behavior into `hooks.server.ts` for protected routes.

**16. No favicon shown for companies on the EntityRow when the favicon lives at `faviconUrl` not `logoUrl`.** I verified — `EntityRow` renders `avatarUrl`, but the companies list page passes `company.logoUrl || company.faviconUrl`. That part's fine. But on `/people/[id]` the linked-company chip doesn't render a logo at all — just text. Small but noticeable gap with Stripe etc.

### P2 — nice but not yet

**17. Sort dropdown on People/Companies isn't exposed in UI.** Server reads `?sort=`, but no select control. Adding "Recent / Name / Last interaction" toggle would help once you have 200 people.

**18. Pagination (200 hard cap, no cursor).** For an indie founder this won't bite for a long time; defer.

**19. Tag management UI.** `/api/tags/[id]` exists for delete but has no UI. Once a user accumulates typos like "vip" / "VIP" / "v.i.p", they need a "Manage tags" page. Settings is the natural home.

**20. CSV export naming.** Filename is `gusto-people-2026-05-07.csv`. Good. But no UTF-8 BOM, which Excel needs to render names with diacritics correctly. One-line fix.

**21. Custom `+error.svelte`.** SvelteKit's default boundary works but doesn't match the brand.

---

## Design / polish

### P0 — first impressions

**22. Brand expression is thin on the Landing.** The hero is just a tagline + two CTAs + four trust pills. Compared to "delightful" examples (Linear, Cron, Cal), Gusto's landing is muted to the point of unmemorable. The landing is the only chance to communicate the personality before someone signs up. Suggestions, in order of leverage:
- Add a screenshot or animated-loop GIF of the **paste-a-link → enriched profile** flow. That's the one thing that distinguishes Gusto from a spreadsheet, and we don't show it.
- Use the violet brand accent more deliberately — currently it's just on the small square logo and the CTA button. The hero text could have a single accent word or a subtle gradient.
- The "Open source · self-hostable" pill at the top links to `https://github.com/` (literally — no path). Either fix the URL or drop the link.

**23. Dark mode is plumbed but not toggled.** `app.html` reads `localStorage.theme` but there's no UI to set it. Spec calls for a `ThemeToggle.svelte` in the topbar. For a "private/lightweight/calm" tool, dark mode is table-stakes — every Linear/Cron/Notion user expects it.

**24. Settings page has no visual rhythm.** All five sections look the same: bordered card, header, content. Stacked vertically they feel like a long form rather than distinct destinations. Consider:
- Section dividers with subtle accent strips (`border-l-4` in the section's intent color: bookmarklet=product, export=info, account=neutral, danger=danger).
- A two-column layout on desktop where left is account/sessions and right is bookmarklet/export — bookmarklet should be hero-prominent because it's the unique value.

**25. Topbar feels cluttered on desktop.** Logo, SaveBar (full width), search button, ?, settings, username, sign out — that's 7 things competing. The username text is doing nothing useful (it's also in Settings). Fold the meta items behind a single user menu: avatar/initial → dropdown with username, settings, sign out, ?, "Search (cmd-K)".

### P1 — polish

**26. Color hierarchy is flat.** Almost everything is `--color-text`, `--color-muted`, or `--color-subtle`. Without strong hierarchy, scanning a long list takes effort. Specifically:
- Entity names should be heavier (`font-semibold` not just `font-medium`) on detail pages.
- Sub lines (role / domain / time) should drop to `--color-subtle` not `--color-muted` to create more contrast.
- Tag chips on rows are tiny (`text-[10px]`) and pile up — they read as noise. Limit to first 3 + "+N more".

**27. Spacing rhythm is inconsistent.** Some pages use `gap-4`, `gap-6`, `gap-8`; some use `mt-2`, `mt-3`, `mt-4`. Pick a 4-step scale (4, 8, 16, 32) and enforce.

**28. Buttons aren't a system.** Settings has primary (violet bg) and secondary (border). Detail pages have icon-only ghost buttons. List pages have outline buttons. None share a base class. Define a small `Button.svelte` with `variant="primary|secondary|ghost|danger"` and `size="sm|md"` — usage feels enforced.

**29. Form inputs have inconsistent height.** Settings inputs are `py-2`, list search bars are `h-9`, picker chips are `py-0.5`. Pick one — `h-9` reads cleanest on rows.

**30. Lucide icons are sometimes mismatched.** `Bell` for reminders is fine. But `MessagesSquare` for Interactions reads as "messaging" not "interactions broadly" (some are calls). `Activity`, `History`, or `Clock` reads better. Same for `Sparkle` (other type) — `MoreHorizontal` is more accurate.

**31. Hover transitions are abrupt.** Entity rows snap from transparent → surface on hover. Spec said 0.15s ease — confirm `transition-colors duration-150` is on every interactive element. Currently inconsistent.

**32. Avatar fallback is bland.** `(name[0] ?? '·').toUpperCase()` on a gray-on-gray circle. For an indie user looking at a list of 50 people, color helps recognition. Generate a per-id deterministic background hue (cuid2 → hash → HSL) so each person/company has a stable color identity.

**33. No empty-state illustrations.** Empty states are functional ("No people yet. Paste a link…") but not warm. A small SVG (single-color, brand-violet) for each empty state — a person silhouette, a building, a chat bubble — adds personality without bloat. Lucide ships these in their library at the same stroke weight.

**34. Toaster has no slide-in animation.** Spec calls for "slide-in 6px → 0 over 0.15s". Not wired.

**35. Theme color flash in dark mode.** `app.html` runs the theme script, but the CSS uses `[data-theme='dark']` selector — verify that `dataset.theme` is set fast enough that there's no light flash. If you see flash, switch the script to set `documentElement.classList` and use `.dark &` selectors (Tailwind 4 supports this natively).

### P2 — finishing touches

**36. Loading skeletons.** List pages have no loading state — the user sees the page navigate, then content pops. For a calm tool, skeletons (gray placeholder rows) read as "yes, working on it" and prevent layout jank.

**37. Add a "Just-now" badge on freshly-saved rows.** For 30s after creation, a tiny green "new" pill on the EntityRow makes the save feel acknowledged.

**38. The Geist font is loaded but I don't see Geist Mono.** The spec calls for `--font-mono: 'Geist Mono'` but no `@font-face` for it. Inline code (kbd, hex strings) renders in `ui-monospace` system fallback. Either ship Geist Mono too or remove the variable.

**39. Settings icon placement is awkward.** Mid-topbar between Help and username. It's a destination, not an inline action — should sit at the far right next to Sign out, or fold into the user menu (#25).

**40. Single-page favicon.** `static/icons/icon-192.png` is "solid violet" per progress.md. Fine for now, but a stylized "G" or a small mark elevates the bookmark and tab presence by a lot. Cheap to do once with a real designer or a quick AI tool.

---

## Recommended order of attack

Bundle these into a "Phase 5.5: polish & delight" sprint **before** Phase 6 ship:

**Week 1 — functional must-haves (1, 4, 5, 6, 13, 23, 25)**: enrichment polling, mobile layout, theme toggle, dashboard onboarding hint, error message map, topbar consolidation. Each is small and obvious.

**Week 2 — capture flow polish (2, 3, 7, 8, 9, 14)**: bulk paste, reminder visual signals, dedup banner, "undo save" 5s window, "test bookmarklet" button, list-row tag chip. These compound into a "this app gets out of my way" feeling.

**Week 3 — design system (24, 26, 27, 28, 29, 31, 32)**: settings rhythm, color hierarchy, spacing scale, button component, hover consistency, deterministic avatar colors. This is where it goes from "functional" to "delightful."

**Week 4 — landing & finish (22, 30, 33, 34, 36, 40)**: hero polish, icon swaps, empty-state SVGs, toast animation, skeletons, real favicon. The story you tell to a stranger.

Phase 6 (README, CI, deploy) goes after that. Shipping the current state would be functional but indistinguishable from a side project — these passes are what make it feel like a product an indie professional would actually keep open in a tab.

The single highest-leverage fix is **#1 (enrichment polling)** — it's the moment that defines whether the app feels magical or broken.
