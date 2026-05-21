<script lang="ts">
  import { enhance } from '$app/forms';
  import { APP_NAME } from '$lib/branding';
  import Sky from '$lib/components/Sky.svelte';

  let { data, form } = $props();

  let submitting = $state(false);
  let selectedRegion = $state('eu');
  // svelte-ignore state_referenced_locally
  let username = $state((form as { username?: string } | null)?.username ?? '');

  const regionButtons = [
    { value: 'eu', emoji: '🇪🇺', label: 'EU' },
    { value: 'us', emoji: '🇺🇸', label: 'US' },
    { value: 'apac', emoji: '🇯🇵', label: 'APAC' }
  ];
</script>

<svelte:head>
  <title>Complete sign-up — {APP_NAME}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="auth-page">
  <Sky />

  <header class="nav">
    <a href="/" class="brand" aria-label="{APP_NAME} home">
      <span class="brand-mark" aria-hidden="true">🚁</span>
      <span class="brand-text">heli</span>
    </a>
  </header>

  <main class="main">
    <div class="card">
      <header class="card-head">
        <h1>One last step</h1>
        <p class="subtitle">Signing up as <strong>{data.email}</strong></p>
      </header>

      <form
        method="POST"
        use:enhance={() => {
          submitting = true;
          return async ({ update }) => {
            await update();
            submitting = false;
          };
        }}
      >
        <div class="field">
          <label for="cs-username">Username</label>
          <div class="input-prefix-wrap">
            <span class="input-prefix">@</span>
            <input
              id="cs-username"
              name="username"
              type="text"
              bind:value={username}
              placeholder="yourhandle"
              autocomplete="username"
              required
              minlength="1"
              maxlength="50"
              class="prefixed-input"
            />
          </div>
        </div>

        {#if data.multiRegion}
          <div class="field" role="group" aria-labelledby="cs-region-label">
            <span id="cs-region-label" class="group-label">Where should your data live?</span>
            <input type="hidden" name="region" value={selectedRegion} />
            <div class="region-group">
              {#each regionButtons as r}
                <button
                  type="button"
                  class="region-btn"
                  class:active={selectedRegion === r.value}
                  onclick={() => (selectedRegion = r.value)}
                >
                  <span>{r.emoji}</span>
                  <span>{r.label}</span>
                </button>
              {/each}
            </div>
            <p class="field-hint">You can export or delete your data any time.</p>
          </div>
        {/if}

        {#if form?.error}
          <div class="error-banner" role="alert">{form.error}</div>
        {/if}

        <button type="submit" class="btn-primary" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p class="switch-link">
        Want to use a different account? <a href="/auth">Sign in</a>
      </p>
    </div>
  </main>
</div>

<style>
  .auth-page {
    position: relative;
    min-height: 100vh;
    background: linear-gradient(to bottom, #b8d0e6 0%, #c7daea 30%, #d6e3ee 60%, #e3ecf3 100%);
    color: var(--color-text);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  :global([data-theme='dark']) .auth-page {
    background: linear-gradient(to bottom, #0b1626 0%, #111e2f 40%, #15243a 100%);
  }

  .nav {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
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

  .brand-mark { font-size: 1.125rem; line-height: 1; }
  .brand-text { font-size: 1.25rem; font-weight: 700; letter-spacing: -0.04em; }

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
    position: relative;
    width: 100%;
    max-width: 30rem;
    background: #fafbfd;
    border: 1px solid rgba(255, 255, 255, 0.85);
    border-radius: var(--radius-lg);
    padding: 2.25rem 2.25rem 2rem;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.7) inset,
      0 18px 50px -12px rgba(40, 60, 90, 0.3),
      0 4px 14px rgba(40, 60, 90, 0.1);
    animation: rise 0.22s cubic-bezier(0.2, 0.7, 0.2, 1);
  }

  @supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    .card {
      backdrop-filter: blur(30px) saturate(180%);
      -webkit-backdrop-filter: blur(30px) saturate(180%);
    }
  }

  @keyframes rise {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @media (prefers-reduced-motion: reduce) { .card { animation: none; } }

  :global([data-theme='dark']) .card {
    background: #182335;
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.06) inset, 0 18px 50px -12px rgba(0, 0, 0, 0.55);
  }

  .card-head { margin: 0 0 1.5rem; }

  h1 {
    margin: 0 0 0.375rem;
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: -0.025em;
    color: var(--color-text);
  }

  .subtitle {
    margin: 0;
    font-size: 0.875rem;
    color: var(--color-muted);
  }

  .subtitle strong { color: var(--color-text); font-weight: 500; }

  form { display: flex; flex-direction: column; }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin-bottom: 1rem;
  }

  label, .group-label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-text);
  }

  .input-prefix-wrap { display: flex; }

  .input-prefix {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    flex-shrink: 0;
    font-size: 1rem;
    color: var(--color-muted);
    background: rgba(255, 255, 255, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.7);
    border-right: none;
    border-radius: var(--radius-md) 0 0 var(--radius-md);
    user-select: none;
  }

  :global([data-theme='dark']) .input-prefix {
    background: rgba(20, 32, 50, 0.55);
    border-color: rgba(255, 255, 255, 0.1);
  }

  .prefixed-input {
    border: 1px solid rgba(255, 255, 255, 0.7);
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
    padding: 0.5625rem 0.75rem;
    font-size: 1rem;
    font-family: inherit;
    background: rgba(255, 255, 255, 0.6);
    color: var(--color-text);
    width: 100%;
    transition: border-color 0.15s, background 0.15s;
  }

  :global([data-theme='dark']) .prefixed-input {
    background: rgba(20, 32, 50, 0.55);
    border-color: rgba(255, 255, 255, 0.1);
  }

  .prefixed-input:focus {
    outline: none;
    border-color: var(--color-text);
    background: rgba(255, 255, 255, 0.85);
  }

  :global([data-theme='dark']) .prefixed-input:focus {
    background: rgba(20, 32, 50, 0.8);
    border-color: rgba(255, 255, 255, 0.4);
  }

  .prefixed-input::placeholder { color: var(--color-subtle); }

  .region-group {
    display: flex;
    border: 1px solid rgba(255, 255, 255, 0.7);
    border-radius: var(--radius-md);
    overflow: hidden;
    background: rgba(255, 255, 255, 0.4);
  }

  :global([data-theme='dark']) .region-group {
    background: rgba(20, 32, 50, 0.4);
    border-color: rgba(255, 255, 255, 0.1);
  }

  .region-btn {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    padding: 0.625rem 0.5rem;
    font-size: 0.875rem;
    font-family: inherit;
    font-weight: 500;
    background: transparent;
    color: var(--color-muted);
    border: none;
    border-right: 1px solid rgba(255, 255, 255, 0.55);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  :global([data-theme='dark']) .region-btn { border-right-color: rgba(255, 255, 255, 0.08); }
  .region-btn:last-child { border-right: none; }

  .region-btn.active { background: var(--color-text); color: var(--color-bg); }

  .region-btn:not(.active):hover {
    background: rgba(255, 255, 255, 0.55);
    color: var(--color-text);
  }

  :global([data-theme='dark']) .region-btn:not(.active):hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .field-hint { font-size: 0.75rem; color: var(--color-muted); margin: 0.25rem 0 0; }

  .error-banner {
    background: var(--color-danger-bg);
    border: 1px solid var(--color-danger-border);
    color: var(--color-danger);
    border-radius: var(--radius-md);
    padding: 0.625rem 0.875rem;
    font-size: 0.875rem;
    margin-bottom: 0.875rem;
  }

  .btn-primary {
    width: 100%;
    background: var(--color-text);
    color: var(--color-bg);
    border: none;
    border-radius: var(--radius-md);
    padding: 0.65rem 1rem;
    font-size: 0.9375rem;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    margin-top: 0.25rem;
    transition: opacity 0.15s;
  }

  .btn-primary:hover { opacity: 0.9; }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

  .switch-link {
    text-align: center;
    font-size: 0.875rem;
    color: var(--color-muted);
    margin: 1.125rem 0 0;
  }

  .switch-link a {
    color: var(--color-text);
    font-weight: 500;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  @media (max-width: 560px) {
    .nav { padding: 1rem 1.25rem; }
    .main { padding: 1.5rem 1.25rem 3rem; }
  }
</style>
