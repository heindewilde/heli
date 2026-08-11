<script lang="ts">
  import Popover from '$lib/ui/Popover.svelte';
  import { Send, Check, Play } from 'lucide-svelte';
  import { invalidateAll } from '$app/navigation';
  import { toast } from '$lib/toasts.svelte';
  import { PLATFORMS, type OutreachPlatform } from '$lib/outreach/platforms';

  type Template = { id: string; name: string; platform: OutreachPlatform };

  type Props = {
    pipelineId: string;
    stageId: string;
    stageName: string;
    /** Currently attached, from the page load. */
    attached: { id: string; name: string }[];
  };

  let { pipelineId, stageId, stageName, attached }: Props = $props();

  // Its own component precisely because `Popover` owns a bindable `open` — a
  // parent tracking `openFor = <id>` across N stages cannot bind to it.
  let open = $state(false);
  let templates = $state<Template[]>([]);
  let loading = $state(false);
  // svelte-ignore state_referenced_locally
  let chosen = $state<string[]>(attached.map((t) => t.id));
  let saving = $state(false);

  $effect(() => {
    if (!open || templates.length > 0) return;
    loading = true;
    fetch('/api/outreach')
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j: { items: Template[] }) => (templates = j.items ?? []))
      .catch(() => (templates = []))
      .finally(() => (loading = false));
  });

  function toggle(id: string) {
    chosen = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id];
  }

  async function save(close: () => void) {
    if (saving) return;
    saving = true;
    try {
      // Order is the array order, so the attach order is what the board shows.
      const res = await fetch(`/api/pipelines/${pipelineId}/stages/${stageId}/templates`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ templateIds: chosen })
      });
      if (!res.ok) {
        toast.danger(res.status === 403 ? 'Admins only' : 'Could not save');
        return;
      }
      toast.success(`Templates updated for ${stageName}`);
      close();
      await invalidateAll();
    } catch {
      toast.danger('Could not save');
    } finally {
      saving = false;
    }
  }
</script>

<Popover
  bind:open
  label="Templates for {stageName}"
  placement="bottom-end"
  autoFocus={false}
  panelClass="w-64"
>
  {#snippet trigger(attrs)}
    <button
      {...attrs}
      type="button"
      title="Outreach templates for this stage"
      class="relative rounded-[var(--radius-sm)] p-1 text-[var(--color-subtle)] hover:bg-[var(--color-surface)]"
    >
      <Send size={12} strokeWidth={2} />
      {#if attached.length > 0}
        <span
          class="absolute -right-0.5 -top-0.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-[var(--color-accent)] px-0.5 text-[8px] font-medium text-[var(--color-accent-fg)]"
          >{attached.length}</span
        >
      {/if}
    </button>
  {/snippet}

  {#snippet content({ close })}
    <div class="flex flex-col gap-2 p-2">
      <p class="text-xs text-[var(--color-muted)]">
        Offered on every card in <span class="font-medium">{stageName}</span>.
      </p>

      {#if attached.length > 0}
        <div class="flex flex-col gap-0.5 border-b border-[var(--color-border)] pb-2">
          {#each attached as t (t.id)}
            <a
              href={`/outreach/${t.id}/run?stage=${stageId}`}
              class="flex items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 py-1 text-xs text-[var(--color-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
            >
              <Play size={10} strokeWidth={2} class="shrink-0" />
              <span class="truncate">Run “{t.name}” through this stage</span>
            </a>
          {/each}
        </div>
      {/if}

      {#if loading}
        <p class="px-1 py-2 text-xs text-[var(--color-subtle)]">Loading…</p>
      {:else if templates.length === 0}
        <p class="px-1 py-2 text-xs text-[var(--color-subtle)]">
          No templates yet. <a href="/outreach/new" class="underline">Write one</a>.
        </p>
      {:else}
        <ul class="max-h-56 overflow-y-auto">
          {#each templates as t (t.id)}
            {@const on = chosen.includes(t.id)}
            <li>
              <button
                type="button"
                onclick={() => toggle(t.id)}
                class="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 text-left text-xs hover:bg-[var(--color-bg)]"
              >
                <span
                  class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border {on
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-fg)]'
                    : 'border-[var(--color-border)]'}"
                >
                  {#if on}<Check size={10} strokeWidth={3} />{/if}
                </span>
                <span class="min-w-0 flex-1 truncate">{t.name}</span>
                <span class="shrink-0 text-[10px] text-[var(--color-subtle)]"
                  >{PLATFORMS[t.platform].label}</span
                >
              </button>
            </li>
          {/each}
        </ul>
        <button
          type="button"
          onclick={() => save(close)}
          disabled={saving}
          class="rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-2 py-1 text-xs font-medium text-[var(--color-accent-fg)] disabled:opacity-60"
          >{saving ? 'Saving…' : 'Save'}</button
        >
      {/if}
    </div>
  {/snippet}
</Popover>
