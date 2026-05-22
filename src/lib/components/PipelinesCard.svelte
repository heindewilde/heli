<script lang="ts">
  import PipelinesRibbon from './PipelinesRibbon.svelte';
  import type { PipelineMembershipForEntity } from '$lib/server/pipelines';
  import type { MemberKind } from '$lib/server/schema';

  type Props = {
    kind: MemberKind;
    refId: string;
    pipelines: PipelineMembershipForEntity[];
  };

  let { kind, refId, pipelines }: Props = $props();
</script>

<div class="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
  <h3 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">Pipelines</h3>
  <PipelinesRibbon {kind} {refId} {pipelines} />
</div>
