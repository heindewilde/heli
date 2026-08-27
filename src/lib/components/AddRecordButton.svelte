<script lang="ts">
  /**
   * The primary "Add person" / "Add company" control on the list pages.
   *
   * It used to *replace* the whole button cluster with a bare text input: the
   * primary button vanished at the moment you were trying to use it, Export and
   * Import disappeared with it, the row changed width, and the only way to
   * commit was an Enter key nothing on screen mentioned. A popover keeps every
   * button where it was and gives the field a real label and a real submit.
   *
   * `open` is bindable because the page opens it from two other places — the
   * empty state's call to action, and the `n p` / `n c` keyboard command. There
   * is still only ever **one** instance of this component per page, which is
   * what keeps it clear of the "one popover per instance" rule: two instances
   * sharing a bound `open` is precisely the bug that hit the collection page.
   */
  import { Plus, Loader2 } from 'lucide-svelte';
  import Popover from '$lib/ui/Popover.svelte';

  type Props = {
    open: boolean;
    /** "person" | "company" — used in the label, placeholder and button. */
    noun: string;
    busy?: boolean;
    /** Returns true when the record was created, so the field can reset. */
    onsubmit: (name: string) => Promise<boolean> | boolean;
  };

  let { open = $bindable(false), noun, busy = false, onsubmit }: Props = $props();

  let name = $state('');

  async function submit(close: () => void) {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    const ok = await onsubmit(trimmed);
    if (ok) {
      name = '';
      close();
    }
  }
</script>

<Popover
  bind:open
  label={`Add ${noun}`}
  panelRole="dialog"
  onclose={() => (name = '')}
>
  {#snippet trigger(attrs)}
    <button
      {...attrs}
      type="button"
      class="inline-flex h-7 items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-2.5 text-xs font-medium text-[var(--color-accent-fg)] transition-colors hover:bg-[var(--color-accent-hover)]"
    >
      <Plus size={13} strokeWidth={2} />
      Add {noun}
    </button>
  {/snippet}
  {#snippet content({ close })}
    <!-- `trapFocus` focuses the first focusable in the panel, which is this
         input — no manual focus call, and none of the layout-timing trouble a
         hand-rolled one runs into. -->
    <form
      class="flex w-60 flex-col gap-2 p-2.5"
      onsubmit={(e) => {
        e.preventDefault();
        submit(close);
      }}
    >
      <label class="flex flex-col gap-1">
        <span class="text-[11px] font-medium text-[var(--color-muted)]">Name</span>
        <input
          bind:value={name}
          type="text"
          placeholder={noun === 'company' ? 'Acme Corp' : 'Ada Lovelace'}
          disabled={busy}
          class="h-7 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs outline-none focus:border-[var(--color-border-strong)]"
        />
      </label>
      <div class="flex justify-end gap-1.5">
        <button
          type="button"
          onclick={close}
          class="inline-flex h-7 items-center rounded-[var(--radius-sm)] px-2 text-xs text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !name.trim()}
          class="inline-flex h-7 items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-2.5 text-xs font-medium text-[var(--color-accent-fg)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          {#if busy}
            <Loader2 size={12} strokeWidth={2} class="animate-spin" />
          {/if}
          Add
        </button>
      </div>
    </form>
  {/snippet}
</Popover>
