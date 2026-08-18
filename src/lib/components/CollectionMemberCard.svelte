<script lang="ts">
  /**
   * One member of a collection, as a card.
   *
   * Modelled on `PipelineItemCard`, the app's other card that has to render a
   * person and a company as peers, but rooted as an `<a>` like `CollectionCard`
   * and `ProjectCard` so the whole surface is one click target.
   *
   * Every card in a grid must be the same height, or it reads as two different
   * components rather than one collection. That is done by reserving boxes
   * rather than by pinning a height: the subtitle line keeps its box when a
   * member has no role or domain, the tag row keeps its box when *any* member
   * in the collection is tagged (see `reserveTags`), and the tags are capped so
   * one heavily-tagged person cannot stretch the row. A hard `h-[…]` would also
   * work, and would leave dead space under every card in the common case.
   *
   * Tag chips are inert `Badge` spans rather than the `<a href="?tag=…">` the
   * list pages use, because a link inside the card's own anchor is invalid HTML
   * and would steal the click. Seeing the tags here is the requirement;
   * filtering by one is a click away on /people and /companies.
   */
  import { X } from 'lucide-svelte';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Badge from '$lib/ui/Badge.svelte';
  import CompanyLogo from './CompanyLogo.svelte';
  import type { CollectionMemberDetail } from '$lib/server/collections';

  type Props = {
    member: CollectionMemberDetail;
    /**
     * Keep the tag row's box even on an untagged member. Set by the page when
     * *something* in the collection is tagged: uniform cards is the
     * requirement, and a blank strip under every card in a collection nobody
     * has tagged is dead space bought for nothing.
     */
    reserveTags?: boolean;
    onRemove?: () => void;
  };

  let { member, reserveTags = false, onRemove }: Props = $props();

  const MAX_TAGS = 3;

  const href = $derived(
    member.kind === 'person' ? `/people/${member.id}` : `/companies/${member.id}`
  );

  const subtitle = $derived(
    member.kind === 'person'
      ? [member.role, member.companyName].filter(Boolean).join(' · ')
      : (member.domain ?? '')
  );

  const tags = $derived(member.tags ?? []);
  const showTagRow = $derived(reserveTags || tags.length > 0);
</script>

<a
  {href}
  class="group relative flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 transition-all hover:border-[var(--color-highlight-border)] hover:shadow-sm"
>
  <div class="flex items-start gap-2.5">
    {#if member.kind === 'person'}
      <Avatar name={member.name} src={member.avatarUrl} size="md" />
    {:else}
      <CompanyLogo
        domain={member.domain}
        fallbackUrl={member.logoUrl ?? member.faviconUrl}
        name={member.name}
        size={36}
      />
    {/if}
    <div class="min-w-0 flex-1">
      <div class="truncate pr-5 text-sm font-medium text-[var(--color-text)]">{member.name}</div>
      <div class="h-4 truncate text-xs text-[var(--color-muted)]">{subtitle}</div>
    </div>
  </div>

  {#if showTagRow}
    <div class="flex h-5 min-w-0 items-center gap-1 overflow-hidden">
      {#each tags.slice(0, MAX_TAGS) as t (t.id)}
        <Badge tone="neutral" size="sm" class="max-w-[10rem] truncate">{t.name}</Badge>
      {/each}
      {#if tags.length > MAX_TAGS}
        <Badge tone="neutral" size="sm" class="shrink-0">+{tags.length - MAX_TAGS}</Badge>
      {/if}
    </div>
  {/if}

  {#if onRemove}
    <button
      type="button"
      aria-label="Remove {member.name}"
      onclick={(e) => {
        e.preventDefault();
        onRemove?.();
      }}
      class="absolute top-1.5 right-1.5 rounded-[var(--radius-sm)] p-1 text-[var(--color-subtle)] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[var(--color-bg)] hover:text-[var(--color-danger)] focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
    >
      <X size={12} strokeWidth={2} />
    </button>
  {/if}
</a>
