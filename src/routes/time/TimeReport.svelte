<script lang="ts">
  /**
   * The invoicing view: totals, grouped how you need them, exportable.
   *
   * Heli generates no invoices and won't. What it owes you is a set of numbers
   * you can defend and hand to whatever does — so rounding is stated rather
   * than hidden, the raw total stays on screen next to the rounded one, and
   * both exports carry the same figures the page shows.
   *
   * **PDF is the browser's.** A print stylesheet plus `window.print()` costs no
   * dependency, and `dependencies` has deliberately had two entries for the
   * app's whole life. The trade is a print dialog instead of a direct download.
   */
  import {
    Download,
    Printer,
    Clock,
    CircleDollarSign,
    Receipt,
    ArrowUpNarrowWide
  } from 'lucide-svelte';
  import Select from '$lib/ui/Select.svelte';
  import StatTile from '$lib/ui/StatTile.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { Timer } from 'lucide-svelte';
  import { formatMinutes } from '$lib/duration';
  import { projectSwatch } from '$lib/projectColor';
  import type { TimeSummary } from '$lib/server/time';

  type Props = {
    summary: TimeSummary | null;
    filters: { from: number; to: number; userId: string; projectId: string; billable: string };
    /** Same filters, pointed at the CSV endpoint. */
    csvHref: string;
    onGroupBy: (v: string) => void;
    onRoundTo: (v: string) => void;
  };

  let { summary, filters, csvHref, onGroupBy, onRoundTo }: Props = $props();

  const GROUPS = [
    { value: 'project', label: 'By project' },
    { value: 'client', label: 'By client' },
    { value: 'person', label: 'By person' },
    { value: 'day', label: 'By day' },
    { value: 'week', label: 'By week' }
  ];

  const ROUNDING = [
    { value: '0', label: 'Exact minutes' },
    { value: '6', label: 'Round to 6 min' },
    { value: '15', label: 'Round to 15 min' },
    { value: '30', label: 'Round to 30 min' },
    { value: '60', label: 'Round to 1 hour' }
  ];

  const money = (cents: number, currency: string) => {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
    } catch {
      return `${(cents / 100).toFixed(2)} ${currency}`;
    }
  };

  const maxMinutes = $derived(Math.max(1, ...(summary?.groups ?? []).map((g) => g.minutes)));

  const dateLabel = (ts: number) =>
    new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  const rangeLabel = $derived(`${dateLabel(filters.from)} – ${dateLabel(filters.to)}`);

  /** Rounding only matters when it actually moved the number. */
  const roundingDelta = $derived(
    summary && summary.roundTo > 0 ? summary.totalMinutes - summary.rawMinutes : 0
  );
</script>

