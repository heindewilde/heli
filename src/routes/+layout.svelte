<script lang="ts">
  import '../app.css';
  import { APP_NAME } from '$lib/branding';
  import Toaster from '$lib/components/Toaster.svelte';
  import SaveBar from '$lib/components/SaveBar.svelte';
  import CommandPalette from '$lib/components/CommandPalette.svelte';
  import ShortcutHelp from '$lib/components/ShortcutHelp.svelte';
  import RemindersPopover from '$lib/components/RemindersPopover.svelte';
  import BrandMark from '$lib/components/BrandMark.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import { Users, Building2, MessagesSquare, FolderKanban, FolderOpen, GitBranch, LogOut, Search, HelpCircle, Settings, Menu, X } from 'lucide-svelte';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { invalidateAll, goto } from '$app/navigation';
  import { bindKeys, isTypingTarget } from '$lib/keyboard.svelte';
  import { toast } from '$lib/toasts.svelte';
  import { saveErrorMessage } from '$lib/save-errors';

  let { data, children } = $props();
  const user = $derived(data.user);
  const reminders = $derived(data.reminders ?? []);

  let saveBar = $state<SaveBar | undefined>(undefined);
  let paletteOpen = $state(false);
  let helpOpen = $state(false);
  let sidebarOpen = $state(false);

  const tabs = [
    { href: '/people', label: 'People', icon: Users },
    { href: '/companies', label: 'Companies', icon: Building2 },
    { href: '/interactions', label: 'Interactions', icon: MessagesSquare },
    { href: '/projects', label: 'Projects', icon: FolderKanban },
    { href: '/collections', label: 'Collections', icon: FolderOpen },
    { href: '/pipelines', label: 'Pipelines', icon: GitBranch }
  ];

  // Close the mobile drawer whenever the route changes (clicking a tab inside
  // the drawer triggers SvelteKit navigation, which updates page.url).
  $effect(() => {
    page.url.pathname;
    sidebarOpen = false;
  });

  // Lock background scroll while the drawer is open on mobile.
  $effect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  });

  onMount(() => {
    const cleanups: Array<() => void> = [];

    // cmd/ctrl + K is meta-modified, so it doesn't go through bindKeys' filter.
    const onMetaKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        helpOpen = false;
        paletteOpen = !paletteOpen;
      }
    };
    window.addEventListener('keydown', onMetaKey);
    cleanups.push(() => window.removeEventListener('keydown', onMetaKey));

    // `?` (shift+/) for help — fire even from inside no-input contexts; we still
    // ignore inputs to avoid hijacking text entry. Esc closes the mobile drawer.
    const onPlainKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (e.key === '?') {
        e.preventDefault();
        paletteOpen = false;
        helpOpen = !helpOpen;
      } else if (e.key === 'Escape' && sidebarOpen) {
        sidebarOpen = false;
      }
    };
    window.addEventListener('keydown', onPlainKey);
    cleanups.push(() => window.removeEventListener('keydown', onPlainKey));

    cleanups.push(
      bindKeys((e) => {
        if (!user) return;
        if (e.key === '/') {
          const search = document.querySelector<HTMLInputElement>('[data-search-input]');
          if (search) {
            search.focus();
            search.select?.();
            return true;
          }
        }
      })
    );

    // Paste-anywhere → save URL. A plain cmd/ctrl+V outside any text-entry
    // surface is treated as "save this link". When the user pastes inside an
    // input/textarea/contenteditable we leave the event alone so they can edit
    // normally.
    let pasteBusy = false;
    const onPaste = async (e: ClipboardEvent) => {
      if (!user) return;
      if (pasteBusy) return;
      if (isTypingTarget(e.target)) return;
      const text = e.clipboardData?.getData('text/plain')?.trim();
      if (!text) return;
      // Cheap pre-check: only intercept things that plausibly look like a URL.
      let url: URL;
      try {
        url = new URL(text);
      } catch {
        return;
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
      e.preventDefault();
      pasteBusy = true;
      try {
        const res = await fetch('/api/save', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ url: text })
        });
        if (!res.ok) {
          const code = (await res.text().catch(() => '')) || '';
          toast.danger(saveErrorMessage(code));
          return;
        }
        const data = (await res.json()) as { id: string; kind: 'person' | 'company'; dedup: boolean };
        const path = data.kind === 'person' ? `/people/${data.id}` : `/companies/${data.id}`;
        await invalidateAll();
        await goto(path + (data.dedup ? '?dedup=1' : '?just=1'));
      } catch (err) {
        toast.danger(saveErrorMessage(null, (err as Error).message || 'Save failed'));
      } finally {
        pasteBusy = false;
      }
    };
    window.addEventListener('paste', onPaste);
    cleanups.push(() => window.removeEventListener('paste', onPaste));

    return () => cleanups.forEach((c) => c());
  });
</script>

