<script lang="ts">
  import { Plus, Pencil } from 'lucide-svelte';
  import { dismiss } from '$lib/dismiss.svelte';
  import CompanyLogo from './CompanyLogo.svelte';
  import { toast } from '$lib/toasts.svelte';

  type Company = { id: string; name: string; logoUrl: string | null; faviconUrl: string | null; domain: string | null };

  type Props = {
    companyId: string | null;
    companyName: string | null;
    companyDomain: string | null;
    companyLogoUrl: string | null;
    companyFaviconUrl: string | null;
    onPick: (c: Company | null) => void;
  };

  let { companyId, companyName, companyDomain, companyLogoUrl, companyFaviconUrl, onPick }: Props = $props();

  let editing = $state(false);
  let q = $state('');
  let results = $state<Company[]>([]);
  let inputEl = $state<HTMLInputElement | undefined>(undefined);
  let creating = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function open() {
    editing = true;
    q = companyName ?? '';
    results = [];
    setTimeout(() => { inputEl?.focus(); inputEl?.select(); }, 0);
  }

  function close() {
    editing = false;
    q = '';
    results = [];
    if (timer) clearTimeout(timer);
  }

  async function search(v: string) {
    if (timer) clearTimeout(timer);
    if (!v.trim()) { results = []; return; }
    timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/companies?q=${encodeURIComponent(v.trim())}&limit=6`);
        if (!res.ok) return;
        const data = (await res.json()) as { items: Company[] };
        results = data.items;
      } catch { /* ignore */ }
    }, 150);
  }

  function pick(c: Company) {
    onPick(c);
    close();
  }

  async function createAndPick() {
    const name = q.trim();
    if (!name || creating) return;
    creating = true;
    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!res.ok) { toast.danger('Could not create company'); return; }
      const data = (await res.json()) as { id: string };
      pick({ id: data.id, name, logoUrl: null, faviconUrl: null, domain: null });
    } catch {
      toast.danger('Could not create company');
    } finally {
      creating = false;
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (results.length > 0) pick(results[0]);
      else if (q.trim()) createAndPick();
    }
  }
</script>

<div use:dismiss={editing ? close : null} class="relative min-w-0">
  {#if editing}
    <input
      bind:this={inputEl}
      bind:value={q}
      type="text"
      placeholder="Search companies…"
      oninput={() => search(q)}
      onkeydown={onKey}
      class="h-6 w-full rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-1.5 text-sm outline-none"
    />
    {#if results.length > 0 || q.trim()}
      <ul class="absolute left-0 top-7 z-50 w-[220px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-md)]">
        {#each results as c (c.id)}
          <li>
            <button
              type="button"
              onmousedown={(e) => { e.preventDefault(); pick(c); }}
              class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-[var(--color-surface-2)]"
            >
              <CompanyLogo domain={c.domain} fallbackUrl={c.logoUrl ?? c.faviconUrl} name={c.name} size={18} class="text-[8px]" />
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate font-medium">{c.name}</span>
                {#if c.domain}<span class="truncate text-[var(--color-muted)]">{c.domain}</span>{/if}
              </span>
            </button>
          </li>
        {/each}
        {#if q.trim() && !results.some(c => c.name.toLowerCase() === q.trim().toLowerCase())}
          <li>
            <button
              type="button"
              onmousedown={(e) => { e.preventDefault(); createAndPick(); }}
              disabled={creating}
              class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] {results.length > 0 ? 'border-t border-[var(--color-border)]' : ''}"
            >
              <Plus size={12} strokeWidth={2} />
              <span>Add "<span class="font-medium text-[var(--color-text)]">{q.trim()}</span>"</span>
            </button>
          </li>
        {/if}
      </ul>
    {/if}
  {:else if companyId && companyName}
    <div class="group inline-flex min-w-0 max-w-full items-center gap-1">
      <a
        href={`/companies/${companyId}`}
        class="inline-flex max-w-full items-center gap-1.5 rounded-[var(--radius-sm)] px-1 py-0.5 text-sm text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)]"
      >
        <CompanyLogo domain={companyDomain} fallbackUrl={companyLogoUrl ?? companyFaviconUrl} name={companyName} size={16} class="shrink-0 text-[8px]" />
        <span class="truncate">{companyName}</span>
      </a>
      <button
        type="button"
        onclick={(e) => { e.stopPropagation(); open(); }}
        aria-label="Change company"
        class="hidden rounded p-0.5 text-[var(--color-subtle)] transition-colors hover:text-[var(--color-text)] group-hover:inline-flex"
      >
        <Pencil size={11} strokeWidth={2} />
      </button>
    </div>
  {:else}
    <button
      type="button"
      onclick={(e) => { e.stopPropagation(); open(); }}
      class="inline-flex min-h-[24px] items-center rounded-[var(--radius-sm)] px-1 py-0.5 transition-colors hover:bg-[var(--color-surface-2)]"
    >
      <span class="text-xs text-[var(--color-subtle)]">·</span>
    </button>
  {/if}
</div>
