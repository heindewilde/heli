<script lang="ts">
  import '../app.css';
  import Toaster from '$lib/components/Toaster.svelte';
  import SaveBar from '$lib/components/SaveBar.svelte';
  import WorkspaceSwitcher from '$lib/components/WorkspaceSwitcher.svelte';
  import CommandPalette from '$lib/components/CommandPalette.svelte';
  import ShortcutHelp from '$lib/components/ShortcutHelp.svelte';
  import RemindersPopover from '$lib/components/RemindersPopover.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import UpdateBanner from '$lib/components/UpdateBanner.svelte';
  import { watchServiceWorker } from '$lib/client/sw.svelte';
  import { LayoutDashboard, Users, Building2, MessagesSquare, Briefcase, Folder, Funnel, Send, LogOut, Search, HelpCircle, Settings, Menu, X } from 'lucide-svelte';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { invalidateAll, goto } from '$app/navigation';
  import { isTypingTarget } from '$lib/keyboard.svelte';
  import {
    registerCommands,
    startShortcuts,
    clearRecents,
    type Command
  } from '$lib/commands/registry.svelte';
  import { Plus, MessageSquarePlus } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';
  import { saveErrorMessage } from '$lib/save-errors';
  import { readErrorCode } from '$lib/api-error';
  import { APP_NAME, APP_DOMAIN, APP_TAGLINE, APP_DESCRIPTION } from '$lib/branding';
  import { VERSION } from '$lib/version';

  let { data, children } = $props();
  const user = $derived(data.user);

  const canonicalUrl = $derived(`https://${APP_DOMAIN}${page.url.pathname}`);

  let saveBar = $state<SaveBar | undefined>(undefined);
  let paletteOpen = $state(false);
  let helpOpen = $state(false);
  let sidebarOpen = $state(false);

  // `g <letter>` targets. Letters are the first distinctive character of each
  // destination — `g i` for interactions, not `g n`.
  const GO_KEYS: Record<string, string> = {
    '/': 'd',
    '/people': 'p',
    '/companies': 'c',
    '/interactions': 'i',
    '/collections': 'o',
    '/pipelines': 'l',
    '/projects': 'r',
    // `o` is collections and `r` is projects, so outreach takes `u`.
    '/outreach': 'u'
  };

  const tabs = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/people', label: 'People', icon: Users },
    { href: '/companies', label: 'Companies', icon: Building2 },
    { href: '/interactions', label: 'Interactions', icon: MessagesSquare },
    { href: '/collections', label: 'Collections', icon: Folder },
    { href: '/pipelines', label: 'Pipelines', icon: Funnel },
    { href: '/projects', label: 'Projects', icon: Briefcase },
    { href: '/outreach', label: 'Outreach', icon: Send }
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

  /**
   * Outreach templates as palette commands.
   *
   * An `$effect` rather than `onMount`, deliberately: the layout does not
   * remount on a workspace switch, so registering once would leave the previous
   * workspace's template names in the palette — the same leak that made the
   * palette's recents per-workspace. This re-runs whenever the layout data
   * changes and unregisters the old set on the way.
   */
  $effect(() => {
    const pending = data.outreachTemplates;
    let unregister: (() => void) | null = null;
    let cancelled = false;

    Promise.resolve(pending).then((items) => {
      if (cancelled || !items?.length) return;
      unregister = registerCommands(
        items.map((t) => ({
          id: `outreach:${t.id}`,
          title: `Outreach — ${t.name}`,
          section: 'Navigate' as const,
          icon: Send,
          keywords: ['template', 'message', t.platform.replace('_', ' ')],
          when: () => !!data.user,
          run: () => goto(`/outreach/${t.id}`)
        }))
      );
    });

    return () => {
      cancelled = true;
      unregister?.();
    };
  });

  onMount(() => {
    watchServiceWorker();

    const cleanups: Array<() => void> = [];

    // One dispatcher for every shortcut in the app, replacing `bindKeys` in
    // this file, `bindKeys` again on each list page, and two ad-hoc keydown
    // listeners for the cases bindKeys could not express — it bailed on any
    // modifier, which is why ⌘K needed its own.
    cleanups.push(startShortcuts());

    const signedIn = () => !!user;

    cleanups.push(
      registerCommands([
        {
          id: 'palette',
          title: 'Search everything',
          section: 'Navigate',
          icon: Search,
          shortcut: 'mod+k',
          run: () => {
            helpOpen = false;
            paletteOpen = !paletteOpen;
          }
        },
        {
          id: 'help',
          title: 'Show keyboard shortcuts',
          section: 'Workspace',
          icon: HelpCircle,
          shortcut: '?',
          run: () => {
            paletteOpen = false;
            helpOpen = !helpOpen;
          }
        },
        {
          id: 'focus-search',
          title: "Focus the page's search box",
          section: 'Navigate',
          shortcut: '/',
          hidden: true,
          when: () => signedIn() && !!document.querySelector('[data-search-input]'),
          run: () => {
            const el = document.querySelector<HTMLInputElement>('[data-search-input]');
            el?.focus();
            el?.select?.();
          }
        },
        {
          id: 'settings',
          title: 'Open settings',
          section: 'Workspace',
          icon: Settings,
          keywords: ['account', 'workspace', 'team', 'export'],
          when: signedIn,
          run: () => goto('/settings')
        },
        {
          id: 'new-interaction',
          title: 'Log an interaction',
          section: 'Create',
          icon: MessageSquarePlus,
          keywords: ['call', 'meeting', 'note', 'email'],
          shortcut: 'n i',
          when: signedIn,
          run: () => goto('/interactions/new')
        },
        {
          id: 'new-project',
          title: 'New project',
          section: 'Create',
          icon: Plus,
          shortcut: 'n p',
          when: signedIn,
          run: () => goto('/projects/new')
        },
        {
          id: 'new-collection',
          title: 'New collection',
          section: 'Create',
          icon: Plus,
          shortcut: 'n c',
          when: signedIn,
          run: () => goto('/collections/new')
        },
        {
          id: 'new-template',
          title: 'New outreach template',
          section: 'Create',
          icon: Send,
          keywords: ['message', 'email', 'outreach'],
          shortcut: 'n o',
          when: signedIn,
          run: () => goto('/outreach/new')
        },
        {
          id: 'new-pipeline',
          title: 'New pipeline',
          section: 'Create',
          icon: Plus,
          when: signedIn,
          run: () => goto('/pipelines/new')
        },
        // Both spellings for every tab: the number keys people already know,
        // and a `g <letter>` sequence that scales past nine destinations and
        // does not collide with typing a number into a field.
        ...tabs.flatMap((t, i): Command[] => {
          const letter = GO_KEYS[t.href];
          const entries: Command[] = [
            {
              id: `go:${t.href}`,
              title: `Go to ${t.label}`,
              section: 'Navigate',
              icon: t.icon,
              shortcut: letter ? `g ${letter}` : undefined,
              when: signedIn,
              run: () => goto(t.href)
            }
          ];
          if (i < 9) {
            entries.push({
              id: `go-num:${t.href}`,
              title: `Go to ${t.label}`,
              section: 'Navigate' as const,
              icon: t.icon,
              shortcut: String(i + 1),
              hidden: true,
              when: signedIn,
              run: () => goto(t.href)
            });
          }
          return entries;
        })
      ])
    );

    // Esc closes the mobile drawer. Not a registered command: the drawer is
    // layout state, and layerStack only knows about Popover/Dialog layers.
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sidebarOpen) sidebarOpen = false;
    };
    window.addEventListener('keydown', onEscape);
    cleanups.push(() => window.removeEventListener('keydown', onEscape));

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
          toast.danger(saveErrorMessage(await readErrorCode(res)));
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

