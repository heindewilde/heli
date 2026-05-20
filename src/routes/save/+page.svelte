<script lang="ts">
  import { APP_NAME } from '$lib/branding';
  import { AlertTriangle, CheckCircle, BookmarkX } from 'lucide-svelte';
  import { saveErrorMessage } from '$lib/save-errors';

  let { data } = $props();

  function close() {
    window.close();
  }
</script>

<svelte:head>
  <title>Save — {APP_NAME}</title>
</svelte:head>

<section class="mx-auto flex max-w-sm flex-col items-center gap-5 px-4 py-16 text-center">
  {#if data.ok}
    <span class="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--color-success-border,#86efac)] bg-[var(--color-success-bg,#f0fdf4)] text-[var(--color-success,#16a34a)]">
      <CheckCircle size={22} strokeWidth={2} />
    </span>
    <div class="flex flex-col gap-1">
      <h1 class="text-xl font-semibold tracking-tight">
        {data.dedup ? 'Already saved' : 'Saved'}
      </h1>
      <p class="text-sm text-[var(--color-muted)]">
        {data.dedup
          ? `This ${data.kind} is already in ${APP_NAME}.`
          : `Added to your ${data.kind === 'person' ? 'people' : 'companies'}.`}
      </p>
    </div>
    <div class="flex gap-2">
      <a
        href={data.path}
        class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
      >
        View {data.kind}
      </a>
      <button
        type="button"
        onclick={close}
        class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-surface)]"
      >
        Close tab
      </button>
    </div>
  {:else}
    <span class="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning)]">
      <AlertTriangle size={22} strokeWidth={2} />
    </span>
    <div class="flex flex-col gap-1">
      <h1 class="text-xl font-semibold tracking-tight">Couldn't save that link</h1>
      <p class="text-sm text-[var(--color-muted)]">{saveErrorMessage(data.error, "Couldn't save that link.")}</p>
    </div>
    <div class="flex gap-2">
      <a href="/" class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-surface)]">
        Open {APP_NAME}
      </a>
      <button
        type="button"
        onclick={close}
        class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-surface)]"
      >
        Close tab
      </button>
    </div>
  {/if}
</section>
