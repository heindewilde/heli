<script lang="ts">
  import '../app.css';
  import { APP_NAME } from '$lib/branding';
  import Toaster from '$lib/components/Toaster.svelte';
  import SaveBar from '$lib/components/SaveBar.svelte';
  import { Users, Building2, MessagesSquare, LogOut } from 'lucide-svelte';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { bindKeys } from '$lib/keyboard.svelte';

  let { data, children } = $props();
  const user = $derived(data.user);

  let saveBar = $state<SaveBar | undefined>(undefined);

  const tabs = [
    { href: '/people', label: 'People', icon: Users },
    { href: '/companies', label: 'Companies', icon: Building2 },
    { href: '/interactions', label: 'Interactions', icon: MessagesSquare }
  ];

  onMount(() => {
    return bindKeys((e) => {
      if (!user) return;
      if (e.key === '/') {
        const search = document.querySelector<HTMLInputElement>('[data-search-input]');
        if (search) {
          search.focus();
          search.select?.();
          return true;
        }
      }
    });
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
      </aside>
      <main class="flex-1 min-w-0">{@render children()}</main>
    </div>
  {:else}
    <main>{@render children()}</main>
  {/if}
</div>

<Toaster />