<div class="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
  <header class="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-bg)_88%,transparent)] px-4 backdrop-blur supports-[backdrop-filter]:bg-[color-mix(in_srgb,var(--color-bg)_72%,transparent)]">
    {#if user}
      <button
        type="button"
        onclick={() => (sidebarOpen = !sidebarOpen)}
        aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={sidebarOpen}
        class="-ml-1 inline-flex items-center justify-center rounded-[var(--radius-sm)] p-1.5 text-[var(--color-subtle)] hover:bg-[var(--color-surface)] md:hidden"
      >
        {#if sidebarOpen}<X size={18} strokeWidth={2} />{:else}<Menu size={18} strokeWidth={2} />{/if}
      </button>
    {/if}
    <a href="/" class="flex items-center gap-2 font-semibold tracking-tight">
      <BrandMark size={22} />
      <span class="hidden sm:inline">{APP_NAME}</span>
    </a>
    {#if user}
      <div class="ml-2 min-w-0 flex-1">
        <SaveBar bind:this={saveBar} />
      </div>
    {/if}
    <div class="ml-auto flex items-center gap-1 sm:gap-2">
      {#if !user}
        <ThemeToggle />
      {/if}
      {#if user}
        <button
          type="button"
          onclick={() => (paletteOpen = true)}
          title="Search (⌘K)"
          aria-label="Search"
          class="hidden items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-muted)] shadow-[var(--shadow-xs)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)] sm:inline-flex"
        >
          <Search size={12} strokeWidth={2} />
          <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 font-sans text-[10px] leading-none">⌘K</kbd>
        </button>
        <button
          type="button"
          onclick={() => (helpOpen = true)}
          title="Keyboard shortcuts (?)"
          aria-label="Keyboard shortcuts"
          class="hidden rounded-[var(--radius-sm)] p-1.5 text-[var(--color-subtle)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] sm:inline-flex"
        ><HelpCircle size={14} strokeWidth={2} /></button>
        <ThemeToggle />
        <a
          href="/settings"
          title="Settings"
          aria-label="Settings"
          class="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-subtle)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
        ><Settings size={14} strokeWidth={2} /></a>
        <span aria-hidden="true" class="mx-1 hidden h-5 w-px bg-[var(--color-border)] sm:inline-block"></span>
        <span class="hidden max-w-[12rem] truncate text-sm text-[var(--color-muted)] md:inline">{user.username ?? user.email}</span>
        <form method="POST" action="/auth/logout" class="contents">
          <button
            type="submit"
            title="Sign out"
            aria-label="Sign out"
            class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] p-1.5 text-[var(--color-subtle)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
          >
            <LogOut size={14} strokeWidth={2} />
          </button>
        </form>
      {:else}
        <a
          href="/auth"
          class="rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--color-accent-hover)]"
        >Sign in</a>
      {/if}
    </div>
  </header>

  {#if user}
    <!-- Backdrop: only visible on mobile when the drawer is open. -->
    {#if sidebarOpen}
      <button
        type="button"
        aria-label="Close menu"
        onclick={() => (sidebarOpen = false)}
        class="fixed inset-0 top-14 z-30 bg-black/40 md:hidden"
      ></button>
    {/if}

    <div class="flex w-full gap-6 py-6 md:pr-6">
      <aside
        class="fixed inset-y-0 left-0 top-14 z-40 w-64 shrink-0 transform border-r border-[var(--color-border)] bg-[var(--color-bg)] p-4 transition-transform duration-200 ease-out md:static md:top-0 md:w-48 md:shrink-0 md:border-r-0 md:bg-transparent md:py-0 md:pl-4 md:pr-0 md:translate-x-0 {sidebarOpen ? 'translate-x-0 shadow-[var(--shadow-lg)]' : '-translate-x-full md:transform-none'}"
        aria-label="Primary navigation"
      >
        <nav class="flex flex-col gap-0.5">
          {#each tabs as tab (tab.href)}
            {@const active = page.url.pathname === tab.href || page.url.pathname.startsWith(tab.href + '/')}
            <a
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              class="group relative flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm transition-colors {active
                ? 'font-medium text-[var(--color-text)]'
                : 'text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]'}"
            >
              <span
                aria-hidden="true"
                class="absolute inset-y-1 left-0 w-0.5 rounded-full bg-[var(--color-accent)] transition-opacity {active ? 'opacity-100' : 'opacity-0'}"
              ></span>
              <tab.icon size={14} strokeWidth={active ? 2.25 : 2} class={active ? 'text-[var(--color-text)]' : 'text-[var(--color-subtle)] group-hover:text-[var(--color-muted)]'} />
              <span>{tab.label}</span>
            </a>
          {/each}
        </nav>
        <div class="mt-4 border-t border-[var(--color-border)] pt-3">
          <RemindersPopover items={reminders} />
        </div>
      </aside>
      <main class="min-w-0 flex-1 px-4 md:px-0">{@render children()}</main>
    </div>
  {:else}
    <main>{@render children()}</main>
  {/if}
</div>

{#if user}
  <CommandPalette bind:open={paletteOpen} onClose={() => (paletteOpen = false)} />
  <ShortcutHelp bind:open={helpOpen} onClose={() => (helpOpen = false)} />
{/if}
<Toaster />
