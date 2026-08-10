<script lang="ts">
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

  // No invalidateAll: the PATCH response is authoritative for this one field,
  // and Editable holds the new value optimistically until the page next
  // re-renders from the server for some other reason.
  async function save(next: string | null): Promise<boolean> {
    const res = await fetch(`/api/${endpoint}/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ [field]: next })
    });
    if (!res.ok) {
      toast.danger('Update failed');
      return false;
    }
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
