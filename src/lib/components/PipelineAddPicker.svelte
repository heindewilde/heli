<script lang="ts">
  import { Plus } from 'lucide-svelte';
  import CompanyLogo from './CompanyLogo.svelte';
  import { toast } from '$lib/toasts.svelte';
  import Combobox from '$lib/ui/Combobox.svelte';

  type Person = { id: string; name: string; avatarUrl: string | null; role: string | null };
  type Company = {
    id: string;
    name: string;
    logoUrl: string | null;
    faviconUrl: string | null;
    domain: string | null;
  };

  // This picker is the one site with *two* create affordances ("new person" and
  // "new company"). Rather than growing the primitive a second create slot,
  // they ride along as synthetic rows — which keeps them inside the same
  // arrow-key sequence they were already part of.
  type Row =
    | { kind: 'person'; id: string; data: Person }
    | { kind: 'company'; id: string; data: Company }
    | { kind: 'new'; id: string; create: 'person' | 'company'; name: string };

  type Props = {
    onAdd: (kind: 'person' | 'company', refId: string) => void;
  };

  let { onAdd }: Props = $props();

  let box = $state<ReturnType<typeof Combobox> | undefined>(undefined);

  async function search(q: string): Promise<Row[]> {
    if (!q) return [];
    const [pr, cr] = await Promise.all([
      fetch(`/api/people?q=${encodeURIComponent(q)}&limit=5`).then((r) => r.json()),
      fetch(`/api/companies?q=${encodeURIComponent(q)}&limit=5`).then((r) => r.json())
    ]);
    return [
      ...(pr.items as Person[]).map((p) => ({ kind: 'person' as const, id: `p:${p.id}`, data: p })),
      ...(cr.items as Company[]).map((c) => ({
        kind: 'company' as const,
        id: `c:${c.id}`,
        data: c
      })),
      { kind: 'new' as const, id: 'new:person', create: 'person' as const, name: q },
      { kind: 'new' as const, id: 'new:company', create: 'company' as const, name: q }
    ];
  }

  async function create(kind: 'person' | 'company', name: string) {
    try {
      const res = await fetch(kind === 'person' ? '/api/people' : '/api/companies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!res.ok) {
        toast.danger(`Could not create ${kind}`);
        return;
      }
      const data = (await res.json()) as { id: string };
      onAdd(kind, data.id);
      box?.reset();
      box?.focus();
    } catch {
      toast.danger(`Could not create ${kind}`);
    }
  }

  function select(r: Row) {
    if (r.kind === 'new') {
      create(r.create, r.name);
      return;
    }
    onAdd(r.kind, r.data.id);
    box?.reset();
    box?.focus();
  }
</script>

<Combobox
  bind:this={box}
  variant="field"
  {search}
  getId={(r) => r.id}
  placeholder="Add person or company…"
  autoFocus={false}
  onSelect={select}
>
  {#snippet option(r: Row)}
    {#if r.kind === 'new'}
      <Plus size={14} strokeWidth={2} class="shrink-0 text-[var(--color-muted)]" />
      <span class="min-w-0 flex-1 truncate text-[var(--color-muted)]"
        >New {r.create} “<span class="font-medium text-[var(--color-text)]">{r.name}</span>”</span
      >
    {:else if r.kind === 'person'}
      <span
        class="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] text-[10px] text-[var(--color-muted)]"
      >
        {#if r.data.avatarUrl}
          <img src={r.data.avatarUrl} alt="" class="h-full w-full object-cover" />
        {:else}
          {(r.data.name[0] ?? '·').toUpperCase()}
        {/if}
      </span>
      <span class="flex min-w-0 flex-1 flex-col">
        <span class="truncate font-medium">{r.data.name}</span>
        {#if r.data.role}
          <span class="truncate text-xs text-[var(--color-muted)]">{r.data.role}</span>
        {/if}
      </span>
      <span class="shrink-0 text-[10px] text-[var(--color-subtle)]">person</span>
    {:else}
      <CompanyLogo
        domain={r.data.domain}
        fallbackUrl={r.data.logoUrl ?? r.data.faviconUrl}
        name={r.data.name}
        size={24}
        class="text-[10px]"
      />
      <span class="flex min-w-0 flex-1 flex-col">
        <span class="truncate font-medium">{r.data.name}</span>
        {#if r.data.domain}
          <span class="truncate text-xs text-[var(--color-muted)]">{r.data.domain}</span>
        {/if}
      </span>
      <span class="shrink-0 text-[10px] text-[var(--color-subtle)]">company</span>
    {/if}
  {/snippet}
</Combobox>
