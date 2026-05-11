<script lang="ts">
  import { Sun, Moon } from 'lucide-svelte';
  import { onMount } from 'svelte';

  let theme = $state<'light' | 'dark'>('light');

  onMount(() => {
    // app.html sets the initial value before hydration; read it back so the
    // button reflects what's actually on <html>.
    theme = (document.documentElement.dataset.theme as 'light' | 'dark') ?? 'light';
  });

  function toggle() {
    theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('theme', theme);
    } catch {
      // ignore storage failures (private mode, etc.); the visual state still flips.
    }
  }
</script>

<button
  type="button"
  onclick={toggle}
  title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
  aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
  class="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-subtle)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
>
  {#if theme === 'dark'}
    <Sun size={14} strokeWidth={2} />
  {:else}
    <Moon size={14} strokeWidth={2} />
  {/if}
</button>
