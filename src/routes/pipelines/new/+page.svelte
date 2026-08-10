<script lang="ts">
  import { APP_NAME } from '$lib/branding';
  import { enhance } from '$app/forms';
  import { ArrowUp, ArrowDown, Trash2 } from 'lucide-svelte';
  import { type StageColor } from '$lib/stageColors';
  import StageColorPicker from '$lib/components/StageColorPicker.svelte';

  let { form, data } = $props();
  let submitting = $state(false);

  type StageDraft = { name: string; color: StageColor };

  let stages = $state<StageDraft[]>([
    { name: 'Backlog',              color: 'gray' },
    { name: 'In progress',          color: 'sky' },
    { name: 'Waiting for response', color: 'yellow' },
    { name: 'Won',                  color: 'green' },
    { name: 'Lost',                 color: 'red' }
  ]);
  let newStageName = $state('');
  let newStageColor = $state<StageColor>('gray');

  const inputClass =
    'rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2';

  function addStage() {
    const n = newStageName.trim();
    if (!n) return;
    stages = [...stages, { name: n, color: newStageColor }];
    newStageName = '';
    newStageColor = 'gray';
  }
  function removeStage(i: number) {
    stages = stages.filter((_, idx) => idx !== i);
  }
  function move(i: number, dir: -1 | 1) {
    const next = i + dir;
    if (next < 0 || next >= stages.length) return;
    const copy = [...stages];
    [copy[i], copy[next]] = [copy[next], copy[i]];
    stages = copy;
  }
</script>

<svelte:head>
  <title>New pipeline — {APP_NAME}</title>
</svelte:head>

<article class="mx-auto flex max-w-2xl flex-col gap-4">
  <header>
    <h1 class="text-2xl font-semibold tracking-tight">New pipeline</h1>
    <p class="text-sm text-[var(--color-muted)]">
      Track people and companies through custom stages — hiring funnels, sales deals, partnerships. You can always edit stages after creating the pipeline.
    </p>
  </header>

  <form
    method="POST"
    use:enhance={() => {
      submitting = true;
      return async ({ update }) => {
        await update();
        submitting = false;
      };
    }}
    class="flex flex-col gap-3"
  >
    {#if data.fromCollection}
      {@const fc = data.fromCollection}
      <input type="hidden" name="fromCollectionId" value={fc.id} />
      <div class="rounded-[var(--radius-sm)] border border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)] px-3 py-2.5 text-sm">
        <p class="font-medium text-[var(--color-text)]">Members from "{fc.name}" will be added</p>
        <p class="mt-0.5 text-[var(--color-muted)]">
          {#if fc.peopleCount > 0 && fc.companyCount > 0}
            {fc.peopleCount} {fc.peopleCount === 1 ? 'person' : 'people'} and {fc.companyCount} {fc.companyCount === 1 ? 'company' : 'companies'} will be placed in the first stage of this pipeline.
          {:else if fc.peopleCount > 0}
            {fc.peopleCount} {fc.peopleCount === 1 ? 'person' : 'people'} will be placed in the first stage of this pipeline.
          {:else if fc.companyCount > 0}
            {fc.companyCount} {fc.companyCount === 1 ? 'company' : 'companies'} will be placed in the first stage of this pipeline.
          {:else}
            The collection is empty — no members will be added.
          {/if}
          The collection itself will remain unchanged.
        </p>
      </div>
      <div class="rounded-[var(--radius-sm)] border border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)] px-3 py-2.5 text-sm">
        <label class="inline-flex cursor-pointer items-center gap-2">
          <input type="checkbox" name="syncWithCollection" value="1" class="rounded-[var(--radius-sm)]" />
          <span class="text-[var(--color-text)]">Keep in sync</span>
          <span class="text-[var(--color-muted)]">— adding or removing members on either side will mirror to the other</span>
        </label>
      </div>
    {/if}

    <label class="flex flex-col gap-1 text-sm">
      <span class="text-[var(--color-muted)]">Name *</span>
      <input name="name" required maxlength="200" class={inputClass} />
    </label>

    <label class="flex flex-col gap-1 text-sm">
      <span class="text-[var(--color-muted)]">Description</span>
      <textarea name="description" rows="2" class={inputClass}></textarea>
    </label>

    <div class="flex flex-col gap-2 text-sm">
      <span class="text-[var(--color-muted)]">Stages</span>
      <div class="flex flex-col gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        {#each stages as stage, i (i)}
          <div class="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
            <div class="flex flex-col">
              <button
                type="button"
                onclick={() => move(i, -1)}
                disabled={i === 0}
                class="rounded-[var(--radius-sm)] p-0.5 text-[var(--color-subtle)] hover:bg-[var(--color-surface)] disabled:opacity-30"
              ><ArrowUp size={12} strokeWidth={2} /></button>
              <button
                type="button"
                onclick={() => move(i, 1)}
                disabled={i === stages.length - 1}
                class="rounded-[var(--radius-sm)] p-0.5 text-[var(--color-subtle)] hover:bg-[var(--color-surface)] disabled:opacity-30"
              ><ArrowDown size={12} strokeWidth={2} /></button>
            </div>
            <input
              bind:value={stage.name}
              class="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm"
            />
            <StageColorPicker value={stage.color} onChange={(c) => (stage.color = c)} label="Change stage color" />
            <button
              type="button"
              onclick={() => removeStage(i)}
              title="Remove stage"
              class="rounded-[var(--radius-sm)] p-1 text-[var(--color-subtle)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
            ><Trash2 size={12} strokeWidth={2} /></button>
          </div>
        {/each}

        <!-- New stage row — same layout as existing rows, arrows and trash invisible -->
        <div class="flex items-center gap-2 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] p-2">
          <div class="invisible flex flex-col">
            <div class="p-0.5"><ArrowUp size={12} strokeWidth={2} /></div>
            <div class="p-0.5"><ArrowDown size={12} strokeWidth={2} /></div>
          </div>
          <input
            bind:value={newStageName}
            placeholder="New stage…"
            onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStage(); } }}
            class="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm"
          />
          <StageColorPicker value={newStageColor} onChange={(c) => (newStageColor = c)} label="Pick color for new stage" />
          <div class="invisible p-1"><Trash2 size={12} strokeWidth={2} /></div>
        </div>

        <input type="hidden" name="stageNames" value={stages.map((s) => s.name).join('|')} />
        <input type="hidden" name="stageColors" value={stages.map((s) => s.color).join('|')} />
      </div>
    </div>

    {#if form?.error}
      <p class="rounded-[var(--radius-sm)] border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3 py-2 text-sm text-[var(--color-danger)]">
        {form.error}
      </p>
    {/if}

    <div class="flex items-center gap-2">
      <button
        type="submit"
        disabled={submitting}
        class="rounded-[var(--radius-sm)] bg-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-hover)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-60"
      >{submitting ? 'Saving…' : 'Save pipeline'}</button>
      <a href={data.fromCollection ? `/collections/${data.fromCollection.id}` : '/pipelines'} class="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-4 py-2 text-sm">Cancel</a>
    </div>
  </form>
</article>
