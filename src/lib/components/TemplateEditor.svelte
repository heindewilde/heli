<script lang="ts">
  import RichText from '$lib/ui/RichText.svelte';
  import Select from '$lib/ui/Select.svelte';
  import { htmlToPlain } from '$lib/richText';
  import SegmentedControl from '$lib/ui/SegmentedControl.svelte';
  import {
    OUTREACH_PLATFORMS,
    PLATFORMS,
    isRichPlatform,
    type OutreachPlatform,
    type OutreachTarget
  } from '$lib/outreach/platforms';
  import {
    variableNamesFor,
    renderFor,
    type CompanyRecipient,
    type Recipient,
    type Sender
  } from '$lib/outreach/render';

  type Props = {
    name: string;
    platform: OutreachPlatform;
    /** Who this template addresses. Switching it swaps the variable list. */
    target: OutreachTarget;
    subject: string;
    body: string;
    visibility: 'shared' | 'private';
    nudgeDays: number | null;
    /** A real person from the workspace, so the preview shows real data. */
    sample: Recipient | null;
    /** The same, for the company arm. Both are loaded because target is editable. */
    companySample: CompanyRecipient | null;
    sender: Sender;
    saving?: boolean;
    submitLabel?: string;
    error?: string | null;
    onSubmit: (values: {
      name: string;
      platform: OutreachPlatform;
      target: OutreachTarget;
      subject: string;
      body: string;
      visibility: 'shared' | 'private';
      nudgeDays: number | null;
    }) => void;
    onCancel: () => void;
  };

  let {
    name = $bindable(),
    platform = $bindable(),
    target = $bindable(),
    subject = $bindable(),
    body = $bindable(),
    visibility = $bindable(),
    nudgeDays = $bindable(),
    sample,
    companySample,
    sender,
    saving = false,
    submitLabel = 'Save',
    error = null,
    onSubmit,
    onCancel
  }: Props = $props();

  let richRef = $state<ReturnType<typeof RichText> | undefined>(undefined);
  let plainRef = $state<HTMLTextAreaElement | undefined>(undefined);

  const spec = $derived(PLATFORMS[platform]);
  const rich = $derived(isRichPlatform(platform));
  // In the markup a regex literal reads as a block-closing tag to the Svelte
  // parser, so this stays here.
  const article = $derived('aeiou'.includes(spec.interactionType[0]) ? 'an' : 'a');

  /**
   * The preview needs a recipient of the right kind. A real one from the
   * workspace beats a made-up "Jane Doe": it shows immediately whether the
   * records you actually hold carry the fields the template asks for.
   *
   * Both samples are loaded up front rather than fetched on switch, because
   * the target control has to feel instant — and two rows is not a cost worth
   * a round trip.
   */
  const previewPerson = $derived<Recipient>(
    target === 'company'
      ? (companySample ?? {
          kind: 'company',
          name: 'Analytical Engines',
          domain: 'analyticalengines.co',
          industry: 'Manufacturing',
          location: 'London'
        })
      : (sample ?? { name: 'Ada Lovelace', role: 'Mathematician', companyName: 'Analytical Engines' })
  );

  const variables = $derived(variableNamesFor(target));

  const bodyPlain = $derived(rich ? htmlToPlain(body) : body);
  const rendered = $derived(renderFor(bodyPlain, previewPerson, sender));
  const renderedSubject = $derived(
    spec.hasSubject ? renderFor(subject, previewPerson, sender) : null
  );

  const bodyCount = $derived(rendered.text.length);
  const overBudget = $derived(spec.bodyMax !== null && bodyCount > spec.bodyMax);
  const subjectCount = $derived(renderedSubject?.text.length ?? 0);
  const subjectOver = $derived(
    spec.subjectMax !== undefined && subjectCount > spec.subjectMax
  );

  /** Unresolved across subject and body, deduped, for the warning strip. */
  const unresolved = $derived([
    ...new Set([...(renderedSubject?.unresolved ?? []), ...rendered.unresolved])
  ]);

  function insertVariable(v: string) {
    const token = `{{${v}}}`;
    if (rich) {
      // Squire owns its DOM; appending to the end is the honest simple thing
      // rather than fighting it for a caret position.
      body = `${body}${token}`;
      richRef?.setHtml(body);
      return;
    }
    const el = plainRef;
    if (!el) {
      body = `${body}${token}`;
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    body = body.slice(0, start) + token + body.slice(end);
    queueMicrotask(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function submit() {
    onSubmit({
      name,
      platform,
      target,
      subject,
      body: rich ? (richRef?.getHtml() ?? body) : body,
      visibility,
      nudgeDays
    });
  }
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
  <section class="flex flex-col gap-4">
    {#if error}
      <p
        class="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-danger-bg)] px-3 py-2 text-sm text-[var(--color-danger)]"
      >
        {error}
      </p>
    {/if}

    <label class="flex flex-col gap-1">
      <span class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]"
        >Name</span
      >
      <input
        bind:value={name}
        type="text"
        placeholder="Cold intro to a founder"
        class="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm"
      />
    </label>

    <label class="flex flex-col gap-1">
      <span class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]"
        >Platform</span
      >
      <Select
        size="md"
        label="Platform"
        bind:value={platform}
        options={OUTREACH_PLATFORMS.map((p) => ({ value: p, label: PLATFORMS[p].label }))}
      />
      <span class="text-xs text-[var(--color-subtle)]">
        {#if spec.bodyMax !== null}
          Limit {spec.bodyMax.toLocaleString()} characters.
        {/if}
        Logged as {article} {spec.interactionType} interaction.
      </span>
    </label>

    <div class="flex flex-col gap-1">
      <span class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]"
        >Addressed to</span
      >
      <SegmentedControl
        label="Addressed to"
        size="sm"
        segments={[
          { value: 'person', label: 'A person' },
          { value: 'company', label: 'A company' }
        ]}
        value={target}
        onchange={(v) => (target = v as OutreachTarget)}
      />
      <span class="text-xs text-[var(--color-subtle)]">
        {#if target === 'company'}
          Writes to a company's own address. A company has no first name, so
          <code class="font-mono">first_name</code> and
          <code class="font-mono">role</code> are not available.
        {:else}
          Writes to a person. Run it against a collection, a pipeline stage, or a
          selection on the People list.
        {/if}
      </span>
    </div>

    {#if spec.hasSubject}
      <label class="flex flex-col gap-1">
        <span
          class="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]"
        >
          <span>Subject</span>
          {#if spec.subjectMax !== undefined}
            <span class={subjectOver ? 'text-[var(--color-danger)]' : ''}
              >{subjectCount}/{spec.subjectMax}</span
            >
          {/if}
        </span>
        <input
          bind:value={subject}
          type="text"
          placeholder="Quick question about {'{{company_name}}'}"
          class="h-9 rounded-[var(--radius-md)] border bg-[var(--color-surface)] px-3 text-sm {subjectOver
            ? 'border-[var(--color-danger)]'
            : 'border-[var(--color-border)]'}"
        />
      </label>
    {/if}

    <div class="flex flex-col gap-1">
      <span
        class="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]"
      >
        <span>Message</span>
        <span class={overBudget ? 'text-[var(--color-danger)]' : ''}>
          {bodyCount}{spec.bodyMax !== null ? `/${spec.bodyMax}` : ''}
        </span>
      </span>
      {#if rich}
        <RichText
          bind:this={richRef}
          value={body}
          showActions={false}
          placeholder="Hi {'{{first_name}}'}…"
          onInput={(html) => (body = html)}
        />
      {:else}
        <textarea
          bind:this={plainRef}
          bind:value={body}
          rows="10"
          placeholder="Hi {'{{first_name}}'}…"
          class="rounded-[var(--radius-md)] border bg-[var(--color-surface)] px-3 py-2 text-sm leading-relaxed {overBudget
            ? 'border-[var(--color-danger)]'
            : 'border-[var(--color-border)]'}"
        ></textarea>
        <span class="text-xs text-[var(--color-subtle)]"
          >Plain text — {PLATFORMS[platform].label} composers do not keep formatting.</span
        >
      {/if}
    </div>

    <div class="flex flex-col gap-1">
      <span class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]"
        >Variables</span
      >
      <div class="flex flex-wrap gap-1">
        {#each variables as v (v)}
          <button
            type="button"
            onclick={() => insertVariable(v)}
            class="rounded-full border border-[var(--color-border)] px-2 py-0.5 font-mono text-[11px] text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
            >{v}</button
          >
        {/each}
      </div>
    </div>

    <div class="flex flex-wrap items-end gap-4">
      <label class="flex flex-col gap-1">
        <span class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]"
          >Visibility</span
        >
        <Select
          size="md"
          label="Visibility"
          bind:value={visibility}
          options={[
            { value: 'shared', label: 'Shared with the workspace' },
            { value: 'private', label: 'Private to me' }
          ]}
        />
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]"
          >Follow-up nudge</span
        >
        <span class="flex items-center gap-2">
          <input
            type="number"
            min="0"
            max="365"
            value={nudgeDays ?? ''}
            oninput={(e) => {
              const raw = (e.currentTarget as HTMLInputElement).value;
              nudgeDays = raw === '' ? null : Number(raw);
            }}
            class="h-9 w-20 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
          />
          <span class="text-xs text-[var(--color-muted)]">days after sending</span>
        </span>
      </label>
    </div>

    <div class="flex items-center gap-2">
      <button
        type="button"
        onclick={submit}
        disabled={saving}
        class="rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
        >{saving ? 'Saving…' : submitLabel}</button
      >
      <button
        type="button"
        onclick={onCancel}
        class="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-sm"
        >Cancel</button
      >
    </div>
  </section>

  <aside class="flex flex-col gap-2">
    <h2 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">
      Preview{sample ? ` — ${sample.name}` : ''}
    </h2>

    {#if unresolved.length > 0}
      <p
        class="rounded-[var(--radius-md)] border border-[var(--color-warning)] bg-[var(--color-warning-bg)] px-3 py-2 text-xs text-[var(--color-text)]"
      >
        Nothing on file for
        <span class="font-mono">{unresolved.join(', ')}</span>. Every send is editable before you
        copy it, so this is a heads-up rather than a problem.
      </p>
    {/if}

    <div
      class="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
    >
      {#if renderedSubject}
        <p class="mb-2 border-b border-[var(--color-border)] pb-2 text-sm font-medium">
          {renderedSubject.text || 'No subject'}
        </p>
      {/if}
      <p class="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text)]">
        {rendered.text || 'Your message will appear here.'}
      </p>
    </div>
  </aside>
</div>
