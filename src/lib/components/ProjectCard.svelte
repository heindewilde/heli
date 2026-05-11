<script lang="ts">
  import { Briefcase, AlertTriangle, Users, CalendarClock } from 'lucide-svelte';
  import StatusChip from './StatusChip.svelte';
  import CompanyLogo from './CompanyLogo.svelte';
  import type { ProjectStatus } from '$lib/server/schema';

  type Company = { id: string; name: string; domain: string | null; logoUrl: string | null; faviconUrl: string | null };

  type Props = {
    href: string;
    name: string;
    description?: string | null;
    status: ProjectStatus;
    startDate?: number | null;
    endDate?: number | null;
    memberCount: number;
    companies?: Company[];
    selected?: boolean;
  };

  let {
    href,
    name,
    description,
    status,
    startDate,
    endDate,
    memberCount,
    companies = [],
    selected = false
  }: Props = $props();

  const overdue = $derived(
    status === 'active' && typeof endDate === 'number' && endDate < Date.now()
  );

  const dateRangeLabel = $derived.by(() => {
    const fmt = (ts: number) =>
      new Date(ts).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
    if (startDate && endDate) return `${fmt(startDate)} – ${fmt(endDate)}`;
    if (startDate) return `From ${fmt(startDate)}`;
    if (endDate) {
      const d = new Date(endDate);
      const now = new Date();
      const dStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const days = Math.round((dStart - todayStart) / 86_400_000);
      if (days === 0) return 'Ends today';
      if (days < 0) return `${Math.abs(days)}d overdue`;
      if (days === 1) return 'Ends tomorrow';
      if (days < 14) return `Ends in ${days}d`;
      return `Until ${d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}`;
    }
    return null;
  });
</script>

<a
  {href}
  data-project-row
  class="group flex flex-col gap-3 rounded-[var(--radius-lg)] border bg-[var(--color-surface)] p-4 transition-all hover:border-[var(--color-highlight-border)] hover:shadow-sm {selected
    ? 'border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)]'
    : 'border-[var(--color-border)]'} {status === 'archived' ? 'opacity-60' : ''}"
>
  <!-- Icon + status -->
  <div class="flex items-start justify-between gap-2">
    <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-muted)]">
      <Briefcase size={20} strokeWidth={1.75} />
    </span>
    <span class="mt-1">
      <StatusChip {status} size="sm" />
    </span>
  </div>

  <!-- Name + description -->
  <div class="min-w-0 flex-1">
    <p class="truncate font-semibold text-[var(--color-text)]">{name}</p>
    {#if description}
      <p class="mt-0.5 line-clamp-2 text-xs text-[var(--color-muted)]">{description}</p>
    {:else}
      <p class="mt-0.5 text-xs italic text-[var(--color-subtle)]">No description</p>
    {/if}
  </div>

  <!-- Companies -->
  {#if companies.length > 0}
    <div class="flex flex-wrap items-center gap-1.5">
      {#each companies.slice(0, 4) as c (c.id)}
        <span class="inline-flex items-center gap-1 text-xs text-[var(--color-muted)]">
          <CompanyLogo domain={c.domain} fallbackUrl={c.logoUrl} name={c.name} size={16} rounded="sm" />
          <span class="truncate max-w-[80px]">{c.name}</span>
        </span>
      {/each}
      {#if companies.length > 4}
        <span class="text-xs text-[var(--color-subtle)]">+{companies.length - 4}</span>
      {/if}
    </div>
  {/if}

  <!-- Footer: members + date range -->
  <div class="flex flex-wrap items-center gap-3 text-xs text-[var(--color-muted)]">
    {#if memberCount > 0}
      <span class="inline-flex items-center gap-1">
        <Users size={12} strokeWidth={2} />
        {memberCount}
      </span>
    {/if}
    {#if dateRangeLabel}
      <span class="inline-flex items-center gap-1 {overdue ? 'text-[var(--color-danger)]' : ''}">
        {#if overdue}
          <AlertTriangle size={12} strokeWidth={2} />
        {:else}
          <CalendarClock size={12} strokeWidth={2} />
        {/if}
        {dateRangeLabel}
      </span>
    {/if}
    {#if memberCount === 0 && !dateRangeLabel && companies.length === 0}
      <span class="italic text-[var(--color-subtle)]">No details yet</span>
    {/if}
  </div>
</a>
