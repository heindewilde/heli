<script lang="ts">
  import { X } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';
  import Combobox from '$lib/ui/Combobox.svelte';
  import CompanyLogo from './CompanyLogo.svelte';

  type Company = {
    id: string;
    name: string;
    logoUrl: string | null;
    faviconUrl: string | null;
    domain: string | null;
  };

  type Props = {
    selected: Company | null;
    onPick: (c: Company | null) => void;
    placeholder?: string;
  };

  let { selected, onPick, placeholder = 'Link a company (optional)…' }: Props = $props();

  async function search(q: string): Promise<Company[]> {
    if (!q) return [];
    const res = await fetch(`/api/companies?q=${encodeURIComponent(q)}&limit=8`);
    if (!res.ok) return [];
    const data = (await res.json()) as { items: Company[] };
    return data.items;
  }

  async function createAndPick(name: string) {
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
    } catch {
      toast.danger('Could not create company');
    }
  }
</script>

{#if selected}
  <div
    class="flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
  >
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
      onclick={() => onPick(null)}
      aria-label="Remove company"
      class="flex size-6 shrink-0 items-center justify-center rounded-full text-[var(--color-subtle)] hover:bg-[var(--color-bg)]"
      ><X size={12} strokeWidth={2} /></button
    >
  </div>
{:else}
  <Combobox
    variant="field"
    {search}
    getId={(c) => c.id}
    {placeholder}
    autoFocus={false}
    onSelect={onPick}
    onCreate={createAndPick}
    createLabel={(q) => `Add “${q}”`}
  >
    {#snippet option(c: Company)}
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
    {/snippet}
  </Combobox>
{/if}
