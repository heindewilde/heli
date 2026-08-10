<script lang="ts">
  import Popover from '$lib/ui/Popover.svelte';
  import { invalidateAll } from '$app/navigation';
  import { Bell, Plus, X } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';

  type Reminder = {
    id: string;
    kind: 'person' | 'company' | 'interaction' | 'project';
    refId: string;
    refLabel: string | null;
    refHref: string | null;
    remindAt: number;
  };

  type Props = {
    items: Reminder[];
  };

  let { items }: Props = $props();
  let open = $state(false);

  const upcoming = $derived(items);
  const overdueCount = $derived(items.filter((i) => i.remindAt < Date.now()).length);

  function fmt(ts: number): string {
    const d = new Date(ts);
    const today = new Date();
    const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
    const t = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    if (same(d, today)) return `Today · ${t}`;
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    if (same(d, tomorrow)) return `Tomorrow · ${t}`;
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ` · ${t}`;
  }

  async function dismiss(id: string) {
    const res = await fetch(`/api/reminders/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.danger('Could not dismiss reminder');
      return;
    }
    await invalidateAll();
  }
</script>

<Popover bind:open label="Upcoming reminders" panelRole="dialog" matchWidth class="w-full">
  {#snippet trigger(attrs)}
  <button
    type="button"
    {...attrs}
    class="flex w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-xs text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
  >
    <span class="flex items-center gap-2">
      <Bell size={12} strokeWidth={2} />
      Reminders
    </span>
    {#if items.length > 0}
      <span class="rounded-full px-1.5 py-0.5 text-[10px] {overdueCount > 0
        ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning)]'
        : 'bg-[var(--color-bg)] text-[var(--color-muted)]'}">{items.length}</span>
    {/if}
  </button>
  {/snippet}

  {#snippet content({ close })}
    <div class="w-72">

      <header class="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2">
        <span class="text-xs font-medium">Upcoming reminders</span>
        <button
          type="button"
          onclick={close}
          class="rounded-[var(--radius-sm)] p-1 text-[var(--color-subtle)] hover:bg-[var(--color-bg)]"
          aria-label="Close"
        ><X size={12} strokeWidth={2} /></button>
      </header>
      {#if upcoming.length === 0}
        <p class="px-3 py-4 text-center text-xs text-[var(--color-muted)]">
          No reminders. Add one from a person, company, or interaction.
        </p>
      {:else}
        <ul class="max-h-72 overflow-auto">
          {#each upcoming as r (r.id)}
            <li class="border-b border-[var(--color-border)] last:border-b-0">
              <div class="flex items-start gap-2 px-3 py-2">
                <span class="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full {r.remindAt < Date.now()
                  ? 'bg-[var(--color-warning)]'
                  : 'bg-[var(--color-accent)]'}"></span>
                <div class="min-w-0 flex-1">
                  {#if r.refHref}
                    <a
                      href={r.refHref}
                      onclick={close}
                      class="block truncate text-xs font-medium hover:underline"
                    >{r.refLabel ?? '(deleted)'}</a>
                  {:else}
                    <span class="block truncate text-xs italic text-[var(--color-subtle)]">(deleted)</span>
                  {/if}
                  <span class="block text-[10px] text-[var(--color-muted)]">{fmt(r.remindAt)} · {r.kind}</span>
                </div>
                <button
                  type="button"
                  onclick={() => dismiss(r.id)}
                  class="rounded-[var(--radius-sm)] p-1 text-[var(--color-subtle)] hover:bg-[var(--color-bg)]"
                  aria-label="Dismiss"
                ><X size={12} strokeWidth={2} /></button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
      <footer class="border-t border-[var(--color-border)] px-3 py-1.5 text-[10px] text-[var(--color-muted)]">
        Set a reminder from any person, company, or interaction page.
      </footer>
    
    </div>
  {/snippet}
</Popover>
