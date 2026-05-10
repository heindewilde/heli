<script lang="ts">
  import { page } from '$app/state';
  import { APP_NAME } from '$lib/branding';
  import { Frown, Home, ArrowLeft } from 'lucide-svelte';

  type Friendly = { title: string; sub: string };
  const FRIENDLY: Record<number, Friendly> = {
    400: { title: 'That request looked off', sub: 'Some required field was missing or malformed.' },
    401: { title: 'Please sign in', sub: `You need a ${APP_NAME} account to view this.` },
    403: { title: 'Forbidden', sub: "You don't have access to this." },
    404: { title: "We couldn't find that", sub: "It might have been deleted, or the link is wrong." },
    429: { title: 'Slow down a sec', sub: 'Too many requests in a short window. Try again in a moment.' },
    500: { title: 'Something went wrong on our end', sub: 'Try refreshing — if it sticks, the dev console may have details.' }
  };

  const status = $derived(page.status);
  const fallback: Friendly = $derived({ title: `Error ${status}`, sub: page.error?.message ?? 'Unexpected error.' });
  const friendly = $derived(FRIENDLY[status] ?? fallback);
</script>

<section class="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-4 py-12 text-center">
  <span class="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-subtle)]">
    <Frown size={22} strokeWidth={2} />
  </span>
  <h1 class="text-2xl font-semibold tracking-tight">{friendly.title}</h1>
  <p class="text-sm text-[var(--color-muted)]">{friendly.sub}</p>
  <p class="text-[11px] text-[var(--color-subtle)]">Status {status}</p>

  <div class="mt-2 flex items-center gap-2">
    {#if status === 401}
      <a
        href="/auth?next={encodeURIComponent(page.url.pathname + page.url.search)}"
        class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-hover)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)]"
      >Sign in</a>
    {:else}
      <a
        href="/"
        class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-hover)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)]"
      >
        <Home size={14} strokeWidth={2} />
        Back to dashboard
      </a>
    {/if}
    <button
      type="button"
      onclick={() => history.back()}
      class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-surface)]"
    >
      <ArrowLeft size={14} strokeWidth={2} />
      Go back
    </button>
  </div>
</section>
