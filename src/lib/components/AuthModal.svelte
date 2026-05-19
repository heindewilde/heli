<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { X } from 'lucide-svelte';
  import { untrack } from 'svelte';
  import AuthCard from './AuthCard.svelte';

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

  // Reset the form's mode each time the modal opens, so a fresh open from a
  // different button starts where the caller asked.
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
    // Cookie is set server-side; refreshing page data swaps landing for the
    // logged-in dashboard. Close after, so the dashboard isn't briefly covered.
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
    <AuthCard
      data={formData}
      actionBase="/auth"
      onSuccess={handleSuccess}
      headingLevel="h2"
      bind:mode
    >
      <button class="close-btn" type="button" aria-label="Close" onclick={() => (open = false)}>
        <X size={16} strokeWidth={2} />
      </button>
    </AuthCard>
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
    background: rgba(199, 218, 234, 0.55);
    backdrop-filter: blur(4px) saturate(120%);
    -webkit-backdrop-filter: blur(4px) saturate(120%);
    animation: fade-in 0.18s ease-out;
    overflow-y: auto;
  }

  :global([data-theme='dark']) .overlay {
    background: rgba(17, 30, 47, 0.55);
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

  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @media (prefers-reduced-motion: reduce) {
    .overlay { animation: none; }
  }
</style>
