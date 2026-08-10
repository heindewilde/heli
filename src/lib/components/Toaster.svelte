<script lang="ts">
  import { toast } from '$lib/toasts.svelte';
  import { X } from 'lucide-svelte';

  const kindClasses: Record<string, string> = {
    info: 'border-[var(--color-info-border)] bg-[var(--color-info-bg)] text-[var(--color-info)]',
    success: 'border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success)]',
    warning: 'border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning)]',
    danger: 'border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger)]'
  };
</script>

<div class="pointer-events-none fixed right-4 bottom-4 z-[var(--z-toast)] flex flex-col gap-2">
  {#each toast.items as t (t.id)}
    <div
      class="pointer-events-auto flex items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2 shadow-[var(--shadow-md)] {kindClasses[t.kind]}"
      role="status"
    >
      <span class="text-sm">{t.message}</span>
      {#if t.undo}
        <button
          type="button"
          class="rounded-[var(--radius-sm)] px-2 py-1 text-xs font-medium underline"
          onclick={() => {
            t.undo?.();
            toast.dismiss(t.id);
          }}
        >Undo</button>
      {/if}
      <button
        type="button"
        class="ml-auto opacity-60 hover:opacity-100"
        aria-label="Dismiss"
        onclick={() => toast.dismiss(t.id)}
      ><X size={14} strokeWidth={2} /></button>
    </div>
  {/each}
</div>
