<script lang="ts">
  import Landing from '$lib/components/Landing.svelte';
  import EmptyDashboard from '$lib/components/EmptyDashboard.svelte';
  import InteractionRow from '$lib/components/InteractionRow.svelte';
  import CompanyLogo from '$lib/components/CompanyLogo.svelte';
  import { Users, Building2, MessagesSquare, FolderKanban, Loader2, AlertTriangle, Calendar } from 'lucide-svelte';
  import { invalidateAll } from '$app/navigation';
  import { pollWhile } from '$lib/polling';
  import { APP_NAME, APP_DOMAIN, APP_DESCRIPTION } from '$lib/branding';

  const LANDING_TITLE = `${APP_NAME} — Open Source CRM for Freelancers & Small Businesses`;
  // Escape `<` so a stray closing-script tag in any field cannot break out of the JSON-LD block.
  const softwareSchemaJson = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: APP_NAME,
    description: APP_DESCRIPTION,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web Browser',
    url: `https://${APP_DOMAIN}`,
    license: 'https://www.gnu.org/licenses/agpl-3.0.html',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    publisher: { '@type': 'Organization', name: APP_NAME, url: `https://${APP_DOMAIN}` }
  }).replace(/</g, '\\u003c');

  let { data } = $props();

  const anyParsing = $derived((data.recent ?? []).some((r) => r.source === 'parsing'));

  // First-run state: nothing saved yet, no recent activity. Replace the
  // count cards (which would all read 0) with an onboarding panel that
  // explains what to do next.
  const firstRun = $derived(
    !!data.user &&
      (data.counts?.people ?? 0) === 0 &&
      (data.counts?.companies ?? 0) === 0 &&
      (data.recent ?? []).length === 0 &&
      (data.recentInteractions ?? []).length === 0
  );

  $effect(() => {
    return pollWhile(
      () => anyParsing,
      () => invalidateAll()
    );
  });
</script>

{#if data.user}
  {#if firstRun}
    <EmptyDashboard />
  {:else}
  <section class="flex flex-col gap-6">
    <header class="flex flex-col gap-1">
      <h1 class="text-2xl font-semibold tracking-tight">
        Welcome{data.user.username ? `, ${data.user.username}` : ''}.
      </h1>
      <p class="text-sm text-[var(--color-muted)]">
        Paste a profile or website link in the topbar to save it.<span class="hidden sm:inline"> Press <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 text-[10px]">/</kbd> to search.</span>
      </p>
    </header>

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {#each [
        { href: '/people', icon: Users, value: data.counts?.people ?? 0, label: 'People' },
        { href: '/companies', icon: Building2, value: data.counts?.companies ?? 0, label: 'Companies' },
        { href: '/interactions', icon: MessagesSquare, value: data.counts?.interactionsThisMonth ?? 0, label: 'Interactions this month' },
        { href: '/projects', icon: FolderKanban, value: data.counts?.projects ?? 0, label: 'Active projects' }
      ] as card (card.href)}
        <a
          href={card.href}
          class="group flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-xs)] transition-all hover:-translate-y-px hover:border-[var(--color-border-strong)] hover:shadow-[var(--shadow-sm)]"
        >
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] text-[var(--color-muted)] transition-colors group-hover:bg-[var(--color-accent)] group-hover:text-[var(--color-accent-fg)]">
            <card.icon size={16} strokeWidth={2} />
          </span>
          <div class="min-w-0">
            <div class="tabular text-2xl font-semibold tracking-tight">{card.value}</div>
            <div class="truncate text-xs text-[var(--color-muted)]">{card.label}</div>
          </div>
        </a>
      {/each}
    </div>

    {#if data.endingSoon && data.endingSoon.length > 0}
      <section class="flex flex-col gap-2">
        <h2 class="text-sm font-medium text-[var(--color-muted)]">Ending soon</h2>
        <ul class="flex flex-col gap-1">
          {#each data.endingSoon as p (p.id)}
            {@const overdue = p.endDate != null && p.endDate < Date.now()}
            {@const days = p.endDate == null ? null : Math.round((p.endDate - Date.now()) / 86_400_000)}
            <li>
              <a
                href={`/projects/${p.id}`}
                class="flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 hover:border-[var(--color-border-strong)]"
              >
                <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] {overdue ? 'text-[var(--color-danger)]' : 'text-[var(--color-muted)]'}">
                  {#if overdue}
                    <AlertTriangle size={14} strokeWidth={2} />
                  {:else}
                    <Calendar size={14} strokeWidth={2} />
                  {/if}
                </span>
                <span class="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                <span class="text-xs {overdue ? 'text-[var(--color-danger)]' : 'text-[var(--color-muted)]'}">
                  {#if overdue}{Math.abs(days ?? 0)}d overdue{:else if days === 0}Today{:else}In {days}d{/if}
                </span>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if (data.recent && data.recent.length > 0) || (data.recentInteractions && data.recentInteractions.length > 0)}
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <!-- Recently saved -->
        {#if data.recent && data.recent.length > 0}
          <section class="flex flex-col gap-1 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
            <h2 class="mb-2 text-sm font-medium text-[var(--color-muted)]">Recently saved</h2>
            <ul class="flex flex-col">
              {#each data.recent as r (r.kind + r.id)}
                <li>
                  <a
                    href={r.kind === 'person' ? `/people/${r.id}` : `/companies/${r.id}`}
                    class="flex items-center gap-3 rounded-[var(--radius-sm)] px-2 py-2 transition-colors hover:bg-[var(--color-surface)]"
                  >
                    {#if r.kind === 'company'}
                      <CompanyLogo domain={r.domain} name={r.name} size={32} rounded="sm" />
                    {:else}
                      <span class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-muted)]">
                        {#if r.avatarUrl}
                          <img src={r.avatarUrl} alt="" class="h-full w-full object-cover" />
                        {:else}
                          {(r.name[0] ?? '·').toUpperCase()}
                        {/if}
                      </span>
                    {/if}
                    <span class="min-w-0 flex-1">
                      <span class="flex items-center gap-2">
                        <span class="truncate text-sm font-medium">{r.name}</span>
                        {#if r.source === 'parsing'}
                          <Loader2 size={12} strokeWidth={2} class="animate-spin text-[var(--color-subtle)]" />
                        {/if}
                      </span>
                      <span class="block truncate text-xs text-[var(--color-muted)]">
                        {r.kind === 'person' ? 'Person' : 'Company'} · {r.sub ?? ''}
                      </span>
                    </span>
                  </a>
                </li>
              {/each}
            </ul>
          </section>
        {/if}

        <!-- Recent interactions -->
        {#if data.recentInteractions && data.recentInteractions.length > 0}
          <section class="flex flex-col gap-1 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
            <h2 class="mb-2 text-sm font-medium text-[var(--color-muted)]">Recent interactions</h2>
            <ul class="flex flex-col gap-0.5">
              {#each data.recentInteractions as i (i.id)}
                <li>
                  <InteractionRow {...i} />
                </li>
              {/each}
            </ul>
          </section>
        {/if}
      </div>
    {/if}
  </section>
  {/if}
{:else}
  <Landing authConfig={data.authConfig} />
{/if}

<svelte:head>
  {#if !data.user}
    <title>{LANDING_TITLE}</title>
    <meta property="og:title" content={LANDING_TITLE} />
    <meta name="twitter:title" content={LANDING_TITLE} />
    {@html `<script type="application/ld+json">${softwareSchemaJson}<\/script>`}
  {/if}
</svelte:head>
