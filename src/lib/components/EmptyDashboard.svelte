<script lang="ts">
  import { APP_NAME } from '$lib/branding';
  import { Linkedin, Building2, Github, Bookmark, Keyboard, Search } from 'lucide-svelte';

  // Each card opens /save?url=… — the existing share-target route. It calls
  // the same classify + save pipeline as the topbar and lands on the new
  // detail page so the user immediately sees enrichment in flight.
  const tries = [
    {
      label: 'Save a person from LinkedIn',
      sub: 'linkedin.com/in/satyanadella',
      url: 'https://www.linkedin.com/in/satyanadella/',
      icon: Linkedin
    },
    {
      label: 'Save a company website',
      sub: 'stripe.com',
      url: 'https://stripe.com',
      icon: Building2
    },
    {
      label: 'Save a GitHub profile',
      sub: 'github.com/torvalds',
      url: 'https://github.com/torvalds',
      icon: Github
    }
  ];
</script>

<section class="flex flex-col gap-8">
  <header class="flex flex-col gap-2">
    <h1 class="text-2xl font-semibold tracking-tight">Welcome to {APP_NAME}.</h1>
    <p class="text-sm text-[var(--color-muted)]">
      Paste a profile or website link anywhere on the page. {APP_NAME} classifies and enriches it in the background.
    </p>
  </header>

  <section class="flex flex-col gap-3">
    <h2 class="text-sm font-medium text-[var(--color-muted)]">Or try one of these</h2>
    <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {#each tries as t (t.url)}
        {@const Icon = t.icon}
        <a
          href={`/save?url=${encodeURIComponent(t.url)}`}
          data-sveltekit-preload-data="off"
          class="group flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-left shadow-[var(--shadow-xs)] transition-all hover:-translate-y-px hover:border-[var(--color-border-strong)] hover:shadow-[var(--shadow-sm)]"
        >
          <span class="flex items-center gap-2 text-sm font-medium">
            <Icon size={14} strokeWidth={2} class="text-[var(--color-muted)]" />
            {t.label}
          </span>
          <span class="truncate text-xs text-[var(--color-subtle)]">{t.sub}</span>
        </a>
      {/each}
    </div>
  </section>

  <section class="flex flex-col gap-4">
    <h2 class="text-sm font-medium text-[var(--color-muted)]">A few things to know</h2>
    <ul class="flex flex-col gap-5 text-sm">
      <li class="flex items-start gap-4">
        <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]">
          <Search size={15} strokeWidth={2} />
        </span>
        <span class="min-w-0 flex-1 leading-relaxed">
          <span class="font-medium">Press <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 text-[10px] font-mono">⌘K</kbd> to search</span>
          <span class="mt-1 block text-xs text-[var(--color-muted)]">Across people, companies, and interactions. Prefix with <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 text-[10px] font-mono">p:</kbd>, <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 text-[10px] font-mono">c:</kbd>, or <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 text-[10px] font-mono">i:</kbd> to scope.</span>
        </span>
      </li>
      <li class="flex items-start gap-4">
        <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]">
          <Keyboard size={15} strokeWidth={2} />
        </span>
        <span class="min-w-0 flex-1 leading-relaxed">
          <span class="font-medium">Press <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 text-[10px] font-mono">?</kbd> for shortcuts</span>
          <span class="mt-1 block text-xs text-[var(--color-muted)]">Lists are keyboard-driven: <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 text-[10px] font-mono">j/k</kbd> to navigate, <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 text-[10px] font-mono">enter</kbd> to open, <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 text-[10px] font-mono">*</kbd> to favorite.</span>
        </span>
      </li>
      <li class="flex items-start gap-4">
        <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]">
          <Bookmark size={15} strokeWidth={2} />
        </span>
        <span class="min-w-0 flex-1 leading-relaxed">
          <span class="font-medium">Drag the bookmarklet to save from any tab</span>
          <span class="mt-1 block text-xs text-[var(--color-muted)]">
            <a href="/settings" class="font-medium text-[var(--color-text)] underline decoration-[var(--color-border-strong)] underline-offset-2 hover:decoration-[var(--color-accent)]">Settings → Bookmarklet</a> has a one-click setup.
          </span>
        </span>
      </li>
    </ul>
  </section>
</section>
