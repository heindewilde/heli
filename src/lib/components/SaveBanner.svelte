<script lang="ts">
  import { goto, replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import { Sparkles, Repeat, Undo2, X } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';

  type Variant = 'just' | 'dedup';
  type Kind = 'person' | 'company' | 'project';

  type Props = {
    variant: Variant;
    kind: Kind;
    entityId: string;
    entityName: string;
    /** Epoch ms when the entity was created. Used to bound the undo window. */
    createdAt: number;
  };

  let { variant, kind, entityId, entityName, createdAt }: Props = $props();

  const UNDO_WINDOW_MS = 6000;
  const ageMs = $derived(Date.now() - createdAt);
  let dismissed = $state(false);
  let now = $state(Date.now());

  // Tick every second so the "Undo (3s)" countdown stays accurate. Cleared
  // when the banner is dismissed or the window elapses.
  $effect(() => {
    if (variant !== 'just' || dismissed) return;
    const t = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(t);
  });

  const undoSecondsLeft = $derived(
    Math.max(0, Math.ceil((createdAt + UNDO_WINDOW_MS - now) / 1000))
  );
  const undoExpired = $derived(undoSecondsLeft === 0);
  const showBanner = $derived(
    !dismissed && (variant === 'dedup' || (variant === 'just' && !undoExpired))
  );

  const listHref = $derived(
    kind === 'person' ? '/people' : kind === 'company' ? '/companies' : '/projects'
  );
  const apiBase = $derived(
    kind === 'person' ? '/api/people' : kind === 'company' ? '/api/companies' : '/api/projects'
  );

  let undoing = $state(false);

  async function undoSave() {
    if (undoing) return;
    undoing = true;
    // Navigate first so the user isn't staring at a 404 if the delete is slow.
    await goto(listHref);
    try {
      const res = await fetch(`${apiBase}/${entityId}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.danger(`Could not undo — ${entityName} is still saved.`);
        return;
      }
      toast.info(`Undone — ${entityName} discarded.`);
    } catch {
      toast.danger(`Could not undo — ${entityName} is still saved.`);
    } finally {
      undoing = false;
    }
  }

  /**
   * Strip ?just / ?dedup so refreshing doesn't redisplay the banner.
   *
   * `replaceState` from `$app/navigation`, never `window.history.replaceState`.
   * The raw call changes the address bar without telling SvelteKit, so
   * `page.url` keeps the flag for the rest of the session — every later reader
   * of `page.url.search` then sees a `?just=1` that is no longer true, and any
   * link built from it inherits the flag.
   *
   * `[id]/+page.svelte` already does exactly this for `?outreach`, so this is a
   * consistency fix as much as a bug fix. It re-runs no loads.
   */
  function dropFlagFromUrl() {
    if (typeof window === 'undefined') return;
    const u = new URL(page.url);
    u.searchParams.delete('just');
    u.searchParams.delete('dedup');
    replaceState(u, page.state);
  }

  function dismiss() {
    dismissed = true;
    dropFlagFromUrl();
  }
</script>

{#if showBanner}
  {#if variant === 'just'}
    <aside
      role="status"
      class="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-success-border)] bg-[var(--color-success-bg)] px-3 py-2 text-sm text-[var(--color-success)]"
    >
      <Sparkles size={14} strokeWidth={2} class="shrink-0" />
      <p class="min-w-0 flex-1">
        Saved <strong class="font-medium">{entityName}</strong>. We're enriching in the background.
      </p>
      <button
        type="button"
        onclick={undoSave}
        disabled={undoing}
        class="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-success-border)] bg-[var(--color-success-bg)] px-2 py-1 text-xs font-medium hover:bg-[var(--color-success-border)] disabled:opacity-60"
      >
        <Undo2 size={12} strokeWidth={2} />
        Undo ({undoSecondsLeft}s)
      </button>
      <button
        type="button"
        onclick={dismiss}
        aria-label="Dismiss"
        class="rounded-[var(--radius-sm)] p-1 opacity-60 hover:opacity-100"
      ><X size={12} strokeWidth={2} /></button>
    </aside>
  {:else}
    <aside
      role="status"
      class="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-info-border)] bg-[var(--color-info-bg)] px-3 py-2 text-sm text-[var(--color-info)]"
    >
      <Repeat size={14} strokeWidth={2} class="shrink-0" />
      <p class="min-w-0 flex-1">
        You've already saved <strong class="font-medium">{entityName}</strong>. We brought you to the existing entry.
      </p>
      <button
        type="button"
        onclick={dismiss}
        aria-label="Dismiss"
        class="rounded-[var(--radius-sm)] p-1 opacity-60 hover:opacity-100"
      ><X size={12} strokeWidth={2} /></button>
    </aside>
  {/if}
{/if}
