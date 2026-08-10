<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { Tag, X } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';
  import Combobox from '$lib/ui/Combobox.svelte';

  type ScopeTag = { id: string; name: string; slug: string; count?: number };

  type Props = {
    scope: 'person' | 'company' | 'interaction' | 'project';
    entityId: string;
    tags: ScopeTag[];
    suggestions?: ScopeTag[];
  };

  let { scope, entityId, tags, suggestions = [] }: Props = $props();

  let saving = $state(false);
  let box = $state<ReturnType<typeof Combobox> | undefined>(undefined);

  function search(q: string): ScopeTag[] {
    const v = q.trim().toLowerCase();
    const taken = new Set(tags.map((t) => t.id));
    const pool = suggestions.filter((s) => !taken.has(s.id));
    return (v ? pool.filter((s) => s.name.toLowerCase().includes(v)) : pool).slice(0, 8);
  }

  async function addByName(name: string) {
    if (saving) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    saving = true;
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scope, name: trimmed, entityId })
      });
      if (!res.ok) {
        toast.danger('Could not add tag');
        return;
      }
      box?.reset();
      // Tag counts and the workspace tag list are not owned by any local
      // cache, so a reload is genuinely owed here.
      await invalidateAll();
    } finally {
      saving = false;
    }
  }

  async function remove(tagId: string) {
    const res = await fetch('/api/tags', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scope, entityId, tagId })
    });
    if (!res.ok) {
      toast.danger('Could not remove tag');
      return;
    }
    await invalidateAll();
  }
</script>

<Combobox
  bind:this={box}
  variant="field"
  {search}
  getId={(t) => t.id}
  searchOnOpen
  debounce={0}
  placeholder={tags.length === 0 ? 'Add a tag…' : ''}
  autoFocus={false}
  inputClass="text-xs"
  onSelect={(t) => addByName(t.name)}
  onCreate={addByName}
  canCreate={(q, results) => !results.some((s) => s.name.toLowerCase() === q.toLowerCase())}
  createLabel={(q) => `Create “${q}”`}
  onBackspaceEmpty={() => {
    if (tags.length > 0) remove(tags[tags.length - 1].id);
  }}
>
  {#snippet chips()}
    <span class="flex items-center pl-1 text-[var(--color-subtle)]">
      <Tag size={12} strokeWidth={2} />
    </span>
    {#each tags as t (t.id)}
      <span
        class="inline-flex items-center gap-1 rounded-full bg-[var(--color-highlight-bg)] py-0.5 pl-2 pr-0.5 text-xs text-[var(--color-text)]"
      >
        <span class="font-medium">{t.name}</span>
        <button
          type="button"
          onclick={() => remove(t.id)}
          aria-label="Remove {t.name}"
          class="rounded-full p-0.5 hover:bg-[var(--color-highlight-border)]"><X size={10} strokeWidth={2} /></button
        >
      </span>
    {/each}
  {/snippet}

  {#snippet option(s: ScopeTag)}
    <span class="min-w-0 flex-1 truncate">{s.name}</span>
    {#if s.count != null}
      <span class="shrink-0 text-[var(--color-subtle)]">{s.count}</span>
    {/if}
  {/snippet}
</Combobox>
