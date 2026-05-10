<script lang="ts">
  import { X } from 'lucide-svelte';

  type Person = { id: string; name: string; avatarUrl: string | null; role: string | null };

  type Props = {
    selected: Person[];
    onAdd: (p: Person) => void;
    onRemove: (id: string) => void;
    placeholder?: string;
  };

  let { selected, onAdd, onRemove, placeholder = 'Add a person…' }: Props = $props();

  let q = $state('');
  let results = $state<Person[]>([]);
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
        const res = await fetch(`/api/people?q=${encodeURIComponent(v)}&limit=8`);
        if (!res.ok) return;
        const data = (await res.json()) as { items: Person[] };
        results = data.items.filter((p) => !selected.some((s) => s.id === p.id));
        open = results.length > 0;
        highlight = 0;
      } catch {
        // ignore
      }
    }, 150);
  }

  function pick(p: Person) {
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
      <span class="inline-flex items-center gap-1 rounded-full bg-[var(--color-highlight-bg)] py-0.5 pl-1 pr-0.5 text-xs text-[var(--color-text)]">
        <span class="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border border-[var(--color-highlight-border)] bg-white text-[10px]">
          {#if p.avatarUrl}
            <img src={p.avatarUrl} alt="" class="h-full w-full object-cover" />
          {:else}
            {(p.name[0] ?? '·').toUpperCase()}
          {/if}
        </span>
        <span class="max-w-[140px] truncate font-medium">{p.name}</span>
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
            <span class="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] text-[10px] text-[var(--color-muted)]">
              {#if p.avatarUrl}
                <img src={p.avatarUrl} alt="" class="h-full w-full object-cover" />
              {:else}
                {(p.name[0] ?? '·').toUpperCase()}
              {/if}
            </span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate font-medium">{p.name}</span>
              {#if p.role}
                <span class="truncate text-xs text-[var(--color-muted)]">{p.role}</span>
              {/if}
            </span>
          </button>
        {/each}
      </div>
    </ul>
  {/if}
</div>
