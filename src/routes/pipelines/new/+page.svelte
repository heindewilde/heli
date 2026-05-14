<script lang="ts">
  import { enhance } from '$app/forms';
  import { ArrowUp, ArrowDown, Plus, Trash2 } from 'lucide-svelte';
  import type { PipelineView, StageKind } from '$lib/server/schema';

  let { form, data } = $props();
  let submitting = $state(false);
  let defaultView = $state<PipelineView>('kanban');

  type StageDraft = { name: string; kind: StageKind };

  let stages = $state<StageDraft[]>([
    { name: 'Backlog', kind: 'open' },
    { name: 'In progress', kind: 'open' },
    { name: 'Won', kind: 'won' },
    { name: 'Lost', kind: 'lost' }
  ]);
  let newStageName = $state('');
  let newStageKind = $state<StageKind>('open');

  const STAGE_KIND_OPTIONS: { value: StageKind; label: string }[] = [
    { value: 'open', label: 'Open' },
    { value: 'won', label: 'Won' },
    { value: 'lost', label: 'Lost' }
  ];

  const inputClass =
    'rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2';

  function addStage() {
    const n = newStageName.trim();
    if (!n) return;
    stages = [...stages, { name: n, kind: newStageKind }];
    newStageName = '';
    newStageKind = 'open';
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

    <fieldset class="flex flex-wrap items-center gap-1.5 text-sm">
      <legend class="w-full text-[var(--color-muted)]">Default view</legend>
      {#each ['kanban', 'list'] as v (v)}
        <label class="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-2.5 py-1 {defaultView === v
          ? 'border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)] text-[var(--color-text)]'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]'}">
          <input
            type="radio"
            name="defaultView"
            value={v}
            bind:group={defaultView}
            class="sr-only"
          />
          {v}
        </label>
      {/each}
    </fieldset>

    <div class="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
      <legend class="text-xs text-[var(--color-muted)]">Stages</legend>
      <ul class="flex flex-col gap-1">
        {#each stages as stage, i (i)}
          <li class="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
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
            <select
              bind:value={stage.kind}
              class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs"
            >
              {#each STAGE_KIND_OPTIONS as o (o.value)}
                <option value={o.value}>{o.label}</option>
              {/each}
            </select>
            <button
              type="button"
              onclick={() => removeStage(i)}
              title="Remove stage"
              class="rounded-[var(--radius-sm)] p-1 text-[var(--color-subtle)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
            ><Trash2 size={12} strokeWidth={2} /></button>
          </li>
        {/each}
      </ul>
      <div class="flex items-center gap-2">
        <input
          bind:value={newStageName}
          placeholder="New stage…"
          onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStage(); } }}
          class="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm"
        />
        <select
          bind:value={newStageKind}
          class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs"
        >
          {#each STAGE_KIND_OPTIONS as o (o.value)}
            <option value={o.value}>{o.label}</option>
          {/each}
        </select>
        <button
          type="button"
          onclick={addStage}
          class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-surface)]"
        >
          <Plus size={12} strokeWidth={2} /> Add
        </button>
      </div>
      <input type="hidden" name="stageNames" value={stages.map((s) => s.name).join('|')} />
      <input type="hidden" name="stageKinds" value={stages.map((s) => s.kind).join('|')} />
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
