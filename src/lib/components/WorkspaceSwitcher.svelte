<script lang="ts">
  import { ChevronsUpDown, Check } from 'lucide-svelte';
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

{#if memberships.length > 1}
  <div class="relative">
    <button
      class="flex max-w-[12rem] items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-sm hover:bg-[var(--color-row-hover)]"
      onclick={() => (open = !open)}
      aria-haspopup="listbox"
      aria-expanded={open}
    >
      <span class="truncate">{active?.workspaceName}</span>
      <ChevronsUpDown size={13} strokeWidth={2} class="shrink-0 text-[var(--color-muted)]" />
    </button>

    {#if open}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="fixed inset-0 z-40" onclick={() => (open = false)}></div>
      <ul
        class="absolute left-0 z-50 mt-1 min-w-[14rem] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-lg)]"
        role="listbox"
      >
        {#each memberships as m (m.workspaceId)}
          <li role="option" aria-selected={m.workspaceId === activeId}>
            <button
              class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--color-row-hover)]"
              onclick={() => switchTo(m.workspaceId)}
              disabled={switching}
            >
              <span class="truncate">{m.workspaceName}</span>
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
{/if}
