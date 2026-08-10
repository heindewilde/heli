<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { X } from 'lucide-svelte';
  import { untrack } from 'svelte';
  import AuthCard from './AuthCard.svelte';
  import Dialog from '$lib/ui/Dialog.svelte';

  type Props = {
    open: boolean;
    initialMode?: 'login' | 'register';
    registrationDisabled?: boolean;
    multiRegion?: boolean;
    googleAuthEnabled?: boolean;
  };
  let {
    open = $bindable(false),
    initialMode = 'login',
    registrationDisabled = false,
    multiRegion = false,
    googleAuthEnabled = false
  }: Props = $props();

  // Reset the form's mode each time the modal opens, so a fresh open from a
  // different button starts where the caller asked.
  let mode = $state<'login' | 'register'>(untrack(() => initialMode));
  $effect(() => {
    if (open) mode = initialMode;
  });

  async function handleSuccess() {
    // Cookie is set server-side; refreshing page data swaps landing for the
    // logged-in dashboard. Close after, so the dashboard isn't briefly covered.
    await invalidateAll();
    open = false;
  }

  const formData = $derived({
    next: '/',
    registrationDisabled,
    multiRegion,
    googleAuthEnabled
  });
</script>

<Dialog
  {open}
  onclose={() => (open = false)}
  label={mode === 'login' ? 'Sign in' : 'Create account'}
  chrome={false}
  backdropClass="overlay-wash"
  panelClass="max-w-none w-auto"
>
  {#snippet children({ close })}
    <AuthCard data={formData} actionBase="/auth" onSuccess={handleSuccess} headingLevel="h2" bind:mode>
      <button class="close-btn" type="button" aria-label="Close" onclick={close}>
        <X size={16} strokeWidth={2} />
      </button>
    </AuthCard>
  {/snippet}
</Dialog>

<style>
  /* The scrim is rendered by Dialog, so the class has to cross the component
     boundary — hence :global. Everything positional (fixed, inset, z-index)
     comes from Dialog; this only supplies the wash. */
  :global(.overlay-wash) {
    background: rgba(199, 218, 234, 0.88);
    animation: fade-in 0.18s ease-out;
  }

  :global([data-theme='dark'] .overlay-wash) {
    background: rgba(17, 30, 47, 0.88);
  }

  @supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    :global(.overlay-wash) {
      backdrop-filter: blur(4px) saturate(120%);
      -webkit-backdrop-filter: blur(4px) saturate(120%);
    }
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
    :global(.overlay-wash) { animation: none; }
  }
</style>
