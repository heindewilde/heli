<script lang="ts">
  import { Building2, X, GripVertical } from 'lucide-svelte';
  import type { PipelineItemRow } from '$lib/server/pipelines';

  type Props = {
    item: PipelineItemRow;
    draggable?: boolean;
    selected?: boolean;
    onRemove?: () => void;
    onDragStart?: (e: DragEvent) => void;
    onDragEnd?: (e: DragEvent) => void;
    onClick?: () => void;
  };

  let {
    item,
    draggable = false,
    selected = false,
    onRemove,
    onDragStart,
    onDragEnd,
    onClick
  }: Props = $props();

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

  const daysInStage = $derived(
    Math.max(0, Math.floor((Date.now() - item.enteredStageAt) / 86_400_000))
  );

  const ageLabel = $derived.by(() => {
    if (daysInStage === 0) return 'today';
    if (daysInStage === 1) return '1d';
    return `${daysInStage}d`;
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
    <span class="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden {item.kind === 'person' ? 'rounded-full' : 'rounded-[var(--radius-sm)]'} border border-[var(--color-border)] bg-[var(--color-surface)] text-[10px] text-[var(--color-muted)]">
      {#if item.kind === 'person'}
        {#if item.member?.avatarUrl}
          <img src={item.member.avatarUrl} alt="" class="h-full w-full object-cover" />
        {:else}
          {initials || '·'}
        {/if}
      {:else if item.member?.logoUrl || item.member?.faviconUrl}
        <img src={item.member.logoUrl ?? item.member.faviconUrl ?? ''} alt="" class="h-full w-full object-cover" />
      {:else}
        <Building2 size={12} strokeWidth={2} />
      {/if}
    </span>
    <div class="min-w-0 flex-1">
      <div class="flex items-center justify-between gap-2">
        <a
          {href}
          onclick={(e) => { if (onClick) { e.stopPropagation(); onClick(); } }}
          class="truncate font-medium text-[var(--color-text)] hover:underline"
        >{item.member?.name ?? '(missing)'}</a>
        <span class="shrink-0 text-[10px] text-[var(--color-subtle)]" title={`In stage for ${daysInStage} days`}>{ageLabel}</span>
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
        class="-mr-1 -mt-1 rounded-[var(--radius-sm)] p-1 text-[var(--color-subtle)] opacity-0 hover:bg-[var(--color-bg)] hover:text-[var(--color-danger)] group-hover:opacity-100"
      >
        <X size={12} strokeWidth={2} />
      </button>
    {/if}
  </div>
  {#if item.note}
    <p class="line-clamp-2 text-xs text-[var(--color-muted)]">{item.note}</p>
  {/if}
  {#if valueLabel}
    <span class="tabular self-start rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text)]">{valueLabel}</span>
  {/if}
</div>
