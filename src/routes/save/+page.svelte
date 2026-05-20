<script lang="ts">
  import { APP_NAME } from '$lib/branding';
  import { AlertTriangle } from 'lucide-svelte';
  import { saveErrorMessage } from '$lib/save-errors';
  let { data } = $props();
  const message = $derived(saveErrorMessage(data.error, "Couldn't save that link."));
</script>

<svelte:head>
  <title>Save — {APP_NAME}</title>
</svelte:head>

<section class="mx-auto flex max-w-md flex-col gap-4 px-4 py-12 text-center">
  <span class="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning)]">
    <AlertTriangle size={18} strokeWidth={2} />
  </span>
  <h1 class="text-xl font-semibold tracking-tight">Couldn't save that link</h1>
  <p class="text-sm text-[var(--color-muted)]">{message}</p>
  <a href="/" class="mx-auto inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-surface)]">Back to dashboard</a>
</section>
