<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { toast } from '$lib/toasts.svelte';
  import { Pencil } from 'lucide-svelte';
  import Editable from '$lib/ui/Editable.svelte';

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

  // Normally no invalidateAll: the PATCH response is authoritative for this one
  // field, and Editable holds the new value optimistically until the page next
  // re-renders from the server for some other reason.
  async function save(next: string | null): Promise<boolean> {
    const res = await fetch(`/api/${endpoint}/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ [field]: next })
    });
    if (!res.ok) {
      toast.danger(res.status === 409 ? 'Another record already has that' : 'Update failed');
      return false;
    }
    // The exception: some fields are rewritten on the way in — `url` goes
    // through `cleanUrl`, because it is the workspace's dedupe key. Typing
    // "ACME.example/" and being shown "ACME.example/" until the next reload,
    // when what was actually stored is "https://acme.example", is the kind of
    // small lie that makes people re-type things. Only reloads when the server
    // disagreed with what was sent.
    const stored = ((await res.json()) as Record<string, unknown>)[field];
    if (typeof stored === 'string' && next !== null && stored !== next) await invalidateAll();
    return true;
  }
</script>

<div class="flex items-start gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm">
  <Icon size={14} strokeWidth={2} class="mt-0.5 shrink-0 text-[var(--color-subtle)]" />
  <div class="min-w-0 flex-1">
    <div class="text-xs text-[var(--color-muted)]">{label}</div>
    <div class="mt-0.5">
      <Editable
        {value}
        {label}
        placeholder={`Add ${label.toLowerCase()}…`}
        onCommit={save}
        tabToNext
      >
        {#snippet display(shown)}
          <span class="truncate {shown ? '' : 'italic text-[var(--color-subtle)]'}">
            {shown ?? `Add ${label.toLowerCase()}…`}
          </span>
          <Pencil
            size={12}
            strokeWidth={2}
            class="shrink-0 opacity-0 group-hover:opacity-60 group-hover/editable:opacity-60"
          />
        {/snippet}
      </Editable>
    </div>
  </div>
</div>
