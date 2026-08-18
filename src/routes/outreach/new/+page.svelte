<script lang="ts">
  import { APP_NAME } from '$lib/branding';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import TemplateEditor from '$lib/components/TemplateEditor.svelte';
  import { toast } from '$lib/toasts.svelte';
  import { readErrorCode } from '$lib/api-error';
  import { isOutreachTarget, type OutreachPlatform, type OutreachTarget } from '$lib/outreach/platforms';

  let { data } = $props();

  let name = $state('');
  let platform = $state<OutreachPlatform>('email');
  // `?target=company` lets "Write one" from an empty company-outreach state land
  // in the editor already set up for it.
  let target = $state<OutreachTarget>(
    isOutreachTarget(page.url.searchParams.get('target'))
      ? (page.url.searchParams.get('target') as OutreachTarget)
      : 'person'
  );
  let subject = $state('');
  let body = $state('');
  let visibility = $state<'shared' | 'private'>('shared');
  let nudgeDays = $state<number | null>(null);
  let saving = $state(false);
  let error = $state<string | null>(null);

  const ERRORS: Record<string, string> = {
    missing_name: 'Give the template a name.',
    invalid_platform: 'Pick a platform.',
    invalid_target: 'Pick who this template addresses.'
  };

  async function save(values: {
    name: string;
    platform: OutreachPlatform;
    target: OutreachTarget;
    subject: string;
    body: string;
    visibility: 'shared' | 'private';
    nudgeDays: number | null;
  }) {
    if (saving) return;
    saving = true;
    error = null;
    try {
      const res = await fetch('/api/outreach', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values)
      });
      if (!res.ok) {
        error = ERRORS[await readErrorCode(res)] ?? 'Could not save.';
        return;
      }
      const { id } = (await res.json()) as { id: string };
      toast.success('Template created');
      goto(`/outreach/${id}`);
    } catch {
      error = 'Could not save.';
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head>
  <title>New template — {APP_NAME}</title>
</svelte:head>

<div class="flex flex-col gap-4">
  <header>
    <h1 class="text-2xl font-semibold tracking-tight">New template</h1>
    <p class="mt-1 text-sm text-[var(--color-muted)]">
      Write it once. Heli fills in the details and copies it — you send it yourself.
    </p>
  </header>

  <TemplateEditor
    bind:name
    bind:platform
    bind:target
    bind:subject
    bind:body
    bind:visibility
    bind:nudgeDays
    sample={data.sample}
    companySample={data.companySample}
    sender={data.sender}
    {saving}
    {error}
    submitLabel="Create template"
    onSubmit={save}
    onCancel={() => goto('/outreach')}
  />
</div>
