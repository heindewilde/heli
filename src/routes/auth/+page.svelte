<script lang="ts">
  import { APP_NAME } from '$lib/branding';
  import { Moon, Sun } from 'lucide-svelte';
  import { onMount } from 'svelte';
  import AuthForm from '$lib/components/AuthForm.svelte';
  import Sky from '$lib/components/Sky.svelte';
  import { untrack } from 'svelte';

  let { data, form } = $props();

  // The form lets users toggle between sign in and sign up without leaving
  // the page — heading + subtitle have to follow that, not the URL the page
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

  const heading = $derived(mode === 'register' ? 'Create your account' : 'Welcome back');
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
    <div class="card">
      <header class="card-head">
        <h1>{heading}</h1>
        <p class="subtitle">
          {#if mode === 'register'}
            Start organizing your <span class="nowrap"><span class="handwrite">(net)</span>work</span>
          {:else}
            Sign in to your CRM
          {/if}
        </p>
      </header>

      <AuthForm {data} {form} bind:mode />
    </div>
  </main>
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

  .card {
    width: 100%;
    max-width: 30rem;
    background: rgba(255, 255, 255, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.7);
    border-radius: var(--radius-lg);
    padding: 2.25rem 2.25rem 2rem;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.6) inset,
      0 18px 50px -12px rgba(40, 60, 90, 0.25),
      0 4px 14px rgba(40, 60, 90, 0.08);
    backdrop-filter: blur(18px) saturate(140%);
    -webkit-backdrop-filter: blur(18px) saturate(140%);
  }

  :global([data-theme='dark']) .card {
    background: rgba(20, 32, 50, 0.6);
    border-color: rgba(255, 255, 255, 0.1);
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.05) inset,
      0 18px 50px -12px rgba(0, 0, 0, 0.5);
  }

  .card-head {
    margin: 0 0 1.5rem;
  }

  h1 {
    margin: 0 0 0.375rem;
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: -0.025em;
  }

  .subtitle {
    margin: 0;
    color: var(--color-muted);
    font-size: 0.9375rem;
  }

  .nowrap {
    white-space: nowrap;
  }

  .handwrite {
    font-family: 'Patrick Hand', cursive;
    font-weight: 400;
    font-size: 1.18em;
    letter-spacing: 0;
    color: #4b6ea8;
    display: inline-block;
    transform: translateY(0.04em) rotate(-2deg);
    transform-origin: center;
    margin: 0 0.04em;
  }

  :global([data-theme='dark']) .handwrite {
    color: #a9c3ee;
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
