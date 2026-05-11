<script lang="ts">
  import { X } from 'lucide-svelte';
  import CompanyLogo from './CompanyLogo.svelte';

  type Company = { id: string; name: string; logoUrl: string | null; faviconUrl: string | null; domain: string | null };

  type Props = {
    selected: Company | null;
    onPick: (c: Company | null) => void;
    placeholder?: string;
  };

  let { selected, onPick, placeholder = 'Link a company (optional)…' }: Props = $props();

  let q = $state('');
  let results = $state<Company[]>([]);
  let open = $state(false);
  let highlight = $state(0);
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
        const res = await fetch(`/api/companies?q=${encodeURIComponent(v)}&limit=8`);
        if (!res.ok) return;
        const data = (await res.json()) as { items: Company[] };
        results = data.items;
        open = results.length > 0;
        highlight = 0;
      } catch {
        // ignore
      }
    }, 150);
  }

  function pick(c: Company) {
    onPick(c);
    q = '';
    results = [];
    open = false;
  }

  function clear() {
    onPick(null);
  }

  function onKey(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      highlight = Math.min(results.length - 1, highlight + 1);
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      highlight = Math.max(0, highlight - 1);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      const c = results[highlight];
      if (c) {
        pick(c);
        e.preventDefault();
      }
    } else if (e.key === 'Escape') {
      open = false;
      e.preventDefault();
    }
  }
</script>

<div class="flex flex-col gap-2">
  {#if selected}
    <div class="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm">
      <CompanyLogo
        domain={selected.domain}
        fallbackUrl={selected.logoUrl ?? selected.faviconUrl}
        name={selected.name}
        size={24}
        class="text-[10px]"
      />
      <span class="min-w-0 flex-1 truncate font-medium">{selected.name}</span>
      <button
        type="button"
        onclick={clear}
        aria-label="Remove company"
        class="rounded-full p-1 text-[var(--color-subtle)] hover:bg-[var(--color-bg)]"
      ><X size={12} strokeWidth={2} /></button>
    </div>
  {:else}
    <div class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5">
      <input
        bind:value={q}
        oninput={onInput}
        onkeydown={onKey}
        onfocus={() => (open = results.length > 0)}
        onblur={() => setTimeout(() => (open = false), 150)}
        type="text"
        {placeholder}
        class="w-full bg-transparent px-2 py-1 text-sm outline-none"
      />
    </div>
    {#if open}
      <ul class="relative">
        <div class="absolute inset-x-0 top-0 z-10 max-h-60 overflow-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-md)]">
          {#each results as c, i (c.id)}
            <button
              type="button"
              onmousedown={(e) => { e.preventDefault(); pick(c); }}
              class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm {i === highlight ? 'bg-[var(--color-highlight-bg)]' : 'hover:bg-[var(--color-bg)]'}"
            >
              <CompanyLogo
                domain={c.domain}
                fallbackUrl={c.logoUrl ?? c.faviconUrl}
                name={c.name}
                size={24}
                class="text-[10px]"
              />
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate font-medium">{c.name}</span>
                {#if c.domain}
                  <span class="truncate text-xs text-[var(--color-muted)]">{c.domain}</span>
                {/if}
              </span>
            </button>
          {/each}
        </div>
      </ul>
    {/if}
  {/if}
</div>
