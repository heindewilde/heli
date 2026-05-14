<script lang="ts">
  import { Plus, Loader2 } from 'lucide-svelte';
  import CompanyLogo from './CompanyLogo.svelte';
  import { toast } from '$lib/toasts.svelte';

  type Person = { id: string; name: string; avatarUrl: string | null; role: string | null };
  type Company = { id: string; name: string; logoUrl: string | null; faviconUrl: string | null; domain: string | null };
  type Result = { kind: 'person'; data: Person } | { kind: 'company'; data: Company };

  type Props = {
    onAdd: (kind: 'person' | 'company', refId: string) => void;
  };

  let { onAdd }: Props = $props();

  let q = $state('');
  let results = $state<Result[]>([]);
  let open = $state(false);
  let highlight = $state(0);
  let creating = $state<'person' | 'company' | null>(null);
  let inputEl = $state<HTMLInputElement | undefined>(undefined);
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function onInput() {
    if (timer) clearTimeout(timer);
    const v = q.trim();
    if (!v) { results = []; open = false; return; }
    timer = setTimeout(async () => {
      try {
        const [pr, cr] = await Promise.all([
          fetch(`/api/people?q=${encodeURIComponent(v)}&limit=5`).then((r) => r.json()),
          fetch(`/api/companies?q=${encodeURIComponent(v)}&limit=5`).then((r) => r.json())
        ]);
        results = [
          ...(pr.items as Person[]).map((p) => ({ kind: 'person' as const, data: p })),
          ...(cr.items as Company[]).map((c) => ({ kind: 'company' as const, data: c }))
        ];
        open = true;
        highlight = 0;
      } catch { /* ignore */ }
    }, 150);
  }

  function pick(r: Result) {
    onAdd(r.kind, r.data.id);
    q = '';
    results = [];
    open = false;
    inputEl?.focus();
  }

  async function create(kind: 'person' | 'company') {
    const name = q.trim();
    if (!name || creating) return;
    creating = kind;
    try {
      const res = await fetch(kind === 'person' ? '/api/people' : '/api/companies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!res.ok) { toast.danger(`Could not create ${kind}`); return; }
      const data = (await res.json()) as { id: string };
      onAdd(kind, data.id);
      q = '';
      results = [];
      open = false;
      inputEl?.focus();
    } catch {
      toast.danger(`Could not create ${kind}`);
    } finally {
      creating = null;
    }
  }

  function onKey(e: KeyboardEvent) {
    if (!open) return;
    const total = results.length + 2;
    if (e.key === 'ArrowDown') { highlight = Math.min(total - 1, highlight + 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { highlight = Math.max(0, highlight - 1); e.preventDefault(); }
    else if (e.key === 'Enter') {
      if (highlight < results.length) { pick(results[highlight]!); e.preventDefault(); }
      else if (highlight === results.length) { create('person'); e.preventDefault(); }
      else { create('company'); e.preventDefault(); }
    } else if (e.key === 'Escape') { open = false; e.preventDefault(); }
  }
</script>

<div class="relative">
  <div class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5">
    <input
      bind:this={inputEl}
      bind:value={q}
      oninput={onInput}
      onkeydown={onKey}
      onfocus={() => (open = q.trim().length > 0)}
      onblur={() => setTimeout(() => (open = false), 150)}
      type="text"
      placeholder="Add person or company…"
      class="w-full bg-transparent px-2 py-1 text-sm outline-none"
    />
  </div>
  {#if open}
    <div class="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-md)]">
      {#each results as r, i (r.kind + r.data.id)}
        <button
          type="button"
          onmousedown={(e) => { e.preventDefault(); pick(r); }}
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm {i === highlight ? 'bg-[var(--color-highlight-bg)]' : 'hover:bg-[var(--color-bg)]'}"
        >
          {#if r.kind === 'person'}
            <span class="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] text-[10px] text-[var(--color-muted)]">
              {#if r.data.avatarUrl}
                <img src={r.data.avatarUrl} alt="" class="h-full w-full object-cover" />
              {:else}
                {(r.data.name[0] ?? '·').toUpperCase()}
              {/if}
            </span>
          {:else}
            <CompanyLogo
              domain={r.data.domain}
              fallbackUrl={r.data.logoUrl ?? r.data.faviconUrl}
              name={r.data.name}
              size={24}
              class="text-[10px]"
            />
          {/if}
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate font-medium">{r.data.name}</span>
            {#if r.kind === 'person' && r.data.role}
              <span class="truncate text-xs text-[var(--color-muted)]">{r.data.role}</span>
            {:else if r.kind === 'company' && r.data.domain}
              <span class="truncate text-xs text-[var(--color-muted)]">{r.data.domain}</span>
            {/if}
          </span>
          <span class="shrink-0 text-[10px] text-[var(--color-subtle)]">{r.kind}</span>
        </button>
      {/each}
      <button
        type="button"
        onmousedown={(e) => { e.preventDefault(); create('person'); }}
        disabled={!!creating}
        class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm {highlight === results.length ? 'bg-[var(--color-highlight-bg)]' : 'hover:bg-[var(--color-bg)]'} text-[var(--color-muted)]"
      >
        {#if creating === 'person'}
          <Loader2 size={14} strokeWidth={2} class="animate-spin" />
        {:else}
          <Plus size={14} strokeWidth={2} />
        {/if}
        <span>New person "<span class="font-medium text-[var(--color-text)]">{q.trim()}</span>"</span>
      </button>
      <button
        type="button"
        onmousedown={(e) => { e.preventDefault(); create('company'); }}
        disabled={!!creating}
        class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm {highlight === results.length + 1 ? 'bg-[var(--color-highlight-bg)]' : 'hover:bg-[var(--color-bg)]'} text-[var(--color-muted)]"
      >
        {#if creating === 'company'}
          <Loader2 size={14} strokeWidth={2} class="animate-spin" />
        {:else}
          <Plus size={14} strokeWidth={2} />
        {/if}
        <span>New company "<span class="font-medium text-[var(--color-text)]">{q.trim()}</span>"</span>
      </button>
    </div>
  {/if}
</div>
