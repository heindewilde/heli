<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '$lib/ui/Button.svelte';
  import { copyText } from '$lib/client/clipboard';

  let { data } = $props();

  let code = $state('');
  let copied = $state(false);

  onMount(() => {
    // The fragment is the only place the code exists. Read it, then try to hand
    // it straight to the app — if the app is installed the OS has usually
    // already intercepted the link and this page never rendered at all, so this
    // is the fallback for the times it did not.
    const raw = new URLSearchParams(location.hash.slice(1)).get('c');
    if (raw) {
      code = raw;
      location.href = `heli://pair#c=${encodeURIComponent(raw)}`;
    }
  });

  async function copy() {
    // `copyText` reports 'rich' | 'plain-only' | 'failed' — outside a secure
    // context `navigator.clipboard` is undefined rather than rejecting, which is
    // exactly the plain-HTTP LAN self-host this page has to work on.
    copied = (await copyText(code)) !== 'failed';
    if (copied) setTimeout(() => (copied = false), 2000);
  }
</script>

<svelte:head>
  <title>Pair a device — {data.appName}</title>
  <!-- A pairing URL must never be indexed, and it carries a live credential. -->
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6">
  <a href="/" class="flex items-center gap-2 text-lg font-semibold" aria-label="{data.appName} home">
    <span aria-hidden="true">🚁</span>
    <span>heli</span>
  </a>

  {#if code}
    <div class="flex w-full flex-col items-center gap-4 text-center">
      <h1 class="text-xl font-semibold">Open this in the {data.appName} app</h1>
      <p class="text-sm text-[var(--color-muted)]">
        If the app is installed it should have opened already. If not, install it and enter this
        code on the sign-in screen.
      </p>

      <code
        class="w-full select-all rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3 text-center font-mono text-lg tracking-wider"
        >{code}</code
      >

      <div class="flex gap-2">
        <Button onclick={copy}>{copied ? 'Copied' : 'Copy code'}</Button>
        <Button variant="ghost" href={`heli://pair#c=${encodeURIComponent(code)}`}>
          Open the app
        </Button>
      </div>

      <p class="text-xs text-[var(--color-subtle)]">
        This code expires two minutes after it was shown and can be used once.
      </p>
    </div>
  {:else}
    <div class="flex flex-col items-center gap-3 text-center">
      <h1 class="text-xl font-semibold">Nothing to pair</h1>
      <p class="text-sm text-[var(--color-muted)]">
        Pairing codes are created in {data.appName} under Settings → Devices. Open that page on the
        computer you are signed in on, then scan the code it shows.
      </p>
      <Button href="/settings#devices">Go to Settings</Button>
    </div>
  {/if}
</main>
