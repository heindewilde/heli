<script lang="ts">
  import { X } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';
  import Combobox from '$lib/ui/Combobox.svelte';

  type Person = {
    id: string;
    name: string;
    avatarUrl: string | null;
    role: string | null;
    companyId?: string | null;
  };

  type Props = {
    selected: Person[];
    onAdd: (p: Person) => void;
    onRemove: (id: string) => void;
    placeholder?: string;
  };

  let { selected, onAdd, onRemove, placeholder = 'Add a person…' }: Props = $props();

  let box = $state<ReturnType<typeof Combobox> | undefined>(undefined);

  async function search(q: string): Promise<Person[]> {
    if (!q) return [];
    const res = await fetch(`/api/people?q=${encodeURIComponent(q)}&limit=8`);
    if (!res.ok) return [];
    const data = (await res.json()) as { items: Person[] };
    return data.items.filter((p) => !selected.some((s) => s.id === p.id));
  }

  function pick(p: Person) {
    onAdd(p);
    box?.reset();
    box?.focus();
  }

  async function createAndPick(name: string) {
    try {
      const res = await fetch('/api/people', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!res.ok) {
        toast.danger('Could not create person');
        return;
      }
      const data = (await res.json()) as { id: string };
      pick({ id: data.id, name, avatarUrl: null, role: null, companyId: null });
    } catch {
      toast.danger('Could not create person');
    }
  }
</script>

<Combobox
  bind:this={box}
  variant="field"
  {search}
  getId={(p) => p.id}
  {placeholder}
  autoFocus={false}
  onSelect={pick}
  onCreate={createAndPick}
  createLabel={(q) => `Add “${q}”`}
  onBackspaceEmpty={() => {
    if (selected.length > 0) onRemove(selected[selected.length - 1].id);
  }}
>
  {#snippet chips()}
    {#each selected as p (p.id)}
      <span
        class="inline-flex items-center gap-1 rounded-full bg-[var(--color-highlight-bg)] py-0.5 pl-1 pr-0.5 text-xs text-[var(--color-text)]"
      >
        <span
          class="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border border-[var(--color-highlight-border)] bg-white text-[10px]"
        >
          {#if p.avatarUrl}
            <img src={p.avatarUrl} alt="" class="h-full w-full object-cover" />
          {:else}
            {(p.name[0] ?? '·').toUpperCase()}
          {/if}
        </span>
        <span class="max-w-[140px] truncate font-medium">{p.name}</span>
        <button
          type="button"
          onclick={() => onRemove(p.id)}
          aria-label="Remove {p.name}"
          class="rounded-full p-0.5 hover:bg-[var(--color-highlight-border)]"><X size={12} strokeWidth={2} /></button
        >
      </span>
    {/each}
  {/snippet}

  {#snippet option(p: Person)}
    <span
      class="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] text-[10px] text-[var(--color-muted)]"
    >
      {#if p.avatarUrl}
        <img src={p.avatarUrl} alt="" class="h-full w-full object-cover" />
      {:else}
        {(p.name[0] ?? '·').toUpperCase()}
      {/if}
    </span>
    <span class="flex min-w-0 flex-1 flex-col">
      <span class="truncate font-medium">{p.name}</span>
      {#if p.role}
        <span class="truncate text-xs text-[var(--color-muted)]">{p.role}</span>
      {/if}
    </span>
  {/snippet}
</Combobox>
