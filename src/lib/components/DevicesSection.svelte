<script lang="ts">
  import Smartphone from 'lucide-svelte/icons/smartphone';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Bell from 'lucide-svelte/icons/bell';
  import Button from '$lib/ui/Button.svelte';
  import Spinner from '$lib/ui/Spinner.svelte';
  import { toast } from '$lib/toasts.svelte';

  type Device = {
    id: string;
    name: string;
    platform: string;
    appVersion: string | null;
    pushEnabled: boolean;
    lastUsedAt: number | null;
    createdAt: number;
  };

  type Pairing = { code: string; expiresAt: number; url: string; qr: boolean[][] };

  let { devices: initial = [] as Device[] } = $props();

  // Owned locally so pairing and revoking update it directly rather than
  // invalidating — the same "trust the local cache" rule the list pages follow.
  // svelte-ignore state_referenced_locally
  let devices = $state<Device[]>([...initial]);

  // ...and re-seeded whenever the server sends a newer list, mirroring
  // `cache.hydrate(data.items)` on /people. Without this the section keeps
  // whatever it fetched at mount: navigate back to Settings after a device
  // registers for notifications elsewhere and it still reads "never used".
  $effect(() => {
    devices = [...initial];
  });
  let pairing = $state<Pairing | null>(null);
  let starting = $state(false);
  let now = $state(Date.now());

  const secondsLeft = $derived(
    pairing ? Math.max(0, Math.ceil((pairing.expiresAt - now) / 1000)) : 0
  );

  /**
   * One interval drives both the countdown and the poll.
   *
   * The countdown needs a tick a second; the poll only needs one every two, and
   * asking the server twice as often as that is pure noise on a screen someone
   * is looking at for under two minutes.
   */
  $effect(() => {
    if (!pairing) return;
    let ticks = 0;
    const id = setInterval(async () => {
      now = Date.now();
      ticks++;
      if (secondsLeft <= 0) {
        pairing = null;
        return;
      }
      if (ticks % 2 !== 0) return;
      const res = await fetch(`/api/v1/pairing/${encodeURIComponent(pairing!.code)}`);
      if (!res.ok) return;
      const { data } = await res.json();
      if (data.status === 'claimed') {
        pairing = null;
        toast.success(`Paired with ${data.device?.name ?? 'your device'}`);
        await refresh();
      } else if (data.status === 'expired') {
        pairing = null;
      }
    }, 1000);
    return () => clearInterval(id);
  });

  async function refresh() {
    const res = await fetch('/api/v1/devices');
    if (res.ok) devices = (await res.json()).data;
  }

  async function startPairing() {
    starting = true;
    try {
      const res = await fetch('/api/v1/pairing', { method: 'POST' });
      if (!res.ok) {
        toast.danger('Could not start pairing. Try again in a moment.');
        return;
      }
      pairing = (await res.json()).data;
      now = Date.now();
    } finally {
      starting = false;
    }
  }

  async function revoke(d: Device) {
    if (!confirm(`Sign ${d.name} out? It will need pairing again to reconnect.`)) return;
    const res = await fetch(`/api/v1/devices/${d.id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.danger('Could not sign that device out.');
      return;
    }
    devices = devices.filter((x) => x.id !== d.id);
    toast.success(`${d.name} signed out`);
  }

  function lastSeen(ts: number | null): string {
    if (!ts) return 'never used';
    const mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 60) return mins <= 1 ? 'just now' : `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  // Grouped for legibility when it has to be typed rather than scanned.
  const grouped = $derived(
    pairing ? pairing.code.replace(/^([a-z]+)-(.{5})(.{5})$/, '$1-$2-$3') : ''
  );
</script>

<section
  id="devices"
  style="scroll-margin-top:1rem"
  class="flex flex-col gap-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
>
  <div class="flex flex-col gap-1">
    <h2 class="text-base font-semibold">Devices</h2>
    <p class="text-sm text-[var(--color-muted)]">
      The Heli app for iPhone and Android. Pairing signs a device in without typing a password,
      and a paired device follows you into every workspace you belong to.
    </p>
  </div>

  {#if pairing}
    <div
      class="flex flex-col items-center gap-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 sm:flex-row sm:items-start"
    >
      <!--
        Rendered as rects rather than an image or {@html}: the matrix arrives as
        a boolean grid from the server, so there is no markup to sanitize and no
        encoder in the client bundle.
        Always on white — a dark-mode inversion is a code most scanners refuse.
      -->
      <svg
        viewBox="0 0 {pairing.qr.length + 8} {pairing.qr.length + 8}"
        class="h-44 w-44 shrink-0 rounded-[var(--radius-sm)] bg-white p-1"
        role="img"
        aria-label="QR code for pairing a device"
      >
        {#each pairing.qr as row, r (r)}
          {#each row as on, c (c)}
            {#if on}
              <rect x={c + 4} y={r + 4} width="1" height="1" fill="#15161a" />
            {/if}
          {/each}
        {/each}
      </svg>

      <div class="flex min-w-0 flex-1 flex-col gap-3">
        <p class="text-sm font-medium">Scan this with the Heli app</p>
        <p class="text-sm text-[var(--color-muted)]">
          Or open the app and enter this code by hand:
        </p>
        <code
          class="select-all rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-lg tracking-wider"
          >{grouped}</code
        >
        <p class="text-xs text-[var(--color-subtle)]">
          Expires in {secondsLeft}s. Anyone who gets this code before it expires can sign in as
          you, so keep it on your screen.
        </p>
        <div>
          <Button variant="ghost" size="sm" onclick={() => (pairing = null)}>Cancel</Button>
        </div>
      </div>
    </div>
  {:else}
    <div>
      <Button onclick={startPairing} disabled={starting}>
        {#if starting}<Spinner size="sm" />{/if}
        Pair a device
      </Button>
    </div>
  {/if}

  {#if devices.length > 0}
    <ul class="flex flex-col divide-y divide-[var(--color-border)]">
      {#each devices as d (d.id)}
        <li class="flex items-center gap-3 py-3">
          <Smartphone size={16} strokeWidth={2} class="shrink-0 text-[var(--color-subtle)]" />
          <div class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-sm font-medium">{d.name}</span>
            <span class="text-xs text-[var(--color-muted)]">
              {d.platform === 'android' ? 'Android' : 'iOS'}{d.appVersion
                ? ` · ${d.appVersion}`
                : ''} · {lastSeen(d.lastUsedAt)}
            </span>
          </div>
          {#if d.pushEnabled}
            <span
              class="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-2xs text-[var(--color-muted)]"
              title="Reminders are pushed to this device"
            >
              <Bell size={11} strokeWidth={2} /> Notifications
            </span>
          {/if}
          <button
            type="button"
            onclick={() => revoke(d)}
            aria-label="Sign {d.name} out"
            class="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-subtle)] transition-colors hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
          >
            <Trash2 size={15} strokeWidth={2} />
          </button>
        </li>
      {/each}
    </ul>
  {:else if !pairing}
    <p class="text-sm text-[var(--color-subtle)]">No devices paired yet.</p>
  {/if}
</section>
