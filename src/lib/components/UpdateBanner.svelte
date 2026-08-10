<script lang="ts">
  import { Sparkles } from 'lucide-svelte';
  import { applyUpdate, swStatus } from '$lib/client/sw.svelte';

  const status = swStatus();
</script>

{#if status.updateAvailable}
  <div class="pointer-events-none fixed inset-x-0 bottom-4 z-[var(--z-toast)] flex justify-center px-4">
    <aside
      role="status"
      class="pointer-events-auto flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-info-border)] bg-[var(--color-info-bg)] px-3 py-2 text-sm text-[var(--color-info)] shadow-[var(--shadow-md)]"
    >
      <Sparkles size={14} strokeWidth={2} class="shrink-0" />
      <p class="min-w-0">A new version of Heli is ready.</p>
      <button
        type="button"
        onclick={applyUpdate}
        class="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-info-border)] bg-[var(--color-info-bg)] px-2 py-1 text-xs font-medium hover:bg-[var(--color-info-border)]"
      >
        Reload
      </button>
    </aside>
  </div>
{/if}
