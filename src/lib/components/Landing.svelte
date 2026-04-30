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

<section class="mx-auto flex min-h-[80vh] max-w-3xl flex-col items-start justify-center gap-6 px-6 py-20">
  <a
    href="https://github.com/"
    class="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-muted)]"
  >Open source · self-hostable</a>

  <h1 class="text-balance text-[clamp(2rem,5vw,3.375rem)] font-semibold leading-[1.05] tracking-tight">
    {APP_TAGLINE}
  </h1>
  <p class="max-w-xl text-[var(--color-muted)]">
    {APP_NAME} is a private, lightweight CRM for People, Companies, and Interactions.
    Paste a link in the topbar and it gets classified, stored, and enriched —
    nothing more, nothing less.
  </p>

  <div class="flex gap-2">
    <a
      href="/auth"
      class="rounded-[var(--radius-sm)] bg-[var(--color-product)] px-4 py-2 text-sm font-medium text-white"
    >Sign in</a>
    <a
      href="/auth?mode=register"
      class="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface)]"
    >Sign up</a>
  </div>

  <ul class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
    {#each trust as t (t.label)}
      <li class="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm">
        <t.icon size={14} strokeWidth={2} />
        <span>{t.label}</span>
      </li>
    {/each}
  </ul>
</section>
