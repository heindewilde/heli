<script lang="ts">
  import { Link as LinkIcon, Loader2 } from 'lucide-svelte';
  import { invalidateAll, goto } from '$app/navigation';
  import { toast } from '$lib/toasts.svelte';
  import { saveErrorMessage } from '$lib/save-errors';
  import { readErrorCode } from '$lib/api-error';

  let value = $state('');
  let busy = $state(false);
  let inputEl = $state<HTMLInputElement | undefined>(undefined);

  export function focus() {
    inputEl?.focus();
    inputEl?.select();
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const url = value.trim();
    if (!url || busy) return;
    busy = true;
    try {
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url })
      });
      if (!res.ok) {
        toast.danger(saveErrorMessage(await readErrorCode(res)));
        return;
      }
      const data = (await res.json()) as { id: string; kind: 'person' | 'company'; dedup: boolean };
      value = '';
      const path = data.kind === 'person' ? `/people/${data.id}` : `/companies/${data.id}`;
      // Detail page shows a banner driven by ?dedup / ?just; no toast needed.
      await invalidateAll();
      await goto(path + (data.dedup ? '?dedup=1' : '?just=1'));
    } catch (err) {
      toast.danger(saveErrorMessage(null, (err as Error).message || 'Save failed'));
    } finally {
      busy = false;
    }
  }
</script>

<form onsubmit={submit} class="flex w-full max-w-2xl items-center">
  <div class="relative w-full">
    <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--color-subtle)]">
      <LinkIcon size={14} strokeWidth={2} />
    </span>
    <input
      bind:this={inputEl}
      bind:value
      type="text"
      inputmode="url"
      autocomplete="off"
      spellcheck="false"
      placeholder="Paste a link anywhere to save a person or company…"
      disabled={busy}
      class="h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-9 text-sm shadow-[var(--shadow-xs)] placeholder:text-[var(--color-subtle)] transition-[border-color,box-shadow] focus:border-[var(--color-border-strong)] focus:shadow-[var(--shadow-sm)] focus:outline-none"
    />
    {#if busy}
      <span class="absolute inset-y-0 right-3 flex items-center text-[var(--color-muted)]">
        <Loader2 size={14} strokeWidth={2} class="animate-spin" />
      </span>
    {/if}
  </div>
</form>
