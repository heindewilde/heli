<script lang="ts">
  import { Pencil } from 'lucide-svelte';
  import CompanyLogo from './CompanyLogo.svelte';
  import { toast } from '$lib/toasts.svelte';
  import Popover from '$lib/ui/Popover.svelte';
  import Combobox from '$lib/ui/Combobox.svelte';

  type Company = {
    id: string;
    name: string;
    logoUrl: string | null;
    faviconUrl: string | null;
    domain: string | null;
  };

  type Props = {
    companyId: string | null;
    companyName: string | null;
    companyDomain: string | null;
    companyLogoUrl: string | null;
    companyFaviconUrl: string | null;
    onPick: (c: Company | null) => void;
  };

  let {
    companyId,
    companyName,
    companyDomain,
    companyLogoUrl,
    companyFaviconUrl,
    onPick
  }: Props = $props();

  let open = $state(false);

  async function search(q: string): Promise<Company[]> {
    if (!q) return [];
    const res = await fetch(`/api/companies?q=${encodeURIComponent(q)}&limit=6`);
    if (!res.ok) return [];
    const data = (await res.json()) as { items: Company[] };
    return data.items;
  }

  async function createAndPick(name: string, close: () => void) {
    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!res.ok) {
        toast.danger('Could not create company');
        return;
      }
      const data = (await res.json()) as { id: string };
      onPick({ id: data.id, name, logoUrl: null, faviconUrl: null, domain: null });
      close();
    } catch {
      toast.danger('Could not create company');
    }
  }
</script>

<Popover bind:open label="Company" panelRole="dialog" autoFocus={false} class="min-w-0">
  {#snippet trigger(attrs)}
    {#if companyId && companyName}
      <span class="group inline-flex min-w-0 max-w-full items-center gap-1">
        <a
          href={`/companies/${companyId}`}
          class="inline-flex max-w-full items-center gap-1.5 rounded-[var(--radius-sm)] px-1 py-0.5 text-sm text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)]"
        >
          <CompanyLogo
            domain={companyDomain}
            fallbackUrl={companyLogoUrl ?? companyFaviconUrl}
            name={companyName}
            size={16}
            class="shrink-0 text-[8px]"
          />
          <span class="truncate">{companyName}</span>
        </a>
        <button
          {...attrs}
          type="button"
          aria-label="Change company"
          class="hidden rounded p-0.5 text-[var(--color-subtle)] transition-colors hover:text-[var(--color-text)] group-hover:inline-flex"
        >
          <Pencil size={11} strokeWidth={2} />
        </button>
      </span>
    {:else}
      <button
        {...attrs}
        type="button"
        aria-label="Set company"
        class="inline-flex min-h-[24px] items-center rounded-[var(--radius-sm)] px-1 py-0.5 transition-colors hover:bg-[var(--color-surface-2)]"
      >
        <span class="text-xs text-[var(--color-subtle)]">—</span>
      </button>
    {/if}
  {/snippet}

  {#snippet content({ close })}
    <div class="w-[220px]">
      <Combobox
        {search}
        getId={(c) => c.id}
        placeholder="Search companies…"
        emptyText="Type to search."
        canCreate={(q, results) => !results.some((c) => c.name.toLowerCase() === q.toLowerCase())}
        createLabel={(q) => `Add “${q}”`}
        onCreate={(q) => createAndPick(q, close)}
        onSelect={(c) => {
          onPick(c);
          close();
        }}
      >
        {#snippet option(c: Company)}
          <CompanyLogo
            domain={c.domain}
            fallbackUrl={c.logoUrl ?? c.faviconUrl}
            name={c.name}
            size={18}
            class="text-[8px]"
          />
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate font-medium">{c.name}</span>
            {#if c.domain}<span class="truncate text-[var(--color-muted)]">{c.domain}</span>{/if}
          </span>
        {/snippet}
      </Combobox>
    </div>
  {/snippet}
</Popover>
