<script lang="ts">
  /**
   * The three checkboxes in the app were fully unstyled native inputs — one
   * bare, one `class="w-4"`, one with a radius token and nothing else — so they
   * rendered in platform blue, the only place in the product that colour
   * appeared.
   *
   * Built on a real `<input type="checkbox">` kept visually hidden but still
   * hit-testable, so form submission, `indeterminate`, the label association
   * and every assistive-tech behaviour come from the platform. The painted box
   * is a sibling driven by `peer-*` variants — no JS, and it cannot fall out of
   * sync with the input's actual state the way a div-with-a-role would.
   *
   * Checked uses the ink accent rather than the interactive blue: a ticked box
   * is a committed value, not a navigation affordance, and the reference keeps
   * blue off controls like this for the same reason.
   */
  import { Check, Minus } from 'lucide-svelte';
  import type { Snippet } from 'svelte';
  import type { HTMLInputAttributes } from 'svelte/elements';

  type Props = Omit<HTMLInputAttributes, 'type' | 'size'> & {
    checked?: boolean;
    /** Renders a dash. Purely visual — set `checked` too if the value matters. */
    indeterminate?: boolean;
    /** Inline label. Omit when an external `<label for>` already names it. */
    label?: string;
    /** Secondary line beneath the label. */
    description?: string;
    children?: Snippet;
  };

  let {
    checked = $bindable(false),
    indeterminate = false,
    label,
    description,
    class: className = '',
    disabled,
    children,
    ...rest
  }: Props = $props();
</script>

<label
  class="group inline-flex items-start gap-2 {disabled
    ? 'cursor-not-allowed opacity-50'
    : 'cursor-pointer'} {className}"
>
  <span class="relative flex shrink-0 items-center justify-center">
    <input
      type="checkbox"
      bind:checked
      {disabled}
      {indeterminate}
      class="peer size-4 cursor-[inherit] appearance-none rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] transition-colors checked:border-[var(--color-accent)] checked:bg-[var(--color-accent)] indeterminate:border-[var(--color-accent)] indeterminate:bg-[var(--color-accent)] group-hover:border-[var(--color-text)]"
      {...rest}
    />
    <span
      class="pointer-events-none absolute text-[var(--color-accent-fg)] opacity-0 peer-checked:opacity-100 peer-indeterminate:opacity-100"
      aria-hidden="true"
    >
      {#if indeterminate}
        <Minus size={11} strokeWidth={3} />
      {:else}
        <Check size={11} strokeWidth={3.25} />
      {/if}
    </span>
  </span>

  {#if children}
    <span class="min-w-0 text-sm text-[var(--color-text)]">{@render children()}</span>
  {:else if label}
    <span class="min-w-0">
      <span class="block text-sm text-[var(--color-text)]">{label}</span>
      {#if description}
        <span class="mt-0.5 block text-xs text-[var(--color-muted)]">{description}</span>
      {/if}
    </span>
  {/if}
</label>
