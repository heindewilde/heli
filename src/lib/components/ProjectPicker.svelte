<script lang="ts">
  import { X, Sparkles, FolderKanban } from 'lucide-svelte';
  import type { ProjectStatus } from '$lib/server/schema';

  type Project = { id: string; name: string; status: ProjectStatus };

  type Props = {
    selected: Project[];
    /** Subset of `selected` that came from auto-suggest and the user hasn't
     *  explicitly confirmed. Renders with a soft "suggested" treatment. */
    suggestedIds?: Set<string>;
    onAdd: (p: Project) => void;
    onRemove: (id: string) => void;
    placeholder?: string;
  };

  let {
    selected,
    suggestedIds = new Set<string>(),
    onAdd,
    onRemove,
    placeholder = 'Add a project…'
  }: Props = $props();

  let q = $state('');
  let results = $state<Project[]>([]);
  let open = $state(false);
  let highlight = $state(0);
  let inputEl = $state<HTMLInputElement | undefined>(undefined);
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function onInput() {
    if (timer) clearTimeout(timer);
    const v = q.trim();
    if (!v) {
      results = [];
      open = false;
      return;
    }
    timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/projects?mode=typeahead&q=${encodeURIComponent(v)}&limit=8`);
        if (!res.ok) return;
        const data = (await res.json()) as { items: Project[] };
        results = data.items.filter((p) => !selected.some((s) => s.id === p.id));
        open = results.length > 0;
        highlight = 0;
      } catch {
        // ignore
      }
    }, 150);
  }

  function pick(p: Project) {
    onAdd(p);
    q = '';
    results = [];
    open = false;
    inputEl?.focus();
  }

  function onKey(e: KeyboardEvent) {
    if (!open) {
      if (e.key === 'Backspace' && q === '' && selected.length > 0) {
        onRemove(selected[selected.length - 1].id);
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      highlight = Math.min(results.length - 1, highlight + 1);
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      highlight = Math.max(0, highlight - 1);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      const p = results[highlight];
      if (p) {
        pick(p);
        e.preventDefault();
      }
    } else if (e.key === 'Escape') {
      open = false;
      e.preventDefault();
    }
  }
</script>

<div class="flex flex-col gap-2">
  <div class="flex flex-wrap items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5">
    {#each selected as p (p.id)}
      {@const isSuggested = suggestedIds.has(p.id)}
      <span
        class="inline-flex items-center gap-1 rounded-full py-0.5 pl-2 pr-0.5 text-xs {isSuggested
          ? 'border border-dashed border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)] text-[var(--color-text)]'
          : 'bg-[var(--color-highlight-bg)] text-[var(--color-text)]'}"
        title={isSuggested ? 'Suggested — confirm by saving or remove with X' : undefined}
      >
        {#if isSuggested}
          <Sparkles size={10} strokeWidth={2} />
        {:else}
          <FolderKanban size={10} strokeWidth={2} />
        {/if}
        <span class="max-w-[160px] truncate font-medium">{p.name}</span>
        <button
          type="button"
          onclick={() => onRemove(p.id)}
          aria-label="Remove {p.name}"
          class="rounded-full p-0.5 hover:bg-[var(--color-highlight-border)]"
        ><X size={12} strokeWidth={2} /></button>
      </span>
    {/each}
    <input
      bind:this={inputEl}
      bind:value={q}
      oninput={onInput}
      onkeydown={onKey}
      onfocus={() => (open = results.length > 0)}
      onblur={() => setTimeout(() => (open = false), 150)}
      type="text"
      {placeholder}
      class="min-w-[140px] flex-1 bg-transparent px-2 py-1 text-sm outline-none"
    />
  </div>

  {#if open}
    <ul class="relative">
      <div class="absolute inset-x-0 top-0 z-10 max-h-60 overflow-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-md)]">
        {#each results as p, i (p.id)}
          <button
            type="button"
            onmousedown={(e) => { e.preventDefault(); pick(p); }}
            class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm {i === highlight ? 'bg-[var(--color-highlight-bg)]' : 'hover:bg-[var(--color-bg)]'}"
          >
            <FolderKanban size={12} strokeWidth={2} class="shrink-0 text-[var(--color-subtle)]" />
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate font-medium">{p.name}</span>
              <span class="truncate text-xs text-[var(--color-muted)]">{p.status}</span>
            </span>
          </button>
        {/each}
      </div>
    </ul>
  {/if}
</div>
