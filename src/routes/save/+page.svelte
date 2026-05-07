<script lang="ts">
  import { AlertTriangle } from 'lucide-svelte';
  let { data } = $props();
  const messages: Record<string, string> = {
    no_url: 'No link found. Share a URL or type one in.',
    rate_limited: 'Too many saves recently. Try again in a few minutes.',
    bad_scheme: 'Only http(s) links can be saved.',
    parse_failed: 'That link looked malformed.',
    empty: 'No link in the share payload.',
    private_address: 'That link points to a private address — Gusto only fetches public URLs.',
    dns_failed: 'Could not resolve that domain.'
  };
  const message = $derived(messages[data.error ?? ''] ?? 'Could not save that link.');
</script>

<section class="mx-auto flex max-w-md flex-col gap-4 px-4 py-12 text-center">
  <span class="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning)]">
    <AlertTriangle size={18} strokeWidth={2} />
  </span>
  <h1 class="text-xl font-semibold tracking-tight">Couldn't save that link</h1>
  <p class="text-sm text-[var(--color-muted)]">{message}</p>
  <a href="/" class="mx-auto inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-surface)]">Back to dashboard</a>
</section>
