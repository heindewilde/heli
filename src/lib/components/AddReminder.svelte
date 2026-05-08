<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { Bell, Plus, X } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';

  type Props = {
    kind: 'person' | 'company' | 'interaction' | 'project';
    refId: string;
  };

  let { kind, refId }: Props = $props();
  let open = $state(false);
  let when = $state('');
  let saving = $state(false);

  function defaultWhen(): string {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(9, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function startOpen() {
    when = defaultWhen();
    open = true;
  }

  async function save() {
    if (saving) return;
    const ts = new Date(when).getTime();
    if (!Number.isFinite(ts)) {
      toast.danger('Pick a date');
      return;
    }
    saving = true;
    try {
      const res = await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, refId, remindAt: ts })
      });
      if (!res.ok) {
        toast.danger('Could not add reminder');
        return;
      }
      toast.success('Reminder set');
      open = false;
      await invalidateAll();
    } finally {
      saving = false;
    }
  }
</script>

<div class="flex flex-col gap-2">
  {#if !open}
    <button
      type="button"
      onclick={startOpen}
      class="inline-flex items-center gap-1 self-start rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-muted)] hover:bg-[var(--color-bg)]"
    >
      <Bell size={12} strokeWidth={2} />
      Remind me
    </button>
  {:else}
    <div class="flex items-center gap-1">
      <input
        type="datetime-local"
        bind:value={when}
        class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs"
      />
      <button
        type="button"
        onclick={save}
        disabled={saving}
        class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-product)] px-2 py-1 text-xs text-white"
      >
        <Plus size={12} strokeWidth={2} />
        Set
      </button>
      <button
        type="button"
        onclick={() => (open = false)}
        class="rounded-[var(--radius-sm)] p-1 text-[var(--color-subtle)] hover:bg-[var(--color-bg)]"
        aria-label="Cancel"
      ><X size={12} strokeWidth={2} /></button>
    </div>
  {/if}
</div>
