<script lang="ts">
  import { APP_NAME, APP_TAGLINE } from '$lib/branding';
  import { Lock, Database, Zap, Sparkles } from 'lucide-svelte';

  const trust = [
    { icon: Lock, label: 'Open source' },
    { icon: Database, label: 'Self-hostable' },
    { icon: Zap, label: 'No tracking' },
    { icon: Sparkles, label: 'One file backup' }
  ];
</script>

<section class="mx-auto flex min-h-[80vh] max-w-3xl flex-col items-start justify-center gap-7 px-6 py-20">
  <span
    class="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-muted)] shadow-[var(--shadow-xs)]"
  >
    <span class="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-success)]"></span>
    Open source · self-hostable
  </span>

  <h1 class="text-balance text-[clamp(2.25rem,5.5vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.02em]">
    {APP_TAGLINE}.
  </h1>
  <p class="max-w-xl text-[1.0625rem] leading-relaxed text-[var(--color-muted)]">
    {APP_NAME} is a private, lightweight CRM for People, Companies, and Interactions.
    Paste a link in the topbar and it gets classified, stored, and enriched —
    nothing more, nothing less.
  </p>

  <div class="flex flex-wrap gap-2">
    <a
      href="/auth?mode=register"
      class="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-[var(--color-accent-fg)] shadow-[var(--shadow-sm)] transition-all hover:bg-[var(--color-accent-hover)] hover:shadow-[var(--shadow-md)]"
    >Get started</a>
    <a
      href="/auth"
      class="inline-flex items-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-medium transition-colors hover:border-[var(--color-border-strong)]"
    >Sign in</a>
  </div>

  <ul class="mt-4 grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
    {#each trust as t (t.label)}
      <li class="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm shadow-[var(--shadow-xs)]">
        <t.icon size={14} strokeWidth={2} class="text-[var(--color-muted)]" />
        <span>{t.label}</span>
      </li>
    {/each}
  </ul>
</section>
