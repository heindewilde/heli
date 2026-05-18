<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { X } from 'lucide-svelte';
  import { untrack } from 'svelte';
  import AuthForm from './AuthForm.svelte';

  type Props = {
    open: boolean;
    initialMode?: 'login' | 'register';
    registrationDisabled?: boolean;
    multiRegion?: boolean;
  };
  let {
    open = $bindable(false),
    initialMode = 'login',
    registrationDisabled = false,
    multiRegion = false
  }: Props = $props();

  // Track the form's current mode so the heading stays in sync when the user
  // flips between sign-in and sign-up inside the form. Reset every time the
  // modal opens, so a fresh open from a different button starts where the
  // caller asked.
  let mode = $state<'login' | 'register'>(untrack(() => initialMode));
  $effect(() => {
    if (open) mode = initialMode;
  });

  let dialogEl = $state<HTMLDivElement | undefined>(undefined);
  let prevOverflow = '';

  $effect(() => {
    if (open) {
      prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      // Move focus into the dialog so Esc and Tab behave correctly.
      setTimeout(() => dialogEl?.focus(), 10);
    } else {
      document.body.style.overflow = prevOverflow;
    }
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      open = false;
    }
  }

  async function handleSuccess() {
    // Cookie is set server-side; refreshing the page data swaps the landing
    // for the logged-in dashboard. Close after, so the dashboard isn't
    // briefly covered by an empty modal.
    await invalidateAll();
    open = false;
  }

  const formData = $derived({
    next: '/',
    registrationDisabled,
    multiRegion
  });
</script>

{#if open}
  <div
    bind:this={dialogEl}
    role="dialog"
    aria-modal="true"
    aria-label={mode === 'login' ? 'Sign in' : 'Create account'}
    tabindex="-1"
    class="overlay"
    onclick={(e) => { if (e.target === e.currentTarget) open = false; }}
    onkeydown={onKey}
  >
    <div class="card">
      <button class="close-btn" type="button" aria-label="Close" onclick={() => (open = false)}>
        <X size={16} strokeWidth={2} />
      </button>

      <header class="card-head">
        <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
        <p class="subtitle">
          {#if mode === 'login'}
            Sign in to your CRM
          {:else}
            Start organizing your <span class="nowrap"><span class="handwrite">(net)</span>work</span>
          {/if}
        </p>
      </header>

      <AuthForm data={formData} bind:mode actionBase="/auth" onSuccess={handleSuccess} />
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem 1.25rem;
    background: rgba(15, 30, 50, 0.35);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    animation: fade-in 0.18s ease-out;
    overflow-y: auto;
  }

  :global([data-theme='dark']) .overlay {
    background: rgba(0, 6, 14, 0.55);
  }

  .card {
    position: relative;
    width: 100%;
    max-width: 30rem;
    background: rgba(255, 255, 255, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.7);
    border-radius: var(--radius-lg);
    padding: 2.25rem 2.25rem 2rem;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.6) inset,
      0 18px 50px -12px rgba(40, 60, 90, 0.35),
      0 4px 14px rgba(40, 60, 90, 0.12);
    backdrop-filter: blur(18px) saturate(140%);
    -webkit-backdrop-filter: blur(18px) saturate(140%);
    animation: rise 0.22s cubic-bezier(0.2, 0.7, 0.2, 1);
  }

  :global([data-theme='dark']) .card {
    background: rgba(20, 32, 50, 0.7);
    border-color: rgba(255, 255, 255, 0.1);
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.05) inset,
      0 18px 50px -12px rgba(0, 0, 0, 0.5);
  }

  .close-btn {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.875rem;
    height: 1.875rem;
    border-radius: var(--radius-md);
    background: transparent;
    border: 1px solid transparent;
    color: var(--color-muted);
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }

  .close-btn:hover {
    color: var(--color-text);
    background: rgba(255, 255, 255, 0.5);
    border-color: rgba(255, 255, 255, 0.6);
  }

  :global([data-theme='dark']) .close-btn:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.1);
  }

  .card-head {
    margin: 0 0 1.5rem;
    padding-right: 2rem;
  }

  h2 {
    margin: 0 0 0.375rem;
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: -0.025em;
    color: var(--color-text);
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

  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes rise {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .overlay, .card { animation: none; }
  }
</style>
