<script lang="ts" module>
  export type SelectOption = {
    value: string;
    label: string;
    /** Optional second line — a rate, a count, a hint. */
    hint?: string;
    disabled?: boolean;
    /** Options sharing a group render under one heading, in first-seen order. */
    group?: string;
  };
</script>

<script lang="ts">
  /**
   * The app's dropdown.
   *
   * This used to be a styled shell around a native `<select>`, and the comment
   * here argued that a custom listbox would mean re-implementing typeahead and
   * keyboard semantics to end up somewhere worse. That was true of the *panel*
   * and false of everything around it: `appearance-none` strips the platform
   * chevron but nothing can style the open option list, so every dropdown in
   * the app opened into an OS menu — grey, square-cornered, ignoring the theme,
   * and in dark mode plainly from another application.
   *
   * So the panel is ours now, built on `Popover` (which already owns
   * positioning, the top layer, and `layerStack` dismissal) and the keyboard
   * semantics are implemented properly below: arrows, Home/End, printable-
   * character typeahead, Enter to commit, Escape to cancel.
   *
   * **Touch keeps the native control.** A custom listbox on a phone is a real
   * downgrade from the OS wheel or sheet, so a transparent native `<select>` is
   * laid over the trigger and enabled only under `@media (pointer: coarse)`.
   * The branch is CSS, not JS: detecting the pointer at mount would mean
   * rendering one thing on the server and another on the client, which is a
   * hydration mismatch on every dropdown in the app.
   *
   * That native element is `aria-hidden` with `tabindex="-1"` on purpose — it
   * is a pointer target, not a second control. The accessible control is the
   * custom one, everywhere, so assistive technology sees exactly one combobox
   * whatever the device.
   *
   * `Combobox` remains the right answer when the list needs *searching*; this
   * is for a known, short set of choices.
   */
  import { ChevronDown, Check } from 'lucide-svelte';
  import type { Snippet } from 'svelte';
  import Popover from './Popover.svelte';

  type Size = 'sm' | 'md';

  type Props = {
    options: SelectOption[];
    value?: string | null;
    /** Fires with the new value. Also writes through `bind:value`. */
    onchange?: (value: string) => void;
    size?: Size;
    /** Borderless until hovered — for toolbar controls like a sort picker. */
    ghost?: boolean;
    /** Leading icon, matching the chevron's weight. */
    icon?: Snippet;
    /** Shown when `value` matches no option. */
    placeholder?: string;
    disabled?: boolean;
    /** Accessible name. Required — a dropdown with no name is unusable by voice. */
    label: string;
    /** Panel width follows the trigger. Off for short values with long options. */
    matchWidth?: boolean;
    /** Native tooltip, for explaining a disabled state. */
    title?: string;
    /**
     * Form field name. Renders a hidden input so the value still reaches
     * `formData` — `/projects/new` and `/pipelines/new` are SvelteKit form
     * actions, and a custom listbox submits nothing on its own.
     */
    name?: string;
    class?: string;
  };

  let {
    options,
    value = $bindable<string | null>(null),
    onchange,
    size = 'sm',
    ghost = false,
    icon,
    placeholder = 'Select…',
    disabled = false,
    label,
    matchWidth = true,
    title,
    name,
    class: className = ''
  }: Props = $props();

  let open = $state(false);
  let panelEl = $state<HTMLElement | undefined>(undefined);

  const selected = $derived(options.find((o) => o.value === value) ?? null);

  /** Options in render order, bucketed by group. Ungrouped options come first. */
  const groups = $derived.by(() => {
    const out: { key: string; label: string | null; items: { option: SelectOption; index: number }[] }[] =
      [];
    options.forEach((option, index) => {
      const key = option.group ?? '';
      const bucket = out.find((g) => g.key === key);
      if (bucket) bucket.items.push({ option, index });
      else out.push({ key, label: option.group ?? null, items: [{ option, index }] });
    });
    return out;
  });

  function commit(next: string) {
    value = next;
    onchange?.(next);
    open = false;
  }

  /**
   * **Real DOM focus is the keyboard cursor**, rather than an `activeIndex`
   * plus `aria-activedescendant`.
   *
   * Each option is already a `<button>`, so focus gives keyboard semantics,
   * screen-reader announcement and `scrollIntoView` for free — and, decisively,
   * the keydown handler has to live on the element that actually *has* focus.
   * The first version put it on a wrapper div, where `trapFocus` had already
   * moved focus past it to the first option, so no key ever reached it.
   */
  function optionButtons(): HTMLButtonElement[] {
    return [...(panelEl?.querySelectorAll<HTMLButtonElement>('button[role="option"]:not(:disabled)') ?? [])];
  }

  /** Open on the current value, so arrows move from where you already are. */
  function focusInitial() {
    const items = optionButtons();
    const target = items.find((b) => b.dataset.value === value) ?? items[0];
    target?.focus();
    target?.scrollIntoView({ block: 'nearest' });
  }

  function moveFocus(from: HTMLElement, delta: number) {
    const items = optionButtons();
    const i = items.indexOf(from as HTMLButtonElement);
    const next = items[Math.min(items.length - 1, Math.max(0, i + delta))];
    next?.focus();
    next?.scrollIntoView({ block: 'nearest' });
  }

  /**
   * Typeahead. Characters typed within a second compose into one search, so
   * "ne" finds "Netherlands" rather than jumping to everything starting with e.
   */
  let typeahead = '';
  let typeaheadTimer: ReturnType<typeof setTimeout> | null = null;
  function type(char: string) {
    typeahead += char.toLowerCase();
    if (typeaheadTimer) clearTimeout(typeaheadTimer);
    typeaheadTimer = setTimeout(() => (typeahead = ''), 1000);
    const hit = optionButtons().find((b) =>
      (b.dataset.label ?? '').toLowerCase().startsWith(typeahead)
    );
    hit?.focus();
    hit?.scrollIntoView({ block: 'nearest' });
  }

  // Enter and Space need no handling: an option is a real button, so the
  // browser turns both into a click. Escape belongs to layerStack.
  function onOptionKeydown(e: KeyboardEvent) {
    const el = e.currentTarget as HTMLElement;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveFocus(el, 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveFocus(el, -1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      optionButtons()[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      optionButtons().at(-1)?.focus();
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      type(e.key);
    }
  }

  /**
   * Arrows on a closed trigger **open the list**; they do not step the value.
   *
   * Stepping is what a native `<select>` does on Windows, and the first version
   * copied it. It is quietly destructive here: several of these dropdowns fire
   * a write on change, and one of them is a project's billing type — where
   * changing it clears the money column that type no longer owns. A stray
   * arrow key would silently wipe an hourly rate, which is exactly what
   * happened while testing this. The app also binds arrows for list navigation,
   * so a focused trigger catching one is not a remote possibility.
   *
   * Opening is the macOS convention, it is non-destructive, and the value is
   * still one keystroke away.
   */
  function onTriggerKeydown(e: KeyboardEvent) {
    if (open || disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      open = true;
    }
  }

  /**
   * Popover's own `autoFocus` lands on the *first* option; we want the selected
   * one, so it is turned off and focus is placed here.
   *
   * **Wait for the panel to have layout before focusing.** `bind:this` fires
   * while the panel is still in the top layer's pre-show state, and `focus()`
   * on an element with no boxes is silently a no-op. This is the same reason
   * Popover's own `autoFocus` misses for content mounted at open time —
   * `trapFocus` filters candidates on `offsetWidth > 0` and, one frame in,
   * every option still measures zero. Hence `autoFocus={false}` above and this
   * retry, which gives up after ten frames rather than spinning.
   */
  $effect(() => {
    if (!open) return;
    // Poll rather than hook a single frame or the popover's `toggle`: the panel
    // is mounted by an `{#if open}` inside Popover, `showPopover()` happens in
    // one of its own effects, and the option buttons only become focusable once
    // all of that has settled. A bounded poll is indifferent to that ordering,
    // where every single-shot attempt proved sensitive to it.
    let tries = 0;
    const id = setInterval(() => {
      const items = optionButtons();
      if (items.length > 0 && items[0].offsetHeight > 0) {
        clearInterval(id);
        focusInitial();
      } else if (++tries > 20) {
        clearInterval(id);
      }
    }, 16);
    return () => clearInterval(id);
  });

  const SIZES: Record<Size, string> = {
    sm: 'h-8 pl-2.5 pr-7 text-xs',
    md: 'h-9 pl-3 pr-8 text-sm'
  };
</script>

<Popover
  bind:open
  {label}
  panelRole="listbox"
  {matchWidth}
  autoFocus={false}
  placement="bottom-start"
  panelClass="max-h-72 overflow-y-auto p-1"
  class={className}
>
  {#snippet trigger(attrs)}
    <span class="relative inline-flex w-full min-w-0 items-center">
      {#if icon}
        <span
          class="pointer-events-none absolute left-2.5 z-[1] flex items-center text-[var(--color-subtle)]"
          aria-hidden="true"
        >
          {@render icon()}
        </span>
      {/if}

      <button
        {...attrs}
        type="button"
        {disabled}
        {title}
        onclick={attrs.onclick}
        onkeydown={onTriggerKeydown}
        class="w-full min-w-0 cursor-pointer truncate rounded-[var(--radius-md)] text-left font-medium text-[var(--color-text)] transition-colors disabled:cursor-not-allowed disabled:opacity-50 {ghost
          ? 'border border-transparent bg-transparent hover:border-[var(--color-border)] hover:bg-[var(--color-surface)]'
          : 'border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-strong)]'} {SIZES[
          size
        ]} {icon ? (size === 'md' ? 'pl-9' : 'pl-8') : ''}"
      >
        <span class={selected ? '' : 'text-[var(--color-subtle)]'}>
          {selected?.label ?? placeholder}
        </span>
      </button>

      <ChevronDown
        size={size === 'md' ? 15 : 13}
        strokeWidth={2}
        class="pointer-events-none absolute right-2 text-[var(--color-subtle)]"
        aria-hidden="true"
      />

      {#if name}
        <input type="hidden" {name} value={value ?? ''} />
      {/if}

      <!--
        Touch-only pointer target. Invisible, out of the a11y tree and out of
        the tab order; `pointer-events` is granted to it solely under
        `(pointer: coarse)`, so a phone gets the OS picker and a desktop click
        falls through to the button above.
      -->
      <select
        class="native-fallback"
        tabindex="-1"
        aria-hidden="true"
        {disabled}
        value={value ?? ''}
        onchange={(e) => commit(e.currentTarget.value)}
      >
        {#each options as o (o.value)}
          <option value={o.value} disabled={o.disabled}>{o.label}</option>
        {/each}
      </select>
    </span>
  {/snippet}

  {#snippet content()}
    <div bind:this={panelEl}>
      {#each groups as g (g.key)}
        {#if g.label}
          <div class="px-2 pb-1 pt-2 text-[0.6875rem] font-medium uppercase tracking-wide text-[var(--color-subtle)]">
            {g.label}
          </div>
        {/if}
        {#each g.items as { option } (option.value)}
          {@const isSelected = option.value === value}
          <button
            type="button"
            role="option"
            aria-selected={isSelected}
            data-value={option.value}
            data-label={option.label}
            disabled={option.disabled}
            onclick={() => commit(option.value)}
            onkeydown={onOptionKeydown}
            onmouseenter={(e) => e.currentTarget.focus()}
            class="option flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check
              size={13}
              strokeWidth={2.5}
              class="shrink-0 {isSelected ? 'text-[var(--color-accent)]' : 'opacity-0'}"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1 truncate {isSelected ? 'font-medium' : ''}">
              {option.label}
            </span>
            {#if option.hint}
              <span class="shrink-0 text-xs tabular-nums text-[var(--color-subtle)]">
                {option.hint}
              </span>
            {/if}
          </button>
        {/each}
      {/each}

      {#if options.length === 0}
        <p class="px-2 py-3 text-center text-xs text-[var(--color-muted)]">Nothing to choose from</p>
      {/if}
    </div>
  {/snippet}
</Popover>

<style>
  /*
   * Focus is the cursor, so the highlight is `:focus` and not `:focus-visible`
   * — the panel is opened by mouse as often as by keyboard, and a focus-visible
   * rule would leave the moused-over row unmarked. The global `*:focus-visible`
   * ring is suppressed here for the same reason: inside a listbox a full ring
   * on every arrow press is noise, and the fill already says where you are.
   */
  .option:focus {
    background: var(--color-surface-2);
    outline: none;
  }

  .native-fallback {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    pointer-events: none;
    /* Safari zooms the page when a control under 16px gains focus. */
    font-size: 16px;
  }
  @media (pointer: coarse) {
    .native-fallback {
      pointer-events: auto;
    }
  }
</style>
