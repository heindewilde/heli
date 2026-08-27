<script lang="ts">
  /**
   * The "Add" control on a collection page.
   *
   * **A component rather than a snippet, and that is the whole point.** The
   * collection page renders this in two places — the toolbar and the empty
   * state — and as a snippet both renders shared one `let adding = $state()`,
   * so opening either opened *both* panels at once. That is the "one popover
   * per instance" rule in CLAUDE.md: a `Popover` owns a bindable `open`, and
   * anything that needs N of them needs N components.
   *
   * **One combobox, not two.** It used to be a `PersonPicker` stacked on a
   * `CompanyPicker`, both `variant="field"` — and a field combobox renders its
   * results as `absolute top-full`, which inside a Popover panel means the list
   * is drawn *within* the panel: clipped, scrolled in its own little box, and
   * overlapping the picker underneath it. `variant="panel"` is the documented
   * shape inside a Popover, because then the list *is* the panel and grows with
   * its content. One field also matches how people actually think here — you
   * know the name, not whether Heli files it as a person or a company.
   *
   * The kind filter still narrows it: on `?kind=people` only people are
   * searched, so adding a company from the People view and watching it vanish
   * stays designed out.
   */
  import { Plus, Building2, User } from 'lucide-svelte';
  import Popover from '$lib/ui/Popover.svelte';
  import Combobox from '$lib/ui/Combobox.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Avatar from '$lib/ui/Avatar.svelte';
  import CompanyLogo from '$lib/components/CompanyLogo.svelte';
  import { toast } from '$lib/toasts.svelte';

  type Kind = 'all' | 'people' | 'companies';

  type Candidate = {
    kind: 'person' | 'company';
    id: string;
    name: string;
    sub: string | null;
    avatarUrl?: string | null;
    logoUrl?: string | null;
    faviconUrl?: string | null;
    domain?: string | null;
  };

  type Props = {
    kind: Kind;
    /** Ids already in the collection, so they are filtered out of results. */
    memberKeys: Set<string>;
    onAdd: (kind: 'person' | 'company', refId: string) => Promise<void> | void;
    variant?: 'primary' | 'secondary';
  };

  let { kind, memberKeys, onAdd, variant = 'primary' }: Props = $props();

  let open = $state(false);

  const wantsPeople = $derived(kind !== 'companies');
  const wantsCompanies = $derived(kind !== 'people');

  async function search(q: string): Promise<Candidate[]> {
    const needle = q.trim();
    if (!needle) return [];
    // Two endpoints that already exist, in parallel. `/api/search` would be one
    // request, but it spends its per-kind budget on interactions, projects,
    // pipelines and collections — none of which can be a collection member.
    const [people, companies] = await Promise.all([
      wantsPeople ? fetchPeople(needle) : Promise.resolve<Candidate[]>([]),
      wantsCompanies ? fetchCompanies(needle) : Promise.resolve<Candidate[]>([])
    ]);
    return [...people, ...companies].filter((c) => !memberKeys.has(`${c.kind}:${c.id}`));
  }

  async function fetchPeople(q: string): Promise<Candidate[]> {
    const res = await fetch(`/api/people?q=${encodeURIComponent(q)}&limit=6`);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      items: { id: string; name: string; role: string | null; avatarUrl: string | null }[];
    };
    return data.items.map((p) => ({
      kind: 'person' as const,
      id: p.id,
      name: p.name,
      sub: p.role,
      avatarUrl: p.avatarUrl
    }));
  }

  async function fetchCompanies(q: string): Promise<Candidate[]> {
    const res = await fetch(`/api/companies?q=${encodeURIComponent(q)}&limit=6`);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      items: {
        id: string;
        name: string;
        domain: string | null;
        logoUrl: string | null;
        faviconUrl: string | null;
      }[];
    };
    return data.items.map((c) => ({
      kind: 'company' as const,
      id: c.id,
      name: c.name,
      sub: c.domain,
      logoUrl: c.logoUrl,
      faviconUrl: c.faviconUrl,
      domain: c.domain
    }));
  }

  /**
   * Creating is offered only when the view has already settled the kind. With
   * both kinds in one list, "Create 'Acme'" would have to guess whether that is
   * a person or a company, and guessing wrong writes a record in the wrong
   * table — worse than sending you to the filter first.
   */
  const createKind = $derived(
    kind === 'people' ? ('person' as const) : kind === 'companies' ? ('company' as const) : null
  );

  async function create(name: string) {
    if (!createKind) return;
    const endpoint = createKind === 'person' ? '/api/people' : '/api/companies';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!res.ok) {
        toast.danger(`Could not create ${createKind}`);
        return;
      }
      const created = (await res.json()) as { id: string };
      await onAdd(createKind, created.id);
    } catch {
      toast.danger(`Could not create ${createKind}`);
    }
  }
</script>

<Popover bind:open label="Add to collection" panelRole="dialog" autoFocus={false}>
  {#snippet trigger(attrs)}
    <Button {...attrs} {variant}>
      <Plus size={14} strokeWidth={2} />
      Add
    </Button>
  {/snippet}
  {#snippet content()}
    <!-- Sized here rather than on the Combobox: the list is the panel, so the
         panel is what needs a width, and its height follows the results. -->
    <div class="w-80">
      <Combobox
        {search}
        getId={(c) => `${c.kind}:${c.id}`}
        autoFocus
        placeholder={kind === 'people'
          ? 'Search people…'
          : kind === 'companies'
            ? 'Search companies…'
            : 'Search people and companies…'}
        emptyText="Type to search."
        onSelect={(c) => onAdd(c.kind, c.id)}
        onCreate={createKind ? create : undefined}
        createLabel={(q) => `Create “${q}” and add`}
      >
        {#snippet option(c, active)}
          <span class="flex min-w-0 flex-1 items-center gap-2 {active ? 'font-medium' : ''}">
            {#if c.kind === 'person'}
              <Avatar name={c.name} src={c.avatarUrl ?? null} size="xs" />
            {:else}
              <CompanyLogo
                name={c.name}
                domain={c.domain ?? null}
                fallbackUrl={c.logoUrl ?? c.faviconUrl ?? null}
                size={20}
              />
            {/if}
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm">{c.name}</span>
              {#if c.sub}
                <span class="block truncate text-[11px] text-[var(--color-subtle)]">{c.sub}</span>
              {/if}
            </span>
            <!-- Only worth saying when both kinds can appear in one list. -->
            {#if kind === 'all'}
              <span
                class="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] text-[var(--color-subtle)]"
              >
                {#if c.kind === 'person'}
                  <User size={9} strokeWidth={2} /> Person
                {:else}
                  <Building2 size={9} strokeWidth={2} /> Company
                {/if}
              </span>
            {/if}
          </span>
        {/snippet}
      </Combobox>
    </div>
  {/snippet}
</Popover>
