# Heli Design System

Single source: `src/app.css` (`@theme` block, light) + `[data-theme='dark']`.

## Color strategy
**Restrained.** Warm tinted neutrals, ink-graphite accent. No hue branding. Light is the default register; dark mirrors with the same shape.

## Tokens (light → dark)
- `--color-bg` `#fbfbf9` → `#0e0e10`
- `--color-surface` `#ffffff` → `#17171a`
- `--color-surface-2` `#f5f4f1` → `#1f1f23` (headers, dividers, quiet panels)
- `--color-border` `#e8e7e3` → `#28282d`
- `--color-border-strong` `#d4d3ce` → `#3a3a40`
- `--color-text` `#17171a` → `#f3f2ee`
- `--color-muted` `#6b6b66` → `#9a9a94`
- `--color-subtle` `#9a9a94` → `#6b6b66`
- `--color-accent` `#17171a` → `#f3f2ee` (primary buttons, focus rings, true emphasis only)
- `--color-highlight-bg` `#f3f2ee` → `#1f1f23` (selected state)
- `--color-row-hover` `rgb(23 23 26 / 0.035)` → `rgb(255 255 255 / 0.045)` (very quiet)

Semantic: `danger`, `success`, `warning`, `info` — each with `bg` / `border` variants.

## Typography
Geist variable (sans), Geist Mono. Feature flags `ss01`, `cv11`. `.tabular` for numerics.

Type scale (steps ≥1.25 ratio):
- 11px / cap-label / uppercase / tracking 0.06em / weight 500 / color `--color-subtle` — table headers, micro labels
- 12px / weight 400 / `--color-muted` — secondary row text (role, domain, last seen)
- 13–14px / weight 500 / `--color-text` — primary row text (name)
- 16px / weight 500 — section headers in detail pages
- 24px / weight 600 / tight tracking — page titles (H1)

## Radii / shadow
- `--radius-sm` 6px (chips, small buttons), `--radius-md` 8px (cards, inputs), `--radius-lg` 12px, `--radius-xl` 16px.
- `--shadow-xs` table outline; `--shadow-sm` resting; `--shadow-md` hover/popover; `--shadow-lg` modal.

## Layout
- Spacing scale: 4 / 8 / 12 / 16 / 24 (Tailwind 1/2/3/4/6). Use multiples only.
- Tables: outer card `rounded-md border surface shadow-xs`. Header strip `bg-surface-2 px-3 py-2`. Rows `px-3`, comfortable 56px, compact 36px.
- Column gap `gap-3` (12px) for People, `gap-4` (16px) for Companies (fewer columns).

## States
- **Hover** (rows, list items): `--color-row-hover` wash. Barely perceptible.
- **Selected / keyboard cursor**: `--color-highlight-bg` solid. **No side-stripe accents** (banned).
- **Focus-visible**: 2px solid `--color-accent`, offset 2px. Globally applied.
- **Disabled**: opacity 0.4.

## Motion
- 150–200ms ease-out on color/opacity. Never animate layout properties. Never bounce.

## Iconography
Lucide-svelte only. Stroke width 2 (1.75 for ultra-fine). Sizes: 10/11/12/13/14/16. Icons match adjacent text optical center.

## Inline editing
All cell-level edits open compact popovers — never `window.prompt`, never modals, never new routes. Save on Enter, cancel on Esc, click-outside closes. Empty cells render a single muted `·`; the "set / add X" hint reveals only on row hover.

## Component conventions
- `StatusCell`, `PriorityFlag`, `RowTagAdder`, `CompanyDetailsCell` — share popover shell pattern: `border-border`, `rounded-md`, `shadow-lg`, `bg-surface`, top-aligned to the trigger.
- Tag chips: `rounded-full border-border bg-surface-2 px-1.5 py-0.5 text-[10px]`.
- Status pills: dot + label, tone-colored.
- Avatars: 36px round for people; CompanyLogo 36px (logo.dev) for companies.

## Bans (project + impeccable)
- No side-stripe borders or shadows.
- No gradient text.
- No glassmorphism.
- No `--color-accent` as background unless it's a true CTA (Save, Create).
- No new dependencies for cosmetic gains.
- No em dashes in copy.
