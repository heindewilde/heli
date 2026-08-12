<script lang="ts">
  import '../app.css';
  import Toaster from '$lib/components/Toaster.svelte';
  import SaveBar from '$lib/components/SaveBar.svelte';
  import WorkspaceSwitcher from '$lib/components/WorkspaceSwitcher.svelte';
  import CommandPalette from '$lib/components/CommandPalette.svelte';
  import ShortcutHelp from '$lib/components/ShortcutHelp.svelte';
  import RemindersPopover from '$lib/components/RemindersPopover.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import RunningTimer from '$lib/components/RunningTimer.svelte';
  import Tooltip from '$lib/ui/Tooltip.svelte';
  import UpdateBanner from '$lib/components/UpdateBanner.svelte';
  import { watchServiceWorker } from '$lib/client/sw.svelte';
  // `Timer` is aliased: the nav array's own entries are `{ icon }` and a bare
  // `Timer` next to `TimerBar`/`RunningTimer` reads as one of those components.
  import { LayoutDashboard, Users, Building2, MessagesSquare, Briefcase, Folder, Funnel, Send, CalendarRange, Timer as TimerIcon, LogOut, Search, HelpCircle, Settings, Menu, X } from 'lucide-svelte';
  import { page, navigating } from '$app/state';
  import Popover from '$lib/ui/Popover.svelte';
  import MenuItem from '$lib/ui/MenuItem.svelte';
  import Avatar from '$lib/ui/Avatar.svelte';
  import { EllipsisVertical } from 'lucide-svelte';
  import { onMount } from 'svelte';
  import { invalidate, invalidateAll, goto } from '$app/navigation';
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
    '/outreach': 'u',
    '/availability': 'a',
    '/time': 't'
  };

  const tabs = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/people', label: 'People', icon: Users },
    { href: '/companies', label: 'Companies', icon: Building2 },
    { href: '/interactions', label: 'Interactions', icon: MessagesSquare },
    { href: '/collections', label: 'Collections', icon: Folder },
    { href: '/pipelines', label: 'Pipelines', icon: Funnel },
    { href: '/projects', label: 'Projects', icon: Briefcase },
    { href: '/outreach', label: 'Outreach', icon: Send },
    { href: '/availability', label: 'Availability', icon: CalendarRange },
    { href: '/time', label: 'Time', icon: TimerIcon }
  ];

  /**
   * The same eight destinations, grouped. `tabs` stays flat because the command
   * registry and the `g <letter>` shortcuts index it by href and don't care
   * about presentation.
   *
   * Eight equally-weighted links with no grouping is a list, not a navigation —
   * nothing tells you that Collections and Pipelines are two ways of arranging
   * the same records while Interactions is a log of them. The labels are the
   * cheapest possible fix and the reference leans on them heavily.
   */
  const navSections: { label?: string; hrefs: string[] }[] = [
    { hrefs: ['/'] },
    { label: 'Records', hrefs: ['/people', '/companies', '/interactions'] },
    { label: 'Organise', hrefs: ['/collections', '/pipelines', '/projects'] },
    { label: 'Engage', hrefs: ['/outreach'] },
    { label: 'Plan', hrefs: ['/availability', '/time'] }
  ];
  const byHref = $derived(new Map(tabs.map((t) => [t.href, t])));

  function isActive(href: string, pathname: string) {
    return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');
  }

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
          // Start-or-stop rather than two commands: there is only ever one
          // timer, so the answer to ⌘K "timer" should be the thing you want
          // next, whichever that is.
          id: 'toggle-timer',
          title: 'Start or stop the timer',
          section: 'Create',
          icon: TimerIcon,
          keywords: ['track', 'time', 'clock', 'stop'],
          shortcut: 'n t',
          when: signedIn,
          run: async () => {
            const running = await Promise.resolve(data.runningEntry);
            await fetch(running ? '/api/time/stop' : '/api/time/start', { method: 'POST' });
            await invalidateAll();
          }
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
        // Navigate first, then refresh only the list that gained a row.
        //
        // This was `invalidateAll()` *before* the goto, which was both wasteful
        // and — once the list moved into a layout — wrong. Coming from another
        // section the layout mounts fresh and the pre-emptive invalidation is
        // pure cost; already on `/people`, the layout is reused and neither
        // `just` nor `params.id` is a tracked dependency, so the newly saved
        // person would never appear in the list at all.
        //
        // A create is the documented exception to trusting the local cache: it
        // moves the total and the tag counts, which no cache owns.
        await goto(path + (data.dedup ? '?dedup=1' : '?just=1'));
        await invalidate(data.kind === 'person' ? 'heli:people-list' : 'heli:companies-list');
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

    <!--
      Route-change feedback. `navigating` was unused, so every SSR navigation
      and every `invalidateAll()` produced a silent stall of a few hundred
      milliseconds with nothing on screen acknowledging the click.

      Indeterminate on purpose: there is no progress to report, only the fact
      that something is happening. It eases toward 90% and stops, so it never
      claims to be nearly done.
    -->
    {#if navigating.to}
      <div
        class="route-progress fixed inset-x-0 top-0 z-[var(--z-toast)] h-0.5 bg-[var(--color-interactive)]"
        role="presentation"
      ></div>
    {/if}

    <div class="flex h-screen">
      <!-- Mobile drawer backdrop -->
      {#if sidebarOpen}
        <button
          type="button"
          aria-label="Close menu"
          onclick={() => (sidebarOpen = false)}
          class="fixed inset-0 z-30 bg-black/40 md:hidden"
        ></button>
      {/if}

      <!--
        The sidebar sits directly on the page background with no border and no
        surface of its own. That is what makes the content read as a panel
        floating above the app rather than as one half of a split — the single
        biggest structural move in the reference, and it costs nothing but a
        gutter.
      -->
      <aside
        class="fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 transform flex-col gap-4 bg-[var(--color-bg)] p-3 transition-transform duration-200 ease-out md:static md:w-60 md:translate-x-0 {sidebarOpen
          ? 'translate-x-0 shadow-[var(--shadow-lg)] md:shadow-none'
          : '-translate-x-full md:translate-x-0'}"
        aria-label="Primary navigation"
      >
        <div class="flex items-center gap-1 px-1">
          <a href="/" class="flex min-w-0 shrink-0 items-center gap-2 text-[var(--color-text)]">
            <span class="text-lg leading-none" aria-hidden="true">🚁</span>
            <span class="text-xl font-bold tracking-[-0.04em]">heli</span>
          </a>
          <div class="ml-auto flex items-center gap-0.5">
            <!-- Renders nothing unless a timer is running, so it costs no space
                 on the pages that are not about time. -->
            {#await data.runningEntry ?? null then runningEntry}
              <RunningTimer entry={runningEntry} />
            {/await}
            <Tooltip label="Search (⌘K)">
              {#snippet trigger(attrs)}
                <button
                  {...attrs}
                  type="button"
                  onclick={() => (paletteOpen = true)}
                  aria-label="Search"
                  class="rounded-[var(--radius-md)] p-1.5 text-[var(--color-subtle)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
                ><Search size={15} strokeWidth={2} /></button>
              {/snippet}
            </Tooltip>
            <!-- `title=` replaced by Tooltip: the native one is ~500ms late,
                 unstyleable, and these are icon-only controls whose whole
                 discoverability rested on it. `aria-label` stays — the tooltip
                 describes, it does not name. -->
            <Tooltip label="Keyboard shortcuts (?)">
              {#snippet trigger(attrs)}
                <button
                  {...attrs}
                  type="button"
                  onclick={() => (helpOpen = true)}
                  aria-label="Keyboard shortcuts"
                  class="hidden rounded-[var(--radius-md)] p-1.5 text-[var(--color-subtle)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] sm:inline-flex"
                ><HelpCircle size={15} strokeWidth={2} /></button>
              {/snippet}
            </Tooltip>
            <ThemeToggle />
            <button
              type="button"
              onclick={() => (sidebarOpen = false)}
              aria-label="Close menu"
              class="rounded-[var(--radius-md)] p-1.5 text-[var(--color-subtle)] hover:bg-[var(--color-surface)] md:hidden"
            ><X size={16} strokeWidth={2} /></button>
          </div>
        </div>

        <!-- Above the nav, and styled as a control rather than a link: it changes
             which workspace every link below points into. Renders nothing (divider
             included) unless the user belongs to more than one workspace. -->
        <WorkspaceSwitcher
          memberships={data.memberships ?? []}
          activeId={data.user?.workspaceId ?? ''}
        />

        <!-- Demoted from the centre of the topbar, where it occupied the most
             valuable strip in the app to serve one action. Paste-to-save already
             works anywhere via the window paste listener, so this input is the
             discoverable affordance for it, not the mechanism. -->
        <SaveBar bind:this={saveBar} placeholder="Paste a link to save…" />

        <nav
          class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto"
          data-sveltekit-preload-code="viewport"
        >
          {#each navSections as section (section.label ?? 'top')}
            <div class="flex flex-col gap-0.5">
              {#if section.label}
                <p class="cap-label px-2.5 pb-1">{section.label}</p>
              {/if}
              {#each section.hrefs as href (href)}
                {@const tab = byHref.get(href)}
                {@const active = isActive(href, page.url.pathname)}
                {#if tab}
                  <a
                    {href}
                    aria-current={active ? 'page' : undefined}
                    class="group flex items-center gap-2.5 rounded-[var(--radius-md)] border px-2.5 py-1.5 text-sm transition-colors {active
                      ? 'border-[var(--color-interactive-ring)] bg-[var(--color-surface)] font-semibold text-[var(--color-text)] shadow-xs'
                      : 'border-transparent text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]'}"
                  >
                    <tab.icon
                      size={16}
                      strokeWidth={active ? 2.25 : 2}
                      class={active
                        ? 'text-[var(--color-interactive)]'
                        : 'text-[var(--color-subtle)] group-hover:text-[var(--color-muted)]'}
                    />
                    <span class="min-w-0 truncate">{tab.label}</span>
                  </a>
                {/if}
              {/each}
            </div>
          {/each}
        </nav>

        <div class="flex flex-col gap-1 border-t border-[var(--color-border)] pt-3">
          {#await data.reminders ?? []}
            <RemindersPopover items={[]} />
          {:then reminders}
            <RemindersPopover items={reminders ?? []} />
          {/await}

          <!-- Identity was a bare sign-out button in the topbar, so the only
               thing you could do with your own account was leave it. -->
          <Popover label="Account" placement="top-start" panelRole="menu">
            {#snippet trigger(attrs)}
              <button
                {...attrs}
                type="button"
                class="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-1.5 py-1.5 text-left transition-colors hover:bg-[var(--color-surface)]"
              >
                <Avatar name={user.username ?? user.email} size="sm" />
                <span class="min-w-0 flex-1 truncate text-xs text-[var(--color-text)]"
                  >{user.username ?? user.email}</span
                >
                <EllipsisVertical size={14} strokeWidth={2} class="shrink-0 text-[var(--color-subtle)]" />
              </button>
            {/snippet}
            {#snippet content({ close })}
              <div class="w-56 p-1">
                <MenuItem href="/settings" onclick={close}>
                  {#snippet icon()}<Settings size={14} strokeWidth={2} />{/snippet}
                  Settings
                </MenuItem>
                <div class="my-1 h-px bg-[var(--color-border)]"></div>
                <!-- Drop cached /api/* responses on the way out so the next person
                     to sign in on this device can't be served the previous
                     workspace's lists from the service worker. -->
                <form
                  method="POST"
                  action="/auth/logout"
                  onsubmit={() => {
                    navigator.serviceWorker?.controller?.postMessage('PURGE_API');
                    // Recents name this workspace's records; they must not
                    // outlive the session on a shared machine.
                    clearRecents();
                  }}
                >
                  <button
                    type="submit"
                    class="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-xs text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)]"
                  >
                    <span class="flex size-4 shrink-0 items-center justify-center text-[var(--color-subtle)]">
                      <LogOut size={14} strokeWidth={2} />
                    </span>
                    <span class="min-w-0 flex-1 truncate">Sign out</span>
                  </button>
                </form>
                <p class="px-2 pt-2 pb-1 text-2xs text-[var(--color-subtle)]">
                  Version {VERSION.replace(/^v/, '')}
                </p>
              </div>
            {/snippet}
          </Popover>
        </div>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col md:py-3 md:pr-3">
        <!-- Mobile-only strip. The hamburger lived in the topbar that this
             layout no longer has, and the drawer needs a way in. -->
        <div class="flex h-12 shrink-0 items-center gap-2 px-3 md:hidden">
          <button
            type="button"
            onclick={() => (sidebarOpen = true)}
            aria-label="Open menu"
            aria-expanded={sidebarOpen}
            class="-ml-1 rounded-[var(--radius-md)] p-1.5 text-[var(--color-subtle)] hover:bg-[var(--color-surface)]"
          ><Menu size={18} strokeWidth={2} /></button>
          <a href="/" class="flex items-center gap-2 text-[var(--color-text)]">
            <span class="text-base leading-none" aria-hidden="true">🚁</span>
            <span class="text-lg font-bold tracking-[-0.04em]">heli</span>
          </a>
          <button
            type="button"
            onclick={() => (paletteOpen = true)}
            aria-label="Search"
            class="ml-auto rounded-[var(--radius-md)] p-1.5 text-[var(--color-subtle)] hover:bg-[var(--color-surface)]"
          ><Search size={17} strokeWidth={2} /></button>
        </div>

        <!--
          The panel. Square and borderless on mobile, where a rounded card
          inside a 390px viewport just wastes both edges.
        -->
        <main
          class="min-h-0 flex-1 overflow-y-auto border-[var(--color-border)] bg-[var(--color-surface)] md:rounded-[var(--radius-xl)] md:border md:shadow-panel"
        >
          <!-- A max-width at last. Without one, `/pipelines` rendered a single
               40px row inside a 1300px card and the people table spread five
               mostly-empty columns across the full screen. -->
          <div class="mx-auto w-full max-w-[1600px] px-4 py-6 md:px-8 md:py-8">
            {@render children()}
          </div>
        </main>
      </div>
    </div>

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

<!--
  Statically imported, deliberately.

  Lazy-loading these behind their open flags saved ~3 KB gzipped from the app
  shell and cost a feature: page-scoped commands. `people/[id]` and friends
  register "This page" commands in `onMount`, and a palette that mounts only
  when it opens does not pick them up — ⌘K showed Navigate/Workspace/Create and
  nothing for the record you were looking at. Verified in a production build.
-->
{#if user}
  <CommandPalette bind:open={paletteOpen} onClose={() => (paletteOpen = false)} />
  <ShortcutHelp bind:open={helpOpen} onClose={() => (helpOpen = false)} />
{/if}
<Toaster />
<UpdateBanner />

<style>
  /*
   * Indeterminate progress. Eases out toward 90% over ~2s and holds there —
   * the bar is unmounted the moment navigation finishes, so it never needs to
   * reach 100%, and never claims to know how long is left.
   *
   * `transform` rather than `width` so it composites rather than triggering
   * layout on every frame of a navigation that is already busy. The global
   * reduced-motion rule collapses this to a near-instant full bar, which is
   * the right degradation: still visible, no travel.
   */
  .route-progress {
    transform-origin: 0 50%;
    animation: route-progress 2s var(--ease-out) forwards;
  }
  @keyframes route-progress {
    from {
      transform: scaleX(0.02);
    }
    to {
      transform: scaleX(0.9);
    }
  }
</style>
