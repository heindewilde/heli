<script lang="ts">
  import { APP_NAME } from '$lib/branding';
  import { goto, invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import { ArrowLeft, Trash2 } from 'lucide-svelte';
  import TemplateEditor from '$lib/components/TemplateEditor.svelte';
  import { registerCommands } from '$lib/commands/registry.svelte';
  import { toast } from '$lib/toasts.svelte';
  import { readErrorCode } from '$lib/api-error';
  import type { OutreachPlatform } from '$lib/outreach/platforms';

  let { data } = $props();
  const template = $derived(data.template);

  // svelte-ignore state_referenced_locally
  let name = $state(data.template.name);
  // svelte-ignore state_referenced_locally
  let platform = $state<OutreachPlatform>(data.template.platform);
  // svelte-ignore state_referenced_locally
  let subject = $state(data.template.subject ?? '');
  // svelte-ignore state_referenced_locally
  let body = $state(data.template.body);
  // svelte-ignore state_referenced_locally
  let visibility = $state<'shared' | 'private'>(data.template.visibility);
  // svelte-ignore state_referenced_locally
  let nudgeDays = $state<number | null>(data.template.nudgeDays);

  let saving = $state(false);
  let error = $state<string | null>(null);

  const ERRORS: Record<string, string> = {
    missing_name: 'Give the template a name.',
    invalid_platform: 'Pick a platform.',
    not_found: 'This template no longer exists.'
  };

  async function save(values: {
    name: string;
    platform: OutreachPlatform;
    subject: string;
    body: string;
    visibility: 'shared' | 'private';
    nudgeDays: number | null;
  }) {
    if (saving) return;
    saving = true;
    error = null;
    try {
      const res = await fetch(`/api/outreach/${template.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values)
      });
      if (!res.ok) {
        error = ERRORS[await readErrorCode(res)] ?? 'Could not save.';
        return;
      }
      toast.success('Saved');
      await invalidateAll();
    } catch {
      error = 'Could not save.';
    } finally {
      saving = false;
    }
  }

  async function del() {
    if (!confirm(`Delete template "${template.name}"? Messages already logged are not affected.`))
      return;
    const res = await fetch(`/api/outreach/${template.id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.danger('Delete failed');
      return;
    }
    toast.success(`Deleted ${template.name}`);
    goto('/outreach');
  }

  onMount(() =>
    registerCommands([
      {
        id: 'ctx:delete-template',
        title: `Delete ${template.name}`,
        section: 'This page',
        icon: Trash2,
        run: del
      }
    ])
  );
</script>

<svelte:head>
  <title>{template.name} — {APP_NAME}</title>
</svelte:head>

<div class="flex flex-col gap-4">
  <header class="flex items-center gap-3">
    <a
      href="/outreach"
      aria-label="Back to templates"
      class="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-subtle)] hover:bg-[var(--color-surface)]"
    >
      <ArrowLeft size={16} strokeWidth={2} />
    </a>
    <h1 class="min-w-0 flex-1 truncate text-2xl font-semibold tracking-tight">{template.name}</h1>
    <button
      type="button"
      title="Delete"
      onclick={del}
      class="rounded-[var(--radius-sm)] p-2 text-[var(--color-subtle)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
    >
      <Trash2 size={16} strokeWidth={2} />
    </button>
  </header>

  <TemplateEditor
    bind:name
    bind:platform
    bind:subject
    bind:body
    bind:visibility
    bind:nudgeDays
    sample={data.sample}
    sender={data.sender}
    {saving}
    {error}
    submitLabel="Save changes"
    onSubmit={save}
    onCancel={() => goto('/outreach')}
  />
</div>
