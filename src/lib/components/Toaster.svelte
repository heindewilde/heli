<script lang="ts">
  /**
   * Toasts appeared and vanished with no transition, which at the bottom-right
   * corner of a wide screen means they were easy to miss entirely — the thing a
   * toast exists to prevent.
   *
   * This is the one place in the app that uses `svelte/transition`, and the
   * reason is structural rather than aesthetic. Dialog and Popover animate with
   * CSS and enter only, because an exit would require keeping `open` true after
   * the caller set it false — a second source of truth for "is this showing".
   * Toasts are a keyed `{#each}` over an array, so Svelte already owns the
   * removal timing and `out:` just defers it. No new state, no new dependency
   * (transitions ship inside svelte), and `flip` keeps the survivors from
   * jumping when one in the middle is dismissed.
   *
   * Reduced motion has to be handled here in JS. The global rule in app.css
   * collapses CSS animations and transitions, but Svelte transitions are driven
   * by inline styles it writes frame by frame, so that rule cannot reach them.
   */
  import { toast } from '$lib/toasts.svelte';
  import { X, Info, CircleCheck, TriangleAlert, CircleAlert } from 'lucide-svelte';
  import { fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { MediaQuery } from 'svelte/reactivity';

  const kindClasses: Record<string, string> = {
    info: 'border-[var(--color-info-border)] bg-[var(--color-info-bg)] text-[var(--color-info)]',
    success: 'border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success)]',
    warning: 'border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning)]',
    danger: 'border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger)]'
  };

  const ICONS = {
    info: Info,
    success: CircleCheck,
    warning: TriangleAlert,
    danger: CircleAlert
  } as const;

  const reduced = new MediaQuery('prefers-reduced-motion: reduce');
  const dur = $derived(reduced.current ? 0 : 220);
</script>

<div class="pointer-events-none fixed right-4 bottom-4 z-[var(--z-toast)] flex flex-col gap-2">
  {#each toast.items as t (t.id)}
    {@const Icon = ICONS[t.kind as keyof typeof ICONS] ?? Info}
    <div
      class="pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-[var(--radius-lg)] border px-3 py-2 shadow-overlay {kindClasses[
        t.kind
      ]}"
      role="status"
      in:fly={{ y: 8, x: 8, duration: dur }}
      out:fly={{ x: 16, duration: dur }}
      animate:flip={{ duration: dur }}
    >
      <Icon size={15} strokeWidth={2.25} class="shrink-0" aria-hidden="true" />
      <span class="min-w-0 text-sm text-[var(--color-text)]">{t.message}</span>
      {#if t.undo}
        <button
          type="button"
          class="shrink-0 rounded-[var(--radius-sm)] px-1.5 py-0.5 text-xs font-semibold underline underline-offset-2 transition-colors hover:bg-current/10"
          onclick={() => {
            t.undo?.();
            toast.dismiss(t.id);
          }}
        >Undo</button>
      {/if}
      <button
        type="button"
        class="ml-auto shrink-0 rounded-[var(--radius-sm)] p-0.5 opacity-60 transition-opacity hover:opacity-100"
        aria-label="Dismiss"
        onclick={() => toast.dismiss(t.id)}
      ><X size={14} strokeWidth={2} /></button>
    </div>
  {/each}
</div>
