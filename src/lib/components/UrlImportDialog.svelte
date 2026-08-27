<script lang="ts">
  /**
   * Paste a list of links and stage them for review.
   *
   * Deliberately one textarea and one file input, with no format to choose:
   * `extractUrls` reads free text, a CSV, one-per-line and comma-separated the
   * same way, so asking which one you have is a question nobody should have to
   * answer. The server does the recognising.
   */
  import Dialog from '$lib/ui/Dialog.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { goto } from '$app/navigation';
  import { toast } from '$lib/toasts.svelte';
  import { readErrorCode } from '$lib/api-error';
  import { autofocus } from '$lib/actions';

  type Props = {
    open: boolean;
    /** Where Cancel and the review screen return to, absent a collection. */
    from: 'people' | 'companies';
    /**
     * When the paste was started from a collection page, every record the
     * commit touches — created *and* already-existing — joins this collection.
     * Sent as a query param so the server stores it on the staging record; the
     * review screen then reads the destination from there rather than from
     * anything the browser hands back.
     */
    collection?: { id: string; name: string } | null;
    onclose: () => void;
  };

  let { open, from, collection = null, onclose }: Props = $props();

  let text = $state('');
  let busy = $state(false);

  const ERRORS: Record<string, string> = {
    empty_paste: 'Paste some links first.',
    no_urls: 'No links found in that.',
    too_many_rows: 'That is more than 500 links — split it into a few pastes.',
    file_too_large: 'That file is too big.',
    unknown_collection: 'That collection no longer exists.',
    rate_limited: 'Too many pastes in the last hour. Try again shortly.'
  };

  async function submit() {
    if (busy || !text.trim()) return;
    busy = true;
    try {
      const endpoint = collection
        ? `/api/import/urls?collection=${encodeURIComponent(collection.id)}`
        : '/api/import/urls';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: text
      });
      if (!res.ok) {
        toast.danger(ERRORS[await readErrorCode(res)] ?? 'Could not read that');
        return;
      }
      onclose();
      // With a collection the review screen derives its own back-link from the
      // staging record, so `from` would only be a second source of truth.
      goto(collection ? '/import/urls' : `/import/urls?from=${from}`);
    } catch {
      toast.danger('Could not read that');
    } finally {
      busy = false;
    }
  }

  async function pickFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    text = await file.text();
  }
</script>

{#if open}
  <Dialog {open} {onclose} label="Import links" panelClass="w-[min(36rem,92vw)] p-5">
    {#snippet children({ close })}
      <h2 class="text-base font-semibold">Import links</h2>
      <p class="mt-1 text-sm text-[var(--color-muted)]">
        Paste anything — a list of profile URLs, a column from a spreadsheet, a block of notes.
        Heli finds the links and works out which are people and which are companies. You review
        before anything is saved.
      </p>
      {#if collection}
        <p class="mt-1 text-sm text-[var(--color-muted)]">
          Everything you keep is added to <strong class="text-[var(--color-text)]">{collection.name}</strong>,
          including links you already have saved — those are added to the collection without
          being duplicated.
        </p>
      {/if}

      <textarea
        use:autofocus
        bind:value={text}
        rows="8"
        placeholder={'https://linkedin.com/in/ada-lovelace\nacme.com\nhttps://github.com/torvalds'}
        class="mt-3 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 font-mono text-xs leading-relaxed"
      ></textarea>

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <label class="text-xs text-[var(--color-muted)]">
          <span class="underline">or choose a file</span>
          <input type="file" accept=".txt,.csv,text/plain,text/csv" onchange={pickFile} class="sr-only" />
        </label>
        <span class="ml-auto flex gap-2">
          <Button variant="secondary" onclick={close}>Cancel</Button>
          <Button variant="primary" onclick={submit} disabled={busy || !text.trim()}>
            {busy ? 'Reading…' : 'Review links'}
          </Button>
        </span>
      </div>
    {/snippet}
  </Dialog>
{/if}
