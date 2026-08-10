<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { Plus, Tag, Check } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';
  import Popover from '$lib/ui/Popover.svelte';
  import Combobox from '$lib/ui/Combobox.svelte';

  type AttachedTag = { id: string; name: string };
  type SuggestionTag = { id: string; name: string; slug: string; count?: number };

  type Props = {
    scope: 'person' | 'company' | 'interaction' | 'project';
    entityId: string;
    currentTags: AttachedTag[];
    suggestions: SuggestionTag[];
    revealOnHover?: boolean;
  };

  let { scope, entityId, currentTags, suggestions, revealOnHover = false }: Props = $props();

  let open = $state(false);
  let saving = $state(false);

  const attachedIds = $derived(new Set(currentTags.map((t) => t.id)));

  function search(q: string): SuggestionTag[] {
    const v = q.trim().toLowerCase();
    return (v ? suggestions.filter((s) => s.name.toLowerCase().includes(v)) : suggestions).slice(
      0,
      8
    );
  }

  async function attachByName(name: string) {
    if (saving) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    saving = true;
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scope, name: trimmed, entityId })
      });
      if (!res.ok) {
        toast.danger('Could not add tag');
        return;
      }
      // Tag counts and the workspace-wide tag list both change here, so this
      // is one of the cases where a reload is genuinely owed — the row cache
      // does not own either.
      await invalidateAll();
    } finally {
      saving = false;
    }
  }

  async function detach(tagId: string) {
    if (saving) return;
    saving = true;
    try {
      const res = await fetch('/api/tags', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scope, entityId, tagId })
      });
      if (!res.ok) {
        toast.danger('Could not remove tag');
        return;
      }
      await invalidateAll();
    } finally {
      saving = false;
    }
  }

  async function toggle(t: SuggestionTag) {
    if (attachedIds.has(t.id)) await detach(t.id);
    else await attachByName(t.name);
  }
</script>

<span class="inline-block">
  <Popover bind:open label="Tag {scope}" panelRole="dialog" autoFocus={false}>
    {#snippet trigger(attrs)}
      <!--
        The reveal-on-hover lives on the trigger, not on a descendant selector
        from a wrapper. The panel is a DOM descendant of that wrapper — even
        when the browser paints it in the top layer — so `.wrapper button`
        would fade out every option in the open panel too. Inline style for the
        open state because it has to beat the opacity-0 class, and class order
        in the generated sheet is not something to bet on.
      -->
      <button
        {...attrs}
        type="button"
        aria-label="Add tag"
        style={revealOnHover && open ? 'opacity:1' : ''}
        class="inline-flex items-center gap-0.5 rounded-full border border-dashed border-[var(--color-border)] bg-transparent px-1.5 py-0.5 text-[10px] text-[var(--color-muted)] transition-[color,border-color,background-color,opacity] hover:border-[var(--color-highlight-border)] hover:bg-[var(--color-highlight-bg)] hover:text-[var(--color-text)] {revealOnHover
          ? 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
          : ''}"
      >
        <Plus size={10} strokeWidth={2} />
        tag
      </button>
    {/snippet}

    {#snippet content()}
      <div class="w-52">
        <Combobox
          {search}
          getId={(t) => t.id}
          searchOnOpen
          debounce={0}
          placeholder="Search or create…"
          emptyText="No tags yet. Type to create one."
          canCreate={(q) => !suggestions.some((s) => s.name.toLowerCase() === q.toLowerCase())}
          createLabel={(q) => `Create “${q}”`}
          onCreate={attachByName}
          onSelect={toggle}
        >
          {#snippet option(s: SuggestionTag)}
            {@const attached = attachedIds.has(s.id)}
            <span class="flex min-w-0 flex-1 items-center gap-1.5">
              {#if attached}
                <Check size={10} strokeWidth={2} class="shrink-0 text-[var(--color-text)]" />
              {:else}
                <Tag size={10} strokeWidth={2} class="shrink-0 text-[var(--color-subtle)]" />
              {/if}
              <span class="truncate {attached ? 'text-[var(--color-text)]' : ''}">{s.name}</span>
            </span>
            {#if s.count != null}
              <span class="shrink-0 text-[var(--color-subtle)]">{s.count}</span>
            {/if}
          {/snippet}
        </Combobox>
      </div>
    {/snippet}
  </Popover>
</span>
