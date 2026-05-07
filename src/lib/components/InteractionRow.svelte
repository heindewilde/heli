<script lang="ts">
  import { TYPE_META, formatTime, type InteractionType } from '$lib/interactions';

  type Person = { id: string; name: string; avatarUrl: string | null };

  type Props = {
    id: string;
    occurredAt: number;
    type: string;
    title: string;
    body?: string | null;
    companyId?: string | null;
    companyName?: string | null;
    people: Person[];
    showCompany?: boolean;
    selected?: boolean;
  };

  let { id, occurredAt, type, title, body, companyId, companyName, people, showCompany = true, selected = false }: Props = $props();

  const meta = $derived(TYPE_META[type as InteractionType] ?? TYPE_META.other);
  const Icon = $derived(meta.icon);
  const excerpt = $derived(body ? body.replace(/<[^>]+>/g, '').slice(0, 160) : '');
</script>

<a
  href={`/interactions/${id}`}
  data-interaction-row
  class="flex items-start gap-3 rounded-[var(--radius-md)] border px-3 py-2 transition-colors {selected
    ? 'border-[var(--color-product-border)] bg-[var(--color-product-bg)]'
    : 'border-transparent hover:bg-[var(--color-surface)]'}"
>
  <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]">
    <Icon size={14} strokeWidth={2} class={meta.tone} />
  </span>
  <span class="min-w-0 flex-1">
    <span class="flex items-center gap-2">
      <span class="text-xs text-[var(--color-muted)]">{formatTime(occurredAt)}</span>
      <span class="text-xs uppercase tracking-wide text-[var(--color-subtle)]">{meta.label}</span>
    </span>
    <span class="block truncate text-sm font-medium">{title}</span>
    {#if excerpt}
      <span class="block truncate text-xs text-[var(--color-muted)]">{excerpt}</span>
    {/if}
    {#if (people.length > 0) || (showCompany && companyName)}
      <span class="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-muted)]">
        {#each people as p (p.id)}
          <span class="inline-flex items-center gap-1 rounded-full bg-[var(--color-bg)] px-1.5 py-0.5">
            <span class="flex h-4 w-4 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[8px]">
              {#if p.avatarUrl}
                <img src={p.avatarUrl} alt="" class="h-full w-full object-cover" />
              {:else}
                {(p.name[0] ?? '·').toUpperCase()}
              {/if}
            </span>
            {p.name}
          </span>
        {/each}
        {#if showCompany && companyName && companyId}
          <span class="inline-flex items-center gap-1 rounded-full bg-[var(--color-bg)] px-1.5 py-0.5">
            · {companyName}
          </span>
        {/if}
      </span>
    {/if}
  </span>
</a>
