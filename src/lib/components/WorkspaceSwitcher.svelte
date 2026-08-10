<script lang="ts">
  import { Building2, ChevronsUpDown, Check } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';
  import Popover from '$lib/ui/Popover.svelte';
  import { clearRecents } from '$lib/commands/registry.svelte';

  type Membership = { workspaceId: string; workspaceName: string; role: string };

  let {
    memberships,
    activeId
  }: { memberships: Membership[]; activeId: string } = $props();

  let open = $state(false);
  let switching = $state(false);

  const active = $derived(
    memberships.find((m) => m.workspaceId === activeId) ?? memberships[0]
  );

  async function switchTo(workspaceId: string) {
    if (workspaceId === activeId || switching) return;
    switching = true;
    try {
      const res = await fetch('/api/workspace/switch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceId })
      });
      if (!res.ok) throw new Error();

      // The service worker holds stale-while-revalidate copies of /api/* from
      // the workspace we're leaving. Drop them before navigating, or the first
      // paint of the new workspace shows the old one's rows.
      navigator.serviceWorker?.controller?.postMessage('PURGE_API');

      // Palette recents are hrefs into the workspace we are leaving; they would
      // 404 (or worse, look like this workspace's records) after the switch.
      clearRecents();

      // Hard navigation rather than goto(): every cached load function, list
      // cache and $state island in the page belongs to the previous workspace.
      location.assign('/');
    } catch {
      toast.danger('Could not switch workspace.');
      switching = false;
    }
  }
</script>

<!--
  Sits at the top of the sidebar, above the nav links. Deliberately styled as a
  control — bordered, on surface — rather than as a nav item: it switches the
  tenant every link below it points into, so it should not read as one more
  destination in the list.

  The divider lives in here rather than in the layout because the whole thing
  renders nothing for single-workspace users, and a rule with nothing above it
  is worse than no rule.
-->
{#if memberships.length > 1}
  <div class="mb-3 border-b border-[var(--color-border)] pb-3">
    <Popover bind:open label="Switch workspace" panelRole="listbox" matchWidth class="w-full">
      {#snippet trigger(attrs)}
        <button
          {...attrs}
          type="button"
          aria-label="Switch workspace"
          class="flex w-full items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-left text-sm transition-colors hover:bg-[var(--color-row-hover)]"
        >
          <Building2 size={14} strokeWidth={2} class="shrink-0 text-[var(--color-subtle)]" />
          <span class="min-w-0 flex-1 truncate">{active?.workspaceName}</span>
          <ChevronsUpDown size={13} strokeWidth={2} class="shrink-0 text-[var(--color-muted)]" />
        </button>
      {/snippet}

      {#snippet content()}
        <ul class="py-1">
          {#each memberships as m (m.workspaceId)}
            <li role="option" aria-selected={m.workspaceId === activeId}>
              <button
                type="button"
                class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--color-row-hover)]"
                onclick={() => switchTo(m.workspaceId)}
                disabled={switching}
              >
                <span class="min-w-0 truncate">{m.workspaceName}</span>
                {#if m.workspaceId === activeId}
                  <Check size={13} strokeWidth={2} class="shrink-0" />
                {:else}
                  <span class="cap-label shrink-0 text-[var(--color-muted)]">{m.role}</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {/snippet}
    </Popover>
  </div>
{/if}
