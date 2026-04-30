<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { toast } from '$lib/toasts.svelte';
  import { Pencil } from 'lucide-svelte';

  // lucide-svelte exports each icon as its own component type; keep the prop
  // permissive rather than fighting the inferred shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type IconLike = any;

  type Props = {
    label: string;
    icon: IconLike;
    value: string | null;
    field: string;
    id: string;
    endpoint: 'people' | 'companies';
  };

  let { label, icon: Icon, value, field, id, endpoint }: Props = $props();

  let editing = $state(false);
  // svelte-ignore state_referenced_locally
  let draft = $state(value ?? '');
  let inputEl = $state<HTMLInputElement | undefined>(undefined);

  function start() {
    draft = value ?? '';
    editing = true;
    setTimeout(() => inputEl?.focus(), 0);
  }

  async function commit() {
    const next = draft.trim() || null;
    if (next === (value ?? null)) {
      editing = false;
      return;
    }
    const res = await fetch(`/api/${endpoint}/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ [field]: next })
    });
    if (!res.ok) {
      toast.danger('Update failed');
      return;
    }
    editing = false;
    await invalidateAll();
  }
</script>

<div class="flex items-start gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm">
  <Icon size={14} strokeWidth={2} class="mt-0.5 shrink-0 text-[var(--color-subtle)]" />
  <div class="min-w-0 flex-1">
    <div class="text-xs text-[var(--color-muted)]">{label}</div>
    {#if editing}
      <input
        bind:this={inputEl}
        bind:value={draft}
        onblur={commit}
        onkeydown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { editing = false; draft = value ?? ''; }
        }}
        class="mt-0.5 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm"
      />
    {:else}
      <button
        type="button"
        onclick={start}
        class="mt-0.5 flex w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] px-1 -mx-1 text-left text-sm hover:bg-[var(--color-surface)]"
      >
        <span class="truncate {value ? '' : 'text-[var(--color-subtle)] italic'}">
          {value ?? `Add ${label.toLowerCase()}…`}
        </span>
        <Pencil size={12} strokeWidth={2} class="shrink-0 opacity-0 group-hover:opacity-60" />
      </button>
    {/if}
  </div>
</div>
