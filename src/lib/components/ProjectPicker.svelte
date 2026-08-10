<script lang="ts">
  import { X, Sparkles, FolderKanban } from 'lucide-svelte';
  import type { ProjectStatus } from '$lib/server/schema';
  import Combobox from '$lib/ui/Combobox.svelte';

  type Project = { id: string; name: string; status: ProjectStatus };

  type Props = {
    selected: Project[];
    /** Subset of `selected` that came from auto-suggest and the user hasn't
     *  explicitly confirmed. Renders with a soft "suggested" treatment. */
    suggestedIds?: Set<string>;
    onAdd: (p: Project) => void;
    onRemove: (id: string) => void;
    placeholder?: string;
  };

  let {
    selected,
    suggestedIds = new Set<string>(),
    onAdd,
    onRemove,
    placeholder = 'Add a project…'
  }: Props = $props();

  let box = $state<ReturnType<typeof Combobox> | undefined>(undefined);

  async function search(q: string): Promise<Project[]> {
    if (!q) return [];
    const res = await fetch(`/api/projects?mode=typeahead&q=${encodeURIComponent(q)}&limit=8`);
    if (!res.ok) return [];
    const data = (await res.json()) as { items: Project[] };
    return data.items.filter((p) => !selected.some((s) => s.id === p.id));
  }

  function pick(p: Project) {
    onAdd(p);
    box?.reset();
    box?.focus();
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
  onBackspaceEmpty={() => {
    if (selected.length > 0) onRemove(selected[selected.length - 1].id);
  }}
>
  {#snippet chips()}
    {#each selected as p (p.id)}
      {@const isSuggested = suggestedIds.has(p.id)}
      <span
        class="inline-flex items-center gap-1 rounded-full py-0.5 pl-2 pr-0.5 text-xs {isSuggested
          ? 'border border-dashed border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)] text-[var(--color-text)]'
          : 'bg-[var(--color-highlight-bg)] text-[var(--color-text)]'}"
        title={isSuggested ? 'Suggested — confirm by saving or remove with X' : undefined}
      >
        {#if isSuggested}
          <Sparkles size={10} strokeWidth={2} />
        {:else}
          <FolderKanban size={10} strokeWidth={2} />
        {/if}
        <span class="max-w-[160px] truncate font-medium">{p.name}</span>
        <button
          type="button"
          onclick={() => onRemove(p.id)}
          aria-label="Remove {p.name}"
          class="rounded-full p-0.5 hover:bg-[var(--color-highlight-border)]"><X size={12} strokeWidth={2} /></button
        >
      </span>
    {/each}
  {/snippet}

  {#snippet option(p: Project)}
    <FolderKanban size={12} strokeWidth={2} class="shrink-0 text-[var(--color-subtle)]" />
    <span class="flex min-w-0 flex-1 flex-col">
      <span class="truncate font-medium">{p.name}</span>
      <span class="truncate text-xs text-[var(--color-muted)]">{p.status}</span>
    </span>
  {/snippet}
</Combobox>
