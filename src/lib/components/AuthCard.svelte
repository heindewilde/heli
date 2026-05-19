<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import AuthForm from './AuthForm.svelte';

  type FormState = { email?: string; error?: string } | null | undefined;

  type Props = {
    data: {
      mode?: string;
      next?: string;
      registrationDisabled?: boolean;
      multiRegion?: boolean;
    };
    form?: FormState;
    actionBase?: string;
    onSuccess?: () => void;
    mode?: 'login' | 'register';
    /** h1 for the standalone /auth page, h2 when nested in landing modal. */
    headingLevel?: 'h1' | 'h2';
    /** Optional content rendered inside the card (e.g., modal close button). */
    children?: Snippet;
  };

  let {
    data,
    form,
    actionBase = '',
    onSuccess,
    mode = $bindable(
      untrack(() => (!data.registrationDisabled && data.mode === 'register' ? 'register' : 'login'))
    ),
    headingLevel = 'h1',
    children
  }: Props = $props();

  const heading = $derived(mode === 'register' ? 'Create your account' : 'Welcome back');
</script>

<div class="card">
  {@render children?.()}

  <header class="card-head" class:has-corner={!!children}>
    {#if headingLevel === 'h1'}
      <h1>{heading}</h1>
    {:else}
      <h2>{heading}</h2>
    {/if}
  </header>

  <AuthForm {data} {form} {actionBase} {onSuccess} bind:mode />
</div>

<style>
  .card {
    position: relative;
    width: 100%;
    max-width: 30rem;
    background: rgba(255, 255, 255, 0.78);
    border: 1px solid rgba(255, 255, 255, 0.85);
    border-radius: var(--radius-lg);
    padding: 2.25rem 2.25rem 2rem;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.7) inset,
      0 18px 50px -12px rgba(40, 60, 90, 0.3),
      0 4px 14px rgba(40, 60, 90, 0.1);
    backdrop-filter: blur(30px) saturate(180%);
    -webkit-backdrop-filter: blur(30px) saturate(180%);
    animation: rise 0.22s cubic-bezier(0.2, 0.7, 0.2, 1);
  }

  @keyframes rise {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .card { animation: none; }
  }

  :global([data-theme='dark']) .card {
    background: rgba(20, 32, 50, 0.72);
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.06) inset,
      0 18px 50px -12px rgba(0, 0, 0, 0.55);
  }

  .card-head {
    margin: 0 0 1.5rem;
  }

  .card-head.has-corner {
    padding-right: 2rem;
  }

  h1,
  h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: -0.025em;
    color: var(--color-text);
  }
</style>
