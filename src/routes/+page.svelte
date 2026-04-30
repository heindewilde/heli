<script lang="ts">
  import Landing from '$lib/components/Landing.svelte';
  import { Users, Building2, Loader2 } from 'lucide-svelte';

  let { data } = $props();
</script>

{#if data.user}
  <section class="flex flex-col gap-6">
    <header class="flex flex-col gap-1">
      <h1 class="text-2xl font-semibold tracking-tight">
        Welcome{data.user.username ? `, ${data.user.username}` : ''}.
      </h1>
      <p class="text-sm text-[var(--color-muted)]">
        Paste a profile or website link in the topbar to save it. Press <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 text-[10px]">/</kbd> to search.
      </p>
    </header>

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <a
        href="/people"
        class="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-border-strong)]"
      >
        <Users size={20} strokeWidth={2} class="text-[var(--color-muted)]" />
        <div>
          <div class="text-2xl font-semibold tracking-tight">{data.counts?.people ?? 0}</div>
          <div class="text-xs text-[var(--color-muted)]">People</div>
        </div>
      </a>
      <a
        href="/companies"
        class="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-border-strong)]"
      >
        <Building2 size={20} strokeWidth={2} class="text-[var(--color-muted)]" />
        <div>
          <div class="text-2xl font-semibold tracking-tight">{data.counts?.companies ?? 0}</div>
          <div class="text-xs text-[var(--color-muted)]">Companies</div>
        </div>
      </a>
    </div>

    {#if data.recent && data.recent.length > 0}
      <section class="flex flex-col gap-2">
        <h2 class="text-sm font-medium text-[var(--color-muted)]">Recently saved</h2>
        <ul class="flex flex-col gap-1">
          {#each data.recent as r (r.kind + r.id)}
            <li>
              <a
                href={r.kind === 'person' ? `/people/${r.id}` : `/companies/${r.id}`}
                class="flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 hover:border-[var(--color-border-strong)]"
              >
                <span class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-{r.kind === 'person' ? 'full' : 'sm'} border border-[var(--color-border)] bg-[var(--color-bg)] text-xs text-[var(--color-muted)]">
                  {#if r.avatarUrl}
                    <img src={r.avatarUrl} alt="" class="h-full w-full object-cover" />
                  {:else}
                    {(r.name[0] ?? '·').toUpperCase()}
                  {/if}
                </span>
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
  </section>
{:else}
  <Landing />
{/if}
