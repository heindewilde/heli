<script lang="ts">
  /**
   * There was no switch and no `role="switch"` anywhere — every on/off setting
   * was a checkbox or a button that toggled its own label.
   *
   * The distinction worth holding: a **checkbox** is a value you are about to
   * submit, a **switch** takes effect immediately. Settings that fire a PATCH
   * on change want this; anything inside a form that has a Save button wants
   * Checkbox.
   *
   * A real `<button role="switch">` rather than a styled checkbox, because that
   * is the role whose announced state is "on"/"off" rather than
   * "checked"/"unchecked", and because it should never be submitted with a
   * form. Space and Enter come free with `<button>`.
   */
  import type { HTMLButtonAttributes } from 'svelte/elements';

  type Props = Omit<HTMLButtonAttributes, 'onchange'> & {
    checked?: boolean;
    /** Accessible name. Required unless an external `<label>` provides one. */
    label?: string;
    onchange?: (next: boolean) => void;
  };

  let {
    checked = $bindable(false),
    label,
    onchange,
    class: className = '',
    disabled,
    ...rest
  }: Props = $props();

  function toggle() {
    checked = !checked;
    onchange?.(checked);
  }
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked}
  aria-label={label}
  {disabled}
  onclick={toggle}
  class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50 {checked
    ? 'border-[var(--color-accent)] bg-[var(--color-accent)]'
    : 'border-[var(--color-border-strong)] bg-[var(--color-surface-2)]'} {className}"
  {...rest}
>
  <span
    class="knob pointer-events-none absolute size-3.5 rounded-full bg-[var(--color-surface)] shadow-raised"
    class:on={checked}
    aria-hidden="true"
  ></span>
</button>

<style>
  /* `left` rather than a transform: the track is only 36px wide, and a
     sub-pixel transform on a 14px circle renders visibly soft at this size. */
  .knob {
    left: 2px;
    transition: left var(--duration-fast) var(--ease-out);
  }
  .knob.on {
    left: calc(100% - 1.125rem);
  }
</style>