<svelte:head>
  {#if !user}
    <link rel="preconnect" href="https://scripts.simpleanalyticscdn.com" crossorigin="anonymous" />
    {@html '<script async src="https://scripts.simpleanalyticscdn.com/latest.js"><\/script>'}
  {/if}
  <title>{APP_NAME}</title>
  <meta name="description" content={APP_DESCRIPTION} />
  <meta name="apple-mobile-web-app-title" content={APP_NAME} />
  <link rel="canonical" href={canonicalUrl} />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content={APP_NAME} />
  <meta property="og:title" content="{APP_NAME} — {APP_TAGLINE}" />
  <meta property="og:description" content={APP_DESCRIPTION} />
  <meta property="og:url" content={canonicalUrl} />
  <meta property="og:image" content="https://{APP_DOMAIN}/og-image.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="{APP_NAME} — {APP_TAGLINE}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{APP_NAME} — {APP_TAGLINE}" />
  <meta name="twitter:description" content={APP_DESCRIPTION} />
  <meta name="twitter:image" content="https://{APP_DOMAIN}/og-image.png" />
  <meta name="twitter:image:alt" content="{APP_NAME} — {APP_TAGLINE}" />
</svelte:head>

<div class="bg-[var(--color-bg)] text-[var(--color-text)] {user ? 'h-screen overflow-hidden' : ''}">
  {#if user}

    <!-- Topbar: sticky, in flow, full width. Pushes everything below it down naturally. -->
    <!-- Header padding removed on desktop; each section handles its own padding
         to structurally mirror the page layout (sidebar width + main padding). -->
    <header class="sticky top-0 z-50 flex h-14 items-center border-b border-[var(--color-border)] bg-[var(--color-bg)] px-4 md:gap-0 md:px-0">
      <!-- Logo: same width as sidebar (md:w-48), same left padding (md:pl-4) -->
      <div class="flex shrink-0 items-center gap-2 md:w-48 md:shrink-0 md:pl-4">
        <button
          type="button"
          onclick={() => (sidebarOpen = !sidebarOpen)}
          aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={sidebarOpen}
          class="-ml-1 inline-flex items-center justify-center rounded-[var(--radius-sm)] p-1.5 text-[var(--color-subtle)] hover:bg-[var(--color-surface)] md:hidden"
        >
          {#if sidebarOpen}<X size={18} strokeWidth={2} />{:else}<Menu size={18} strokeWidth={2} />{/if}
        </button>
        <a href="/" class="flex shrink-0 items-center gap-2 text-[var(--color-text)]">
          <span class="text-lg leading-none" aria-hidden="true">🚁</span>
          <span class="hidden text-xl font-bold tracking-[-0.04em] sm:inline">heli</span>
        </a>
      </div>
      <!-- SaveBar: same left padding as main content (md:pl-6) -->
      <div class="min-w-0 flex-1 md:pl-6">
        <SaveBar bind:this={saveBar} />
      </div>
      <div class="ml-auto flex items-center gap-0.5">
        <button
          type="button"
          onclick={() => (paletteOpen = true)}
          title="Search (⌘K)"
          aria-label="Search"
          class="hidden items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1.5 text-[var(--color-subtle)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)] sm:inline-flex"
        >
          <Search size={14} strokeWidth={2} />
          <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 font-sans text-[10px] leading-none text-[var(--color-subtle)]">⌘K</kbd>
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
        <span aria-hidden="true" class="mx-1 hidden h-4 w-px bg-[var(--color-border)] sm:inline-block"></span>
        <!-- Drop cached /api/* responses on the way out so the next person to
             sign in on this device can't be served the previous workspace's
             lists from the service worker. -->
        <form
          method="POST"
          action="/auth/logout"
          class="contents"
          onsubmit={() => {
            navigator.serviceWorker?.controller?.postMessage('PURGE_API');
            // Recents name this workspace's records; they must not outlive the
            // session on a shared machine.
            clearRecents();
          }}
        >
          <button
            type="submit"
            title="Sign out"
            aria-label="Sign out"
            class="group flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-transparent px-2 py-1.5 text-[var(--color-subtle)] transition-colors hover:border-[var(--color-border)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
          >
            <span class="hidden max-w-[8rem] truncate text-xs group-hover:text-[var(--color-text)] md:inline">{user.username ?? user.email}</span>
            <LogOut size={14} strokeWidth={2} />
          </button>
        </form>
      </div>
    </header>

    <!-- Mobile backdrop -->
    {#if sidebarOpen}
      <button
        type="button"
        aria-label="Close menu"
        onclick={() => (sidebarOpen = false)}
        class="fixed inset-0 top-14 z-30 bg-black/40 md:hidden"
      ></button>
    {/if}

    <!-- Sidebar: fixed below topbar, never moves. On mobile it slides in as a drawer. -->
    <aside
      class="fixed bottom-0 left-0 top-14 z-40 w-64 transform border-r border-[var(--color-border)] bg-[var(--color-bg)] p-4 transition-transform duration-200 ease-out md:w-48 md:border-r-0 md:px-4 md:py-4 md:translate-x-0 {sidebarOpen ? 'translate-x-0 shadow-[var(--shadow-lg)]' : '-translate-x-full md:translate-x-0'}"
      aria-label="Primary navigation"
    >
      <!-- Above the nav, and styled as a control rather than a link: it changes
           which workspace every link below points into. Renders nothing (divider
           included) unless the user belongs to more than one workspace. -->
      <WorkspaceSwitcher
        memberships={data.memberships ?? []}
        activeId={data.user?.workspaceId ?? ''}
      />
      <nav class="flex flex-col gap-0.5" data-sveltekit-preload-code="viewport">
        {#each tabs as tab (tab.href)}
          {@const active = tab.href === '/' ? page.url.pathname === '/' : page.url.pathname === tab.href || page.url.pathname.startsWith(tab.href + '/')}
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
        {#await data.reminders ?? []}
          <RemindersPopover items={[]} />
        {:then reminders}
          <RemindersPopover items={reminders ?? []} />
        {/await}
      </div>
      <div class="absolute bottom-3 left-4 right-4 text-[10px] text-[var(--color-subtle)]">
        <span title="Heli version">Version: {VERSION.replace(/^v/, '')}</span>
      </div>
    </aside>

    <!-- Main: offset past the sidebar on desktop. Scrolls independently. -->
    <main class="h-[calc(100vh-3.5rem)] overflow-y-auto px-4 py-6 md:ml-48 md:px-6 md:pr-8">
      {@render children()}
    </main>

  {:else if page.url.pathname === '/' || page.url.pathname.startsWith('/auth')}
    {@render children()}

  {:else}
    <!-- Unauthenticated, non-landing pages: bare header + content -->
    <header class="sticky top-0 z-50 flex h-14 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-4">
      <a href="/" class="flex shrink-0 items-center gap-2 text-[var(--color-text)]">
        <span class="text-lg leading-none" aria-hidden="true">🚁</span>
        <span class="hidden text-xl font-bold tracking-[-0.04em] sm:inline">heli</span>
      </a>
      <div class="ml-auto flex items-center gap-0.5">
        <ThemeToggle />
        <a
          href="/auth"
          class="rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--color-accent-hover)]"
        >Sign in</a>
      </div>
    </header>
    <main>{@render children()}</main>
  {/if}
</div>

{#if user}
  <CommandPalette bind:open={paletteOpen} onClose={() => (paletteOpen = false)} />
  <ShortcutHelp bind:open={helpOpen} onClose={() => (helpOpen = false)} />
{/if}
<Toaster />
<UpdateBanner />
