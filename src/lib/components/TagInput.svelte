<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { Tag, X } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';

  type ScopeTag = { id: string; name: string; slug: string; count?: number };

  type Props = {
    scope: 'person' | 'company' | 'interaction' | 'project';
    entityId: string;
    tags: ScopeTag[];
    suggestions?: ScopeTag[];
  };

  let { scope, entityId, tags, suggestions = [] }: Props = $props();

  let q = $state('');
  let inputEl = $state<HTMLInputElement | undefined>(undefined);
  let saving = $state(false);
  let open = $state(false);

  const filtered = $derived.by(() => {
    const v = q.trim().toLowerCase();
    const taken = new Set(tags.map((t) => t.id));
    const pool = suggestions.filter((s) => !taken.has(s.id));
    if (!v) return pool.slice(0, 8);
    return pool.filter((s) => s.name.toLowerCase().includes(v)).slice(0, 8);
  });

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
      q = '';
      open = false;
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

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addByName(q);
    } else if (e.key === 'Escape') {
      open = false;
      q = '';
    } else if (e.key === 'Backspace' && q === '' && tags.length > 0) {
      remove(tags[tags.length - 1].id);
      e.preventDefault();
    }
  }
</script>

<div class="flex flex-col gap-1">
  <div class="flex flex-wrap items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5">
    <span class="flex items-center pl-1 text-[var(--color-subtle)]">
      <Tag size={12} strokeWidth={2} />
    </span>
    {#each tags as t (t.id)}
      <span class="inline-flex items-center gap-1 rounded-full bg-[var(--color-highlight-bg)] py-0.5 pl-2 pr-0.5 text-xs text-[var(--color-text)]">
        <span class="font-medium">{t.name}</span>
        <button
          type="button"
          onclick={() => remove(t.id)}
          aria-label="Remove {t.name}"
          class="rounded-full p-0.5 hover:bg-[var(--color-highlight-border)]"
        ><X size={10} strokeWidth={2} /></button>
      </span>
    {/each}
    <input
      bind:this={inputEl}
      bind:value={q}
      onkeydown={onKey}
      onfocus={() => (open = true)}
      onblur={() => setTimeout(() => (open = false), 150)}
      type="text"
      placeholder={tags.length === 0 ? 'Add a tag…' : ''}
      class="min-w-[100px] flex-1 bg-transparent px-1 py-0.5 text-xs outline-none"
    />
  </div>
  {#if open && filtered.length > 0}
    <div class="relative">
      <ul class="absolute inset-x-0 top-0 z-10 max-h-48 overflow-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-md)]">
        {#each filtered as s (s.id)}
          <li>
            <button
              type="button"
              onmousedown={(e) => { e.preventDefault(); addByName(s.name); }}
              class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--color-bg)]"
            >
              <span>{s.name}</span>
              {#if s.count != null}
                <span class="text-[var(--color-subtle)]">{s.count}</span>
              {/if}
            </button>
          </li>
        {/each}
        {#if q.trim() && !filtered.some((s) => s.name.toLowerCase() === q.trim().toLowerCase())}
          <li>
            <button
              type="button"
              onmousedown={(e) => { e.preventDefault(); addByName(q); }}
              class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--color-text)] hover:bg-[var(--color-bg)]"
            >
              Create &ldquo;{q.trim()}&rdquo;
            </button>
          </li>
        {/if}
      </ul>
    </div>
  {/if}
</div>
