<script lang="ts">
  /**
   * Form rows had no shared shape at all. `settings/import/+page.svelte` went
   * as far as defining a local `const FIELD = '…'` string that no other file
   * could reach — a private design system of one.
   *
   * This owns the label/control/hint/error stack and the id wiring, so a
   * control gets `aria-describedby` and `aria-invalid` without every call site
   * remembering to. The control itself comes in as a snippet receiving the ids,
   * which keeps `Field` agnostic about whether it wraps an input, a Select, a
   * Combobox or a RichText.
   *
   * `error` replaces `hint` when both are set — stacking them buries the thing
   * the user needs to read.
   */
  import type { Snippet } from 'svelte';

  type ControlAttrs = {
    id: string;
    'aria-describedby': string | undefined;
    'aria-invalid': 'true' | undefined;
  };

  type Props = {
    label: string;
    /** Visually hide the label but keep it for assistive tech. */
    labelHidden?: boolean;
    hint?: string;
    error?: string;
    required?: boolean;
    class?: string;
    control: Snippet<[ControlAttrs]>;
  };

  let {
    label,
    labelHidden = false,
    hint,
    error,
    required = false,
    class: className = '',
    control
  }: Props = $props();

  const uid = $props.id();
  const controlId = `${uid}-control`;
  const messageId = `${uid}-message`;

  const message = $derived(error ?? hint);
  const attrs: ControlAttrs = $derived({
    id: controlId,
    'aria-describedby': message ? messageId : undefined,
    'aria-invalid': error ? 'true' : undefined
  });
</script>

<div class="flex min-w-0 flex-col gap-1.5 {className}">
  <label
    for={controlId}
    class={labelHidden
      ? 'sr-only'
      : 'text-xs font-medium text-[var(--color-muted)]'}
  >
    {label}{#if required}<span class="text-[var(--color-danger)]" aria-hidden="true"> *</span>{/if}
  </label>

  {@render control(attrs)}

  {#if message}
    <p
      id={messageId}
      class="text-xs {error ? 'text-[var(--color-danger)]' : 'text-[var(--color-subtle)]'}"
    >
      {message}
    </p>
  {/if}
</div>
