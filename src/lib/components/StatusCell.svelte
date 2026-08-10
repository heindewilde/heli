<script lang="ts">
  import { Check, X } from 'lucide-svelte';
  import { STATUS_TONE_LIST, TONE_STYLES, type StatusRow, type StatusTone } from '$lib/statuses';
  import type { Kind } from '$lib/server/classify';
  import { toast } from '$lib/toasts.svelte';
  import Popover from '$lib/ui/Popover.svelte';
  import Combobox from '$lib/ui/Combobox.svelte';
  import Button from '$lib/ui/Button.svelte';
  import StatusPill from './StatusPill.svelte';

  type Props = {
    /** Currently-selected status id (or null if unset). */
    value: string | null;
    /** Full list of statuses available for this entity scope. */
    statuses: StatusRow[];
    scope: Kind;
    /** Called after the status is persisted (id or null on clear). */
    onChange: (next: StatusRow | null) => void;
    /** Called when a new status is created so the parent can refresh the list. */
    onStatusesChange?: (next: StatusRow[]) => void;
  };
  let { value, statuses, scope, onChange, onStatusesChange }: Props = $props();

  let open = $state(false);
  // The "name it, then pick a tone" sub-view. This is precisely why the
  // Popover uses popover="manual": native auto light-dismiss would tear the
  // whole panel down on the first press inside this second step.
  let creating = $state<string | null>(null);
  let creatingTone = $state<StatusTone>('gray');

  const current = $derived<StatusRow | null>(
    value == null ? null : (statuses.find((s) => s.id === value) ?? null)
  );

  function reset() {
    creating = null;
    creatingTone = 'gray';
  }

  function search(q: string): StatusRow[] {
    const needle = q.trim().toLowerCase();
    return needle ? statuses.filter((s) => s.name.toLowerCase().includes(needle)) : statuses;
  }

  async function persistNew(close: () => void) {
    const name = creating?.trim();
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
      // Append optimistically and notify the parent so other rows see the new
      // option without a page reload.
      onStatusesChange?.([...statuses, row]);
      onChange(row);
      close();
    } catch {
      toast.danger('Could not create status');
    }
  }
</script>

<Popover
  bind:open
  label="Status"
  panelRole="dialog"
  autoFocus={false}
  onclose={reset}
  class="min-w-0 max-w-full"
>
  {#snippet trigger(attrs)}
    <button
      {...attrs}
      type="button"
      aria-label={current ? `Status: ${current.name}` : 'Set status'}
      class="group inline-flex min-h-[24px] min-w-[24px] max-w-full items-center rounded-[var(--radius-sm)] px-1 py-0.5 transition-colors hover:bg-[var(--color-surface-2)]"
    >
      {#if current}
        <StatusPill status={current} />
      {:else}
        <span class="text-xs text-[var(--color-subtle)]">·</span>
      {/if}
    </button>
  {/snippet}

  {#snippet content({ close })}
    <div class="w-[200px]">
      {#if creating === null}
        <Combobox
          {search}
          getId={(s) => s.id}
          searchOnOpen
          debounce={0}
          placeholder="Find or create a status…"
          emptyText="No statuses yet."
          canCreate={(q) => !statuses.some((s) => s.name.toLowerCase() === q.toLowerCase())}
          createLabel={(q) => `Create “${q}”`}
          onCreate={(q) => {
            creating = q;
          }}
          onSelect={(s) => {
            onChange(s);
            close();
          }}
        >
          {#snippet option(s: StatusRow)}
            {@const styles = TONE_STYLES[s.tone]}
            <span class="h-1.5 w-1.5 shrink-0 rounded-full" style="background: {styles.dot}"></span>
            <span class="flex-1 truncate {s.id === value ? 'font-medium' : ''}">{s.name}</span>
            {#if s.id === value}
              <Check size={11} strokeWidth={2.5} class="text-[var(--color-muted)]" />
            {/if}
          {/snippet}
        </Combobox>

        {#if value != null}
          <button
            type="button"
            onclick={() => {
              onChange(null);
              close();
            }}
            class="flex w-full items-center gap-2 border-t border-[var(--color-border)] px-2.5 py-1.5 text-left text-[11px] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
          >
            <X size={11} strokeWidth={2} />
            Clear status
          </button>
        {/if}
      {:else}
        <!-- Tone picker for the new status. Enter creates, Back returns. -->
        <div class="flex flex-col gap-2 p-2.5">
          <div class="text-[11px] text-[var(--color-muted)]">New status</div>
          <div
            class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs"
          >
            {creating}
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
                class="h-5 w-5 rounded-full border transition-transform {sel
                  ? 'scale-110 ring-1 ring-offset-1 ring-offset-[var(--color-surface)]'
                  : ''}"
                style={sel
                  ? `background: ${styles.dot}; border-color: ${styles.dot}; --tw-ring-color: ${styles.dot}`
                  : `background: ${styles.bg}; border-color: ${styles.border}`}
              >
                <span class="sr-only">{tone}</span>
              </button>
            {/each}
          </div>
          <div class="flex items-center justify-end gap-1 pt-1">
            <Button size="xs" onclick={() => (creating = null)}>Back</Button>
            <Button variant="primary" size="xs" onclick={() => persistNew(close)}>Create</Button>
          </div>
        </div>
      {/if}
    </div>
  {/snippet}
</Popover>
