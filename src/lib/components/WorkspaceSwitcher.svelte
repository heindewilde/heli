<script lang="ts">
  import { Building2, ChevronsUpDown, Check } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';

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
    <div class="relative">
      <button
        class="flex w-full items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-left text-sm transition-colors hover:bg-[var(--color-row-hover)]"
        onclick={() => (open = !open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Switch workspace"
      >
        <Building2 size={14} strokeWidth={2} class="shrink-0 text-[var(--color-subtle)]" />
        <span class="min-w-0 flex-1 truncate">{active?.workspaceName}</span>
        <ChevronsUpDown size={13} strokeWidth={2} class="shrink-0 text-[var(--color-muted)]" />
      </button>

      {#if open}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="fixed inset-0 z-40" onclick={() => (open = false)}></div>
        <ul
          class="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-lg)]"
          role="listbox"
        >
          {#each memberships as m (m.workspaceId)}
            <li role="option" aria-selected={m.workspaceId === activeId}>
              <button
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
      {/if}
    </div>
  </div>
{/if}