{#if !summary || summary.groups.length === 0}
  <EmptyState
    icon={Timer}
    title="Nothing tracked in this range"
    description="Widen the dates, or start the timer above."
  />
{:else}
  <div class="flex flex-col gap-4">
    <!-- Controls. Hidden in print: the paper should carry the result, not the
         machinery that produced it. -->
    <div class="no-print flex flex-wrap items-center gap-2">
      <Select
        size="md"
        label="Group by"
        value={summary.groupBy}
        options={GROUPS}
        onchange={onGroupBy}
      />
      <Select
        size="md"
        label="Rounding"
        value={String(summary.roundTo)}
        options={ROUNDING}
        onchange={onRoundTo}
      />
      <div class="ml-auto flex items-center gap-2">
        <a
          data-sveltekit-reload
          href={csvHref}
          class="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm hover:border-[var(--color-border-strong)]"
        >
          <Download size={14} strokeWidth={2} /> CSV
        </a>
        <button
          type="button"
          onclick={() => window.print()}
          class="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm hover:border-[var(--color-border-strong)]"
        >
          <Printer size={14} strokeWidth={2} /> PDF
        </button>
      </div>
    </div>

    <!-- Print-only heading, so a saved PDF says what it is. -->
    <div class="print-only mb-4">
      <h1 class="text-lg font-semibold">Time report</h1>
      <p class="text-sm">{rangeLabel}</p>
    </div>

    <div class="flex flex-wrap gap-2">
      <StatTile
        icon={Clock}
        label="Tracked"
        value={formatMinutes(summary.totalMinutes)}
        sub={rangeLabel}
      />
      <StatTile
        icon={CircleDollarSign}
        tone="good"
        label="Billable"
        value={formatMinutes(summary.billableMinutes)}
        sub={summary.totalMinutes > 0
          ? `${Math.round((summary.billableMinutes / summary.totalMinutes) * 100)}% of tracked`
          : undefined}
      />
      {#each Object.entries(summary.amountByCurrency) as [cur, cents] (cur)}
        <StatTile icon={Receipt} tone="info" label="Amount" value={money(cents, cur)} sub={cur} />
      {/each}
      {#if roundingDelta !== 0}
        <StatTile
          icon={ArrowUpNarrowWide}
          tone="warn"
          label="Rounding"
          value="+{formatMinutes(roundingDelta)}"
          sub="{formatMinutes(summary.rawMinutes)} exact"
        />
      {/if}
    </div>

    <!-- The table is a card, like the day groups on the entries view, so both
         halves of this page are built from the same object. -->
    <div class="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-[var(--color-border)] bg-[var(--color-bg)] text-left">
            <th class="px-3 py-2 text-[0.6875rem] font-medium uppercase tracking-wide text-[var(--color-subtle)]">
              {GROUPS.find((g) => g.value === summary.groupBy)?.label.replace('By ', '') ?? ''}
            </th>
            <th class="no-print w-1/4 px-3 py-2"></th>
            <th class="px-3 py-2 text-right text-[0.6875rem] font-medium uppercase tracking-wide text-[var(--color-subtle)]">Entries</th>
            <th class="px-3 py-2 text-right text-[0.6875rem] font-medium uppercase tracking-wide text-[var(--color-subtle)]">Billable</th>
            <th class="px-3 py-2 text-right text-[0.6875rem] font-medium uppercase tracking-wide text-[var(--color-subtle)]">Tracked</th>
            <th class="px-3 py-2 text-right text-[0.6875rem] font-medium uppercase tracking-wide text-[var(--color-subtle)]">Amount</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--color-border)]">
          {#each summary.groups as g (g.key)}
            <tr class="hover:bg-[var(--color-surface-2)]">
              <td class="px-3 py-2">
                <span class="flex items-center gap-2">
                  {#if summary.groupBy === 'project' || summary.groupBy === 'client'}
                    <span
                      class="h-5 w-1 shrink-0 rounded-full"
                      style="background: {g.key
                        ? projectSwatch(g.key)
                        : 'var(--color-border-strong)'}"
                    ></span>
                  {/if}
                  {#if g.href}
                    <a href={g.href} class="truncate hover:underline">{g.label}</a>
                  {:else}
                    <span class="truncate {g.key === '' ? 'italic text-[var(--color-muted)]' : ''}">
                      {g.label}
                    </span>
                  {/if}
                </span>
              </td>
              <td class="no-print px-3 py-2">
                <span class="track"
                  ><span
                    class="fill"
                    style="--p: {(g.minutes / maxMinutes) * 100}%; background: {g.key
                      ? projectSwatch(g.key)
                      : 'var(--color-border-strong)'}"
                  ></span></span
                >
              </td>
              <td class="px-3 py-2 text-right tabular-nums text-[var(--color-muted)]">{g.entries}</td>
              <td class="px-3 py-2 text-right tabular-nums">
                {#if g.billableMinutes === 0}
                  <span class="text-[var(--color-subtle)]">—</span>
                {:else}
                  <span class="text-[var(--color-success)]">{formatMinutes(g.billableMinutes)}</span>
                {/if}
              </td>
              <td class="px-3 py-2 text-right font-medium tabular-nums">{formatMinutes(g.minutes)}</td>
              <td class="px-3 py-2 text-right tabular-nums">
                {g.amount > 0 ? money(g.amount, g.currency ?? '') : '—'}
              </td>
            </tr>
          {/each}
        </tbody>
        <tfoot>
          <tr class="border-t border-[var(--color-border-strong)] bg-[var(--color-bg)] font-medium">
            <td class="px-3 py-2">Total</td>
            <td class="no-print"></td>
            <td class="px-3 py-2 text-right tabular-nums">
              {summary.groups.reduce((n, g) => n + g.entries, 0)}
            </td>
            <td class="px-3 py-2 text-right tabular-nums text-[var(--color-success)]">
              {formatMinutes(summary.billableMinutes)}
            </td>
            <td class="px-3 py-2 text-right tabular-nums">{formatMinutes(summary.totalMinutes)}</td>
            <td class="px-3 py-2 text-right tabular-nums">
              {Object.entries(summary.amountByCurrency)
                .map(([c, v]) => money(v, c))
                .join(' · ') || '—'}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>

    {#if summary.roundTo > 0}
      <p class="text-xs text-[var(--color-muted)]">
        Each entry is rounded up to the next {summary.roundTo} minutes before totalling — three
        short calls are three billable units, not one rounded sum. Exact tracked time is
        {formatMinutes(summary.rawMinutes)}.
      </p>
    {/if}
  </div>
{/if}

<style>
  .track {
    display: block;
    height: 6px;
    border-radius: 999px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    width: var(--p);
    /* Colour is set inline, from the row's own project hue. */
  }
  .print-only {
    display: none;
  }
</style>
