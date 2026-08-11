<script lang="ts">
  /**
   * `Popover` gives you a panel and nothing inside it, so every menu in the app
   * re-wrote its own
   * `flex w-full items-center gap-2 px-2 py-1.5 text-xs hover:bg-…` row, with
   * the padding and the hover colour drifting between them.
   *
   * Renders as an `<a>` when given an `href` and a `<button>` otherwise —
   * navigation should be a link so middle-click and open-in-new-tab work, which
   * several of the hand-rolled rows had quietly lost by using a button plus
   * `goto`.
   *
   * `selected` is the checked state for a menu acting as a picker; `active` is
   * keyboard highlight. They are different things and were conflated in at
   * least two of the originals, so a highlighted row looked chosen.
   */
  import { Check } from 'lucide-svelte';
  import type { Snippet } from 'svelte';

  type Props = {
    href?: string;
    /** Leading icon or swatch. */
    icon?: Snippet;
    /** Trailing content — a shortcut hint, a count. */
    trailing?: Snippet;
    /** Shows a checkmark. For menus that pick a value. */
    selected?: boolean;
    /** Keyboard highlight. Not the same as `selected`. */
    active?: boolean;
    danger?: boolean;
    disabled?: boolean;
    onclick?: (e: MouseEvent) => void;
    class?: string;
    children: Snippet;
  };

  let {
    href,
    icon,
    trailing,
    selected = false,
    active = false,
    danger = false,
    disabled = false,
    onclick,
    class: className = '',
    children
  }: Props = $props();

  const base =
    'flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50';
  const tone = $derived(
    danger
      ? 'text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]'
      : 'text-[var(--color-text)] hover:bg-[var(--color-surface-2)]'
  );
  const highlight = $derived(active ? 'bg-[var(--color-highlight-bg)]' : '');
</script>

{#snippet body()}
  {#if icon}
    <span class="flex size-4 shrink-0 items-center justify-center text-[var(--color-subtle)]">
      {@render icon()}
    </span>
  {/if}
  <span class="min-w-0 flex-1 truncate">{@render children()}</span>
  {#if trailing}
    <span class="shrink-0 text-2xs text-[var(--color-subtle)]">{@render trailing()}</span>
  {/if}
  {#if selected}
    <Check size={13} strokeWidth={2.5} class="shrink-0 text-[var(--color-interactive)]" />
  {/if}
{/snippet}

{#if href}
  <a {href} class="{base} {tone} {highlight} {className}" aria-current={selected ? 'true' : undefined}>
    {@render body()}
  </a>
{:else}
  <button
    type="button"
    {disabled}
    {onclick}
    role="menuitem"
    class="{base} {tone} {highlight} {className}"
  >
    {@render body()}
  </button>
{/if}
