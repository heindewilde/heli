<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { Plus, Tag, Check } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';

  type AttachedTag = { id: string; name: string };
  type SuggestionTag = { id: string; name: string; slug: string; count?: number };

  type Props = {
    scope: 'person' | 'company' | 'interaction';
    entityId: string;
    currentTags: AttachedTag[];
    suggestions: SuggestionTag[];
  };

  let { scope, entityId, currentTags, suggestions }: Props = $props();

  let open = $state(false);
  let q = $state('');
  let inputEl = $state<HTMLInputElement | undefined>(undefined);
  let saving = $state(false);
  let panelEl = $state<HTMLDivElement | undefined>(undefined);
  let chipEl = $state<HTMLButtonElement | undefined>(undefined);

  const attachedIds = $derived(new Set(currentTags.map((t) => t.id)));
  const filtered = $derived.by(() => {
    const v = q.trim().toLowerCase();
    const pool = v
      ? suggestions.filter((s) => s.name.toLowerCase().includes(v))
      : suggestions;
    return pool.slice(0, 8);
  });
  const hasExact = $derived(
    suggestions.some((s) => s.name.toLowerCase() === q.trim().toLowerCase())
  );

  // Click-outside + Escape close. Only attached while open so we don't leak
  // listeners when the popover is dormant on every list row.
  $effect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelEl?.contains(t) || chipEl?.contains(t)) return;
      open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        open = false;
      }
    };
    // Defer the listener attachment a tick so the click that opened us
    // doesn't immediately close on capture.
    const t = setTimeout(() => {
      window.addEventListener('mousedown', onMouseDown);
      window.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKey);
    };
  });

  $effect(() => {
    if (open) setTimeout(() => inputEl?.focus(), 0);
  });

  async function attachByName(name: string) {
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
      await invalidateAll();
    } finally {
      saving = false;
    }
  }

  async function detach(tagId: string) {
    if (saving) return;
    saving = true;
    try {
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
    } finally {
      saving = false;
    }
  }

  async function toggle(t: SuggestionTag) {
    if (attachedIds.has(t.id)) await detach(t.id);
    else await attachByName(t.name);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (q.trim()) attachByName(q.trim());
    }
  }
</script>

<div class="relative inline-block">
  <button
    bind:this={chipEl}
    type="button"
    aria-label="Add tag"
    aria-expanded={open}
    onclick={() => (open = !open)}
    class="inline-flex items-center gap-0.5 rounded-full border border-dashed border-[var(--color-border)] bg-transparent px-1.5 py-0.5 text-[10px] text-[var(--color-muted)] transition-colors hover:border-[var(--color-product-border)] hover:bg-[var(--color-product-bg)] hover:text-[var(--color-product)]"
  >
    <Plus size={10} strokeWidth={2} />
    tag
  </button>

  {#if open}
    <div
      bind:this={panelEl}
      role="dialog"
      aria-label="Tag {scope}"
      class="absolute left-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-md)]"
    >
      <input
        bind:this={inputEl}
        bind:value={q}
        onkeydown={onKey}
        type="text"
        placeholder="Search or create…"
        class="w-full border-b border-[var(--color-border)] bg-transparent px-3 py-2 text-xs outline-none placeholder:text-[var(--color-subtle)]"
      />
      <ul class="max-h-48 overflow-auto py-1">
        {#each filtered as s (s.id)}
          {@const attached = attachedIds.has(s.id)}
          <li>
            <button
              type="button"
              onclick={() => toggle(s)}
              disabled={saving}
              class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--color-bg)] disabled:opacity-60"
            >
              <span class="flex min-w-0 items-center gap-1.5">
                {#if attached}
                  <Check size={10} strokeWidth={2} class="shrink-0 text-[var(--color-product)]" />
                {:else}
                  <Tag size={10} strokeWidth={2} class="shrink-0 text-[var(--color-subtle)]" />
                {/if}
                <span class="truncate {attached ? 'text-[var(--color-product)]' : ''}">{s.name}</span>
              </span>
              {#if s.count != null}
                <span class="shrink-0 text-[var(--color-subtle)]">{s.count}</span>
              {/if}
            </button>
          </li>
        {/each}
        {#if q.trim() && !hasExact}
          <li>
            <button
              type="button"
              onclick={() => attachByName(q.trim())}
              disabled={saving}
              class="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs text-[var(--color-product)] hover:bg-[var(--color-bg)] disabled:opacity-60"
            >
              <Plus size={10} strokeWidth={2} />
              Create &ldquo;{q.trim()}&rdquo;
            </button>
          </li>
        {/if}
        {#if filtered.length === 0 && !q.trim()}
          <li class="px-3 py-2 text-[10px] italic text-[var(--color-subtle)]">No tags yet — type to create one.</li>
        {/if}
      </ul>
    </div>
  {/if}
</div>
