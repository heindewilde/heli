<script lang="ts">
  import { X, GripVertical, Send } from 'lucide-svelte';
  import CompanyLogo from './CompanyLogo.svelte';
  import type { PipelineItemRow } from '$lib/server/pipelines';

  type Props = {
    item: PipelineItemRow;
    draggable?: boolean;
    selected?: boolean;
    onRemove?: () => void;
    onDragStart?: (e: DragEvent) => void;
    onDragEnd?: (e: DragEvent) => void;
    onClick?: () => void;
    /**
     * Templates this card's stage offers. Rendered as direct actions — the
     * whole point of attaching them to a stage.
     */
    templates?: { id: string; name: string }[];
  };

  let {
    item,
    draggable = false,
    selected = false,
    onRemove,
    onDragStart,
    onDragEnd,
    onClick,
    templates = []
  }: Props = $props();

  /**
   * Templates address a person, so a company card has nothing to offer.
   * The link opens the person's page with the composer already on that
   * template: the dialog needs an email, a LinkedIn URL and a company name,
   * none of which the board query carries — and the person's page is where you
   * want to be before writing to them anyway.
   */
  const cardTemplates = $derived(item.kind === 'person' ? templates.slice(0, 3) : []);

  const href = $derived(
    item.kind === 'person' ? `/people/${item.refId}` : `/companies/${item.refId}`
  );

  const initials = $derived.by(() => {
    const name = item.member?.name ?? '';
    return name
      .split(/\s+/)
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();
  });

  const valueLabel = $derived.by(() => {
    if (item.valueCents == null) return null;
    const v = item.valueCents / 100;
    if (item.currency) {
      try {
        return new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: item.currency,
          maximumFractionDigits: 0
        }).format(v);
      } catch {
        // fall through
      }
    }
    return v.toFixed(0);
  });

</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  role="article"
  class="group relative flex flex-col gap-1.5 rounded-[var(--radius-md)] border bg-[var(--color-bg)] p-2.5 text-sm shadow-[var(--shadow-sm)] {selected
    ? 'border-[var(--color-highlight-border)] ring-1 ring-[var(--color-highlight-border)]'
    : 'border-[var(--color-border)] hover:border-[var(--color-highlight-border)]'}"
  draggable={draggable}
  ondragstart={onDragStart}
  ondragend={onDragEnd}
  data-pipeline-item={item.id}
>
  <div class="flex items-start gap-2">
    {#if draggable}
      <span class="mt-0.5 cursor-grab text-[var(--color-subtle)] active:cursor-grabbing"><GripVertical size={12} strokeWidth={2} /></span>
    {/if}
    {#if item.kind === 'person'}
      <span class="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[10px] text-[var(--color-muted)]">
        {#if item.member?.avatarUrl}
          <img src={item.member.avatarUrl} alt="" class="h-full w-full object-cover" />
        {:else}
          {initials || '·'}
        {/if}
      </span>
    {:else}
      <CompanyLogo
        domain={item.member?.domain}
        fallbackUrl={item.member?.logoUrl ?? item.member?.faviconUrl}
        name={item.member?.name}
        size={28}
      />
    {/if}
    <div class="min-w-0 flex-1">
      <div class="flex items-center justify-between gap-2">
        <a
          {href}
          onclick={(e) => { if (onClick) { e.stopPropagation(); onClick(); } }}
          class="truncate font-medium text-[var(--color-text)] hover:underline"
        >{item.member?.name ?? '(missing)'}</a>
      </div>
      {#if item.kind === 'person' && item.member?.role}
        <div class="truncate text-xs text-[var(--color-muted)]">{item.member.role}</div>
      {:else if item.kind === 'company' && item.member?.domain}
        <div class="truncate text-xs text-[var(--color-muted)]">{item.member.domain}</div>
      {/if}
    </div>
    {#if onRemove}
      <button
        type="button"
        title="Remove from pipeline"
        onclick={onRemove}
        class="-mr-1 -mt-1 rounded-[var(--radius-sm)] p-1 text-[var(--color-subtle)] opacity-0 hover:bg-[var(--color-bg)] hover:text-[var(--color-danger)] group-hover:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <X size={12} strokeWidth={2} />
      </button>
    {/if}
  </div>
  {#if item.note}
    <p class="line-clamp-2 text-xs text-[var(--color-muted)]">{item.note}</p>
  {/if}
  {#if valueLabel}
    <span class="tabular self-start rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-xs font-medium text-[var(--color-text)]">{valueLabel}</span>
  {/if}
  {#if cardTemplates.length > 0}
    <div class="flex flex-wrap gap-1">
      {#each cardTemplates as t (t.id)}
        <a
          href={`/people/${item.refId}?outreach=${t.id}`}
          title={`Write "${t.name}" to ${item.member?.name ?? 'this person'}`}
          class="inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[11px] text-[var(--color-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
        >
          <Send size={10} strokeWidth={2} class="shrink-0" />
          <span class="truncate">{t.name}</span>
        </a>
      {/each}
    </div>
  {/if}
</div>
