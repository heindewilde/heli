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
    /** Where Cancel and the review screen return to. */
    from: 'people' | 'companies';
    onclose: () => void;
  };

  let { open, from, onclose }: Props = $props();

  let text = $state('');
  let busy = $state(false);

  const ERRORS: Record<string, string> = {
    empty_paste: 'Paste some links first.',
    no_urls: 'No links found in that.',
    too_many_rows: 'That is more than 500 links — split it into a few pastes.',
    file_too_large: 'That file is too big.',
    rate_limited: 'Too many pastes in the last hour. Try again shortly.'
  };

  async function submit() {
    if (busy || !text.trim()) return;
    busy = true;
    try {
      const res = await fetch('/api/import/urls', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: text
      });
      if (!res.ok) {
        toast.danger(ERRORS[await readErrorCode(res)] ?? 'Could not read that');
        return;
      }
      onclose();
      goto(`/import/urls?from=${from}`);
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
