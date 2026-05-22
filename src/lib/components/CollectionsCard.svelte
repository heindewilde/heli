<script lang="ts">
  import CollectionsRibbon from './CollectionsRibbon.svelte';
  import type { CollectionMembershipForEntity } from '$lib/server/collections';
  import type { MemberKind } from '$lib/server/schema';

  type Props = {
    kind: MemberKind;
    refId: string;
    collections: CollectionMembershipForEntity[];
  };

  let { kind, refId, collections }: Props = $props();
</script>

<div class="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
  <h3 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">Collections</h3>
  <CollectionsRibbon {kind} {refId} {collections} />
</div>
