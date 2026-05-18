<script lang="ts">
  import { enhance } from '$app/forms';
  import { untrack } from 'svelte';

  // Loose shapes — the auth page passes a richer object than the modal does,
  // so we only pin down the fields this component actually touches.
  type FormState = { email?: string; error?: string } | null | undefined;

  type Props = {
    /** Result of /auth load. Extra fields are tolerated. */
    data: {
      mode?: string;
      next?: string;
      registrationDisabled?: boolean;
      multiRegion?: boolean;
    };
    /** Last form action result (errors, sticky email). Optional. */
    form?: FormState;
    /** Where to POST. Defaults to current route; modal version passes "/auth". */
    actionBase?: string;
    /** Called on successful submit so modal can close & invalidate. */
    onSuccess?: () => void;
    /**
     * Two-way bound so the parent can render heading copy that matches the
     * form's current mode (the user can toggle inside the form).
     */
    mode?: 'login' | 'register';
  };

  let {
    data,
    form,
    actionBase = '',
    onSuccess,
    mode = $bindable(
      untrack(() => (!data.registrationDisabled && data.mode === 'register' ? 'register' : 'login'))
    )
  }: Props = $props();

  $effect(() => {
    if (data.registrationDisabled && mode === 'register') mode = 'login';
  });

  let submitting = $state(false);
  let selectedRegion = $state('eu');

  const regionButtons = [
    { value: 'eu', emoji: '🇪🇺', label: 'EU' },
    { value: 'us', emoji: '🇺🇸', label: 'US' },
    { value: 'apac', emoji: '🇯🇵', label: 'APAC' }
  ];
</script>

<form
  method="POST"
  action="{actionBase}?/{mode}"
  use:enhance={() => {
    submitting = true;
    return async ({ result, update }) => {
      // For redirects (success), let SvelteKit follow; also notify caller so
      // modal can close & invalidate. For failures, render the validation
      // errors but stay on the page.
      await update();
      submitting = false;
      if (result.type === 'redirect') onSuccess?.();
    };
  }}
>
  <input type="hidden" name="next" value={data.next ?? '/'} />

  {#if mode === 'register'}
    <div class="field">
      <label for="af-username">Username</label>
      <div class="input-prefix-wrap">
        <span class="input-prefix">@</span>
        <input
          id="af-username"
          name="username"
          type="text"
          placeholder="yourhandle"
          autocomplete="username"
          required
          minlength="1"
          maxlength="50"
          class="prefixed-input"
        />
      </div>
    </div>
  {/if}

  <div class="field">
    <label for="af-email">Email</label>
    <input
      id="af-email"
      name="email"
      type="email"
      placeholder="you@example.com"
      required
      autocomplete="email"
      value={form?.email ?? ''}
    />
  </div>

  <div class="field">
    <div class="label-row">
      <label for="af-password">Password</label>
      {#if mode === 'login'}
        <a href="/auth/forgot-password" class="forgot-link">Forgot password?</a>
      {/if}
    </div>
    <input
      id="af-password"
      name="password"
      type="password"
      placeholder="••••••••"
      required
      minlength="8"
      maxlength="72"
      autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
    />
  </div>

  {#if mode === 'register' && data.multiRegion}
    <div class="field" role="group" aria-labelledby="af-region-label">
      <span id="af-region-label" class="group-label">Choose where your data is stored</span>
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
    {submitting ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
  </button>
</form>

{#if !data.registrationDisabled}
  <p class="toggle">
    {#if mode === 'login'}
      No account? <button type="button" onclick={() => (mode = 'register')}>Create one</button>
    {:else}
      Already have an account? <button type="button" onclick={() => (mode = 'login')}>Sign in</button>
    {/if}
  </p>
{:else}
  <p class="toggle">Registration is disabled on this instance.</p>
{/if}

<style>
  form {
    display: flex;
    flex-direction: column;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin-bottom: 1rem;
  }

  label,
  .group-label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-text);
  }

  .label-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .forgot-link {
    font-size: 0.8125rem;
    color: var(--color-muted);
    text-decoration: none;
    transition: color 0.15s;
  }

  .forgot-link:hover {
    color: var(--color-text);
  }

  input[type='text'],
  input[type='email'],
  input[type='password'] {
    border: 1px solid rgba(255, 255, 255, 0.7);
    border-radius: var(--radius-md);
    padding: 0.5625rem 0.75rem;
    font-size: 1rem;
    font-family: inherit;
    background: rgba(255, 255, 255, 0.6);
    color: var(--color-text);
    transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
    width: 100%;
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.4) inset;
  }

  :global([data-theme='dark']) input[type='text'],
  :global([data-theme='dark']) input[type='email'],
  :global([data-theme='dark']) input[type='password'] {
    background: rgba(20, 32, 50, 0.55);
    border-color: rgba(255, 255, 255, 0.1);
    box-shadow: none;
  }

  input:focus {
    outline: none;
    border-color: var(--color-text);
    background: rgba(255, 255, 255, 0.85);
  }

  :global([data-theme='dark']) input:focus {
    background: rgba(20, 32, 50, 0.8);
    border-color: rgba(255, 255, 255, 0.4);
  }

  input::placeholder {
    color: var(--color-subtle);
  }

  /* @ prefix input */
  .input-prefix-wrap {
    display: flex;
  }

  .input-prefix {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    flex-shrink: 0;
    font-size: 1rem;
    line-height: 1;
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
    border-radius: 0 var(--radius-md) var(--radius-md) 0 !important;
  }

  /* Region picker */
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

  :global([data-theme='dark']) .region-btn {
    border-right-color: rgba(255, 255, 255, 0.08);
  }

  .region-btn:last-child {
    border-right: none;
  }

  .region-btn.active {
    background: var(--color-text);
    color: var(--color-bg);
  }

  .region-btn:not(.active):hover {
    background: rgba(255, 255, 255, 0.55);
    color: var(--color-text);
  }

  :global([data-theme='dark']) .region-btn:not(.active):hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .field-hint {
    font-size: 0.75rem;
    color: var(--color-muted);
    margin: 0.25rem 0 0;
  }

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
    transition: opacity 0.15s, transform 0.05s;
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  .btn-primary:active {
    transform: translateY(1px);
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .toggle {
    text-align: center;
    font-size: 0.875rem;
    color: var(--color-muted);
    margin: 1.125rem 0 0;
  }

  .toggle button {
    background: none;
    border: none;
    color: var(--color-text);
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
</style>
