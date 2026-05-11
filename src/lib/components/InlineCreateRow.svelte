<script lang="ts">
  import { Plus, Loader2 } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';

  // A single, always-visible row at the top of the table for quick manual
  // creation. Type a name, press Enter → POST → focus stays on the input so
  // the user can keep adding. Esc clears the field. No company picker, no
  // role field — those are inline-editable on the new row immediately after.

  type Props = {
    placeholder: string;
    /** 'person' or 'company' — drives the POST endpoint. */
    endpoint: '/api/people' | '/api/companies';
    /** Called after the new entity is created so the list refreshes. */
    onCreated: (id: string) => void;
  };
  let { placeholder, endpoint, onCreated }: Props = $props();

  let value = $state('');
  let busy = $state(false);
  let inputEl = $state<HTMLInputElement | undefined>(undefined);

  async function submit() {
    const name = value.trim();
    if (!name || busy) return;
    busy = true;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!res.ok) {
        toast.danger('Could not create');
        return;
      }
      const data = (await res.json()) as { id: string };
      value = '';
      onCreated(data.id);
      // Keep focus so the user can add several in a row.
      setTimeout(() => inputEl?.focus(), 0);
    } catch {
      toast.danger('Could not create');
    } finally {
      busy = false;
    }
  }
</script>

<div class="group flex items-center gap-2 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 transition-colors hover:border-[var(--color-border-strong)] focus-within:border-[var(--color-border-strong)] focus-within:bg-[var(--color-surface-2)]">
  <Plus size={14} strokeWidth={2.25} class="text-[var(--color-subtle)] group-focus-within:text-[var(--color-text)]" />
  <input
    bind:this={inputEl}
    bind:value
    type="text"
    {placeholder}
    onkeydown={(e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        value = '';
        inputEl?.blur();
      }
    }}
    disabled={busy}
    class="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-subtle)] disabled:opacity-60"
    aria-label={placeholder}
  />
  {#if busy}
    <Loader2 size={12} strokeWidth={2} class="animate-spin text-[var(--color-subtle)]" />
  {:else}
    <kbd class="hidden rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 font-sans text-[10px] text-[var(--color-subtle)] group-focus-within:inline-block">↵</kbd>
  {/if}
</div>
