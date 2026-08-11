<script lang="ts">
  /**
   * Fourteen route files hand-roll
   * `rounded-md border border-dashed … p-10 text-center` with a single muted
   * sentence inside. The *copy* is already good — every list branches its
   * message by cause (no query / no tag / filtered / genuinely empty), which is
   * more care than most apps take. What it lacked was form: no icon, no
   * headline, nothing to look at.
   *
   * So this keeps the branching to the caller and supplies the shape: an icon
   * in a soft tile, a real headline, a supporting line, then actions. The
   * reference does exactly this and it is the difference between "nothing here"
   * reading as a dead end and reading as a next step.
   *
   * `bordered={false}` is for empties nested inside a Card, where a second
   * dashed border inside a solid one just looks like a mistake.
   */
  import type { Snippet } from 'svelte';

  type Props = {
    /**
     * A lucide icon component. Typed loosely, matching `Command['icon']` in the
     * command registry — lucide-svelte's generated components don't satisfy
     * Svelte 5's `Component<P>` signature, and the alternative is a cast at
     * every one of the fourteen call sites this replaces.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    icon?: any;
    title: string;
    /** One supporting sentence. Keep it to why, or what to do next. */
    description?: string;
    /** Dashed container. Off when this sits inside a Card. */
    bordered?: boolean;
    compact?: boolean;
    /** Buttons or links. */
    actions?: Snippet;
    /** Replaces `description` when it needs markup. */
    children?: Snippet;
    class?: string;
  };

  let {
    icon: Icon,
    title,
    description,
    bordered = true,
    compact = false,
    actions,
    children,
    class: className = ''
  }: Props = $props();
</script>

<div
  class="flex flex-col items-center justify-center text-center {compact
    ? 'gap-2 px-4 py-8'
    : 'gap-3 px-6 py-14'} {bordered
    ? 'rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]'
    : ''} {className}"
>
  {#if Icon}
    <span
      class="mb-1 flex size-10 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-subtle)]"
      aria-hidden="true"
    >
      <Icon size={18} strokeWidth={1.75} />
    </span>
  {/if}

  <p class="text-base font-semibold text-[var(--color-text)]">{title}</p>

  {#if children}
    <div class="max-w-sm text-sm text-[var(--color-muted)]">{@render children()}</div>
  {:else if description}
    <p class="max-w-sm text-sm text-[var(--color-muted)]">{description}</p>
  {/if}

  {#if actions}
    <div class="mt-2 flex flex-wrap items-center justify-center gap-2">{@render actions()}</div>
  {/if}
</div>
