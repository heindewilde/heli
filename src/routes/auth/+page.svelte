<script lang="ts">
  import { APP_NAME } from '$lib/branding';
  import { Moon, Sun } from 'lucide-svelte';
  import { onMount } from 'svelte';
  import AuthCard from '$lib/components/AuthCard.svelte';
  import Sky from '$lib/components/Sky.svelte';
  import { untrack } from 'svelte';

  let { data, form } = $props();

  // The form lets users toggle between sign in and sign up without leaving
  // the page — heading + tab title have to follow that, not the URL the page
  // was loaded with.
  let mode = $state<'login' | 'register'>(
    untrack(() => (!data.registrationDisabled && data.mode === 'register' ? 'register' : 'login'))
  );

  let isDark = $state(false);
  onMount(() => {
    isDark = document.documentElement.dataset.theme === 'dark';
  });

  function toggleDark() {
    isDark = !isDark;
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    try {
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    } catch {}
  }
</script>

<svelte:head>
  <title>{mode === 'register' ? 'Create account' : 'Sign in'} — {APP_NAME}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="auth-page">
  <Sky />

  <header class="nav">
    <a href="/" class="brand" aria-label="Heli home">
      <span class="brand-mark" aria-hidden="true">🚁</span>
      <span class="brand-text">heli</span>
    </a>
    <button class="icon-btn" onclick={toggleDark} aria-label="Toggle theme">
      {#if isDark}
        <Sun size={16} strokeWidth={2} />
      {:else}
        <Moon size={16} strokeWidth={2} />
      {/if}
    </button>
  </header>

  <main class="main">
    <AuthCard {data} {form} headingLevel="h1" bind:mode />
  </main>
  <footer class="auth-footer">
    <a href="/privacy">Privacy Policy</a>
    <span aria-hidden="true">·</span>
    <a href="/terms">Terms of Service</a>
  </footer>
</div>

<style>
  .auth-page {
    position: relative;
    min-height: 100vh;
    background:
      linear-gradient(
        to bottom,
        #b8d0e6 0%,
        #c7daea 30%,
        #d6e3ee 60%,
        #e3ecf3 100%
      );
    color: var(--color-text);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  :global([data-theme='dark']) .auth-page {
    background:
      linear-gradient(
        to bottom,
        #0b1626 0%,
        #111e2f 40%,
        #15243a 100%
      );
  }

  .nav {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 2rem;
    max-width: 1200px;
    width: 100%;
    margin: 0 auto;
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    text-decoration: none;
    color: var(--color-text);
  }

  .brand-mark {
    font-size: 1.125rem;
    line-height: 1;
  }

  .brand-text {
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: -0.04em;
  }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: var(--radius-md);
    border: 1px solid transparent;
    background: transparent;
    color: var(--color-muted);
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }

  .icon-btn:hover {
    background: rgba(255, 255, 255, 0.5);
    border-color: rgba(255, 255, 255, 0.6);
    color: var(--color-text);
  }

  :global([data-theme='dark']) .icon-btn:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.1);
  }

  .main {
    position: relative;
    z-index: 1;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem 1.25rem 3rem;
  }

  .auth-footer {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 1rem 1.25rem 2rem;
    font-size: 0.8125rem;
    color: var(--color-muted);
  }

  .auth-footer a {
    color: var(--color-muted);
    text-decoration: none;
    transition: color 0.15s;
  }

  .auth-footer a:hover {
    color: var(--color-text);
  }

  @media (max-width: 560px) {
    .nav {
      padding: 1rem 1.25rem;
    }
    .main {
      padding: 1.5rem 1.25rem 3rem;
    }
  }
</style>
