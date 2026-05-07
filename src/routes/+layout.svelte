<script lang="ts">
  import '../app.css';
  import { APP_NAME } from '$lib/branding';
  import Toaster from '$lib/components/Toaster.svelte';
  import SaveBar from '$lib/components/SaveBar.svelte';
  import CommandPalette from '$lib/components/CommandPalette.svelte';
  import ShortcutHelp from '$lib/components/ShortcutHelp.svelte';
  import RemindersPopover from '$lib/components/RemindersPopover.svelte';
  import { Users, Building2, MessagesSquare, LogOut, Search, HelpCircle } from 'lucide-svelte';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { bindKeys, isTypingTarget } from '$lib/keyboard.svelte';

  let { data, children } = $props();
  const user = $derived(data.user);
  const reminders = $derived(data.reminders ?? []);

  let saveBar = $state<SaveBar | undefined>(undefined);
  let paletteOpen = $state(false);
  let helpOpen = $state(false);

  const tabs = [
    { href: '/people', label: 'People', icon: Users },
    { href: '/companies', label: 'Companies', icon: Building2 },
    { href: '/interactions', label: 'Interactions', icon: MessagesSquare }
  ];

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
    // ignore inputs to avoid hijacking text entry.
    const onPlainKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (e.key === '?') {
        e.preventDefault();
        paletteOpen = false;
        helpOpen = !helpOpen;
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

    return () => cleanups.forEach((c) => c());
  });
</script>

<div class="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
  <header class="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-4">
    <a href="/" class="flex items-center gap-2 font-semibold tracking-tight">
      <span class="inline-block h-6 w-6 rounded-[var(--radius-sm)] bg-[var(--color-product)]"></span>
      <span class="hidden sm:inline">{APP_NAME}</span>
    </a>
    {#if user}
      <div class="ml-2 flex-1">
        <SaveBar bind:this={saveBar} />
      </div>
    {/if}
    <div class="ml-auto flex items-center gap-3">
      {#if user}
        <button
          type="button"
          onclick={() => (paletteOpen = true)}
          title="Search (cmd+K)"
          class="hidden items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-muted)] hover:bg-[var(--color-surface)] sm:inline-flex"
        >
          <Search size={12} strokeWidth={2} />
          <kbd class="rounded bg-[var(--color-bg)] px-1 text-[10px]">⌘K</kbd>
        </button>
        <button
          type="button"
          onclick={() => (helpOpen = true)}
          title="Keyboard shortcuts (?)"
          class="hidden rounded-[var(--radius-sm)] p-1.5 text-[var(--color-subtle)] hover:bg-[var(--color-surface)] sm:inline-flex"
        ><HelpCircle size={14} strokeWidth={2} /></button>
        <span class="text-sm text-[var(--color-muted)]">{user.username ?? user.email}</span>
        <form method="POST" action="/auth/logout" class="contents">
          <button
            type="submit"
            class="flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1 text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
          >
            <LogOut size={14} strokeWidth={2} />
            <span>Sign out</span>
          </button>
        </form>
      {:else}
        <a
          href="/auth"
          class="rounded-[var(--radius-sm)] bg-[var(--color-product)] px-3 py-1.5 text-sm font-medium text-white"
        >Sign in</a>
      {/if}
    </div>
  </header>

  {#if user}
    <div class="mx-auto flex w-full max-w-6xl gap-6 px-4 py-6">
      <aside class="w-48 shrink-0">
        <nav class="flex flex-col gap-1">
          {#each tabs as tab (tab.href)}
            {@const active = page.url.pathname === tab.href || page.url.pathname.startsWith(tab.href + '/')}
            <a
              href={tab.href}
              class="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm {active
                ? 'bg-[var(--color-surface)] text-[var(--color-text)]'
                : 'text-[var(--color-muted)] hover:bg-[var(--color-surface)]'}"
            >
              <tab.icon size={14} strokeWidth={2} />
              <span>{tab.label}</span>
            </a>
          {/each}
        </nav>
        <div class="mt-4 border-t border-[var(--color-border)] pt-3">
          <RemindersPopover items={reminders} />
        </div>
      </aside>
      <main class="flex-1 min-w-0">{@render children()}</main>
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
