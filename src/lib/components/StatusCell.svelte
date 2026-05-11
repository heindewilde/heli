<script lang="ts">
  import { onMount } from 'svelte';
  import { Check, Plus, X } from 'lucide-svelte';
  import { STATUS_TONE_LIST, TONE_STYLES, type StatusRow, type StatusTone } from '$lib/statuses';
  import { toast } from '$lib/toasts.svelte';
  import StatusPill from './StatusPill.svelte';

  type Props = {
    /** Currently-selected status id (or null if unset). */
    value: string | null;
    /** Full list of statuses available for this entity scope. */
    statuses: StatusRow[];
    /** 'person' or 'company' — drives the inline-create endpoint scope. */
    scope: 'person' | 'company';
    /** Called after the status is persisted (id or null on clear). */
    onChange: (next: StatusRow | null) => void;
    /** Called when a new status is created so the parent can refresh the list. */
    onStatusesChange?: (next: StatusRow[]) => void;
  };
  let { value, statuses, scope, onChange, onStatusesChange }: Props = $props();

  let open = $state(false);
  let triggerEl = $state<HTMLButtonElement | undefined>(undefined);
  let inputEl = $state<HTMLInputElement | undefined>(undefined);
  let query = $state('');
  let creating = $state(false);
  let creatingTone = $state<StatusTone>('gray');

  const current = $derived<StatusRow | null>(
    value == null ? null : statuses.find((s) => s.id === value) ?? null
  );

  const filtered = $derived(
    query.trim()
      ? statuses.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()))
      : statuses
  );

  // Show the "+ Create 'foo'" affordance only when the user has typed
  // something that doesn't match an existing status exactly. Trim and
  // compare case-insensitively so "Lead" and "lead" are treated as the same.
  const canCreate = $derived.by(() => {
    const q = query.trim();
    if (!q) return false;
    return !statuses.some((s) => s.name.toLowerCase() === q.toLowerCase());
  });

  function openMenu() {
    open = true;
    query = '';
    creating = false;
    setTimeout(() => inputEl?.focus(), 0);
  }

  function closeMenu() {
    open = false;
    creating = false;
    query = '';
    triggerEl?.focus();
  }

  async function pick(s: StatusRow) {
    open = false;
    onChange(s);
  }

  async function clear() {
    open = false;
    onChange(null);
  }

  async function createAndPick() {
    const name = query.trim();
    if (!name) return;
    try {
      const res = await fetch(`/api/statuses?scope=${scope}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, tone: creatingTone })
      });
      if (!res.ok) {
        toast.danger('Could not create status');
        return;
      }
      const row = (await res.json()) as StatusRow;
      // Append optimistically and notify parent so other rows see the new
      // option without a page reload.
      const next = [...statuses, row];
      onStatusesChange?.(next);
      pick(row);
    } catch {
      toast.danger('Could not create status');
    }
  }

  function onInputKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (creating) {
        creating = false;
        return;
      }
      closeMenu();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (creating) {
        createAndPick();
        return;
      }
      if (filtered.length > 0) {
        pick(filtered[0]);
        return;
      }
      if (canCreate) {
        creating = true;
        return;
      }
    }
  }

  // Close on outside click — the inert button scrim below handles this.
  // We also close on Escape from the trigger when the menu isn't open.
  onMount(() => {
    const onDocKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        closeMenu();
      }
    };
    window.addEventListener('keydown', onDocKey);
    return () => window.removeEventListener('keydown', onDocKey);
  });
</script>

<div class="relative inline-flex min-w-0 max-w-full">
  <button
    bind:this={triggerEl}
    type="button"
    aria-label={current ? `Status: ${current.name}` : 'Set status'}
    aria-haspopup="dialog"
    aria-expanded={open}
    onclick={(e) => {
      e.stopPropagation();
      if (open) closeMenu();
      else openMenu();
    }}
    class="group inline-flex min-h-[24px] min-w-[24px] max-w-full items-center rounded-[var(--radius-sm)] px-1 py-0.5 transition-colors hover:bg-[var(--color-surface-2)]"
  >
    {#if current}
      <StatusPill status={current} />
    {:else}
      <!-- Empty by design. A faint "—" appears on hover so the cell is
           discoverable without shouting at the user. -->
      <span class="invisible text-xs text-[var(--color-subtle)] group-hover:visible">— set status</span>
    {/if}
  </button>

  {#if open}
    <button
      type="button"
      class="fixed inset-0 z-40 cursor-default"
      aria-label="Close status menu"
      onclick={closeMenu}
    ></button>
    <div
      role="dialog"
      aria-label="Status"
      class="absolute left-0 top-7 z-50 w-[220px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)]"
    >
      {#if !creating}
        <div class="border-b border-[var(--color-border)] px-2 py-1.5">
          <input
            bind:this={inputEl}
            bind:value={query}
            type="text"
            placeholder="Find or create a status…"
            onkeydown={onInputKey}
            class="w-full bg-transparent text-xs outline-none placeholder:text-[var(--color-subtle)]"
          />
        </div>
        <ul class="max-h-[40vh] overflow-auto py-1">
          {#each filtered as s (s.id)}
            {@const styles = TONE_STYLES[s.tone]}
            {@const selected = s.id === value}
            <li>
              <button
                type="button"
                onclick={(e) => {
                  e.stopPropagation();
                  pick(s);
                }}
                class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-[var(--color-surface-2)]"
              >
                <span class="h-1.5 w-1.5 shrink-0 rounded-full" style="background: {styles.dot}"></span>
                <span class="flex-1 truncate {selected ? 'font-medium' : ''}">{s.name}</span>
                {#if selected}<Check size={11} strokeWidth={2.5} class="text-[var(--color-muted)]" />{/if}
              </button>
            </li>
          {/each}
          {#if filtered.length === 0 && !canCreate}
            <li class="px-2.5 py-2 text-center text-[11px] text-[var(--color-subtle)]">No statuses yet.</li>
          {/if}
          {#if canCreate}
            <li>
              <button
                type="button"
                onclick={(e) => {
                  e.stopPropagation();
                  creating = true;
                }}
                class="flex w-full items-center gap-2 border-t border-[var(--color-border)] px-2.5 py-1.5 text-left text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-2)]"
              >
                <Plus size={11} strokeWidth={2.5} />
                <span class="truncate">Create &ldquo;{query.trim()}&rdquo;</span>
              </button>
            </li>
          {/if}
        </ul>
        {#if value != null}
          <button
            type="button"
            onclick={(e) => {
              e.stopPropagation();
              clear();
            }}
            class="flex w-full items-center gap-2 border-t border-[var(--color-border)] px-2.5 py-1.5 text-left text-[11px] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
          >
            <X size={11} strokeWidth={2} />
            Clear status
          </button>
        {/if}
      {:else}
        <!-- Tone picker for the new status. Keyboard: Enter creates, Esc backs out. -->
        <div class="flex flex-col gap-2 p-2.5">
          <div class="text-[11px] text-[var(--color-muted)]">New status</div>
          <div class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs">
            {query.trim()}
          </div>
          <div class="flex items-center gap-1">
            {#each STATUS_TONE_LIST as tone (tone)}
              {@const styles = TONE_STYLES[tone]}
              {@const sel = tone === creatingTone}
              <button
                type="button"
                aria-label={`Tone: ${tone}`}
                aria-pressed={sel}
                onclick={() => (creatingTone = tone)}
                class="h-5 w-5 rounded-full border transition-transform {sel ? 'scale-110 ring-1 ring-offset-1 ring-offset-[var(--color-surface)]' : ''}"
                style={sel
                  ? `background: ${styles.dot}; border-color: ${styles.dot}; --tw-ring-color: ${styles.dot}`
                  : `background: ${styles.bg}; border-color: ${styles.border}`}
              >
                <span class="sr-only">{tone}</span>
              </button>
            {/each}
          </div>
          <div class="flex items-center justify-end gap-1 pt-1">
            <button
              type="button"
              onclick={() => (creating = false)}
              class="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
            >Back</button>
            <button
              type="button"
              onclick={createAndPick}
              class="rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-2 py-1 text-[11px] font-medium text-[var(--color-accent-fg)] shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--color-accent-hover)]"
            >Create</button>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>
