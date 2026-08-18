<script lang="ts">
  import { APP_NAME } from '$lib/branding';
  import { ArrowLeft, ArrowRight, Copy, Check, ExternalLink, SkipForward } from 'lucide-svelte';
  import RichText from '$lib/ui/RichText.svelte';
  import { toast } from '$lib/toasts.svelte';
  import { copyRich, copyText } from '$lib/client/clipboard';
  import { htmlToPlain } from '$lib/richText';
  import { PLATFORMS, isRichPlatform } from '$lib/outreach/platforms';
  import { deepLinkFor } from '$lib/outreach/deepLink';
  import { renderFor } from '$lib/outreach/render';

  let { data } = $props();
  const template = $derived(data.template);
  const spec = $derived(PLATFORMS[template.platform]);
  const rich = $derived(isRichPlatform(template.platform));
  /**
   * A company member carries the same `email`/`phone`/`linkedinUrl`/`xUrl`
   * field names a person does, so `deepLinkFor` and the composer below need no
   * branch. The only places the kind shows are the header link and the
   * mark-as-sent payload.
   */
  const toCompany = $derived(template.target === 'company');

  let index = $state(0);
  /** Ids already logged, so a back-step shows what happened rather than hiding it. */
  let sentIds = $state<string[]>([]);
  let copied = $state(false);
  let sending = $state(false);

  const person = $derived(data.members[index] ?? null);
  const done = $derived(index >= data.members.length);

  /**
   * Every message is rendered up front, on load, not when you reach it.
   *
   * That is what keeps Copy synchronous — Safari invalidates the click gesture
   * across an await, so a per-person fetch at copy time would break the
   * clipboard write on exactly the platform people compose email on.
   */
  const rendered = $derived(
    data.members.map((p) => {
      // An email body stays HTML end to end, with merge values escaped for
      // that context; every other platform is plain and must not be escaped.
      const body = renderFor(template.body, p, data.sender, { escapeHtml: rich });
      const subject = template.subject ? renderFor(template.subject, p, data.sender) : null;
      return {
        body: body.text,
        subject: subject?.text ?? '',
        unresolved: [...new Set([...(subject?.unresolved ?? []), ...body.unresolved])]
      };
    })
  );

  /** Edits are per person and survive stepping back and forth. */
  let edits = $state<Record<string, { subject: string; body: string }>>({});

  const current = $derived(
    person
      ? (edits[person.id] ?? {
          subject: rendered[index]?.subject ?? '',
          body: rendered[index]?.body ?? ''
        })
      : { subject: '', body: '' }
  );

  function edit(field: 'subject' | 'body', value: string) {
    if (!person) return;
    edits[person.id] = { ...current, [field]: value };
  }

  /** The line under the name: role and employer, or industry and location. */
  const subtitle = $derived(
    person == null
      ? ''
      : 'kind' in person && person.kind === 'company'
        ? [person.industry, person.location].filter(Boolean).join(' · ')
        : [
            (person as { role?: string | null }).role,
            (person as { companyName?: string | null }).companyName
          ]
            .filter(Boolean)
            .join(' · ')
  );

  /** Plain flavour: the clipboard's text/plain, the mailto body, the counter. */
  const bodyPlain = $derived(rich ? htmlToPlain(current.body) : current.body);

  const link = $derived(
    person
      ? deepLinkFor(template.platform, person, { subject: current.subject, body: bodyPlain })
      : null
  );

  function next() {
    copied = false;
    index = Math.min(index + 1, data.members.length);
  }

  function prev() {
    copied = false;
    index = Math.max(index - 1, 0);
  }

  async function copy() {
    const plain =
      spec.hasSubject && current.subject ? `${current.subject}\n\n${bodyPlain}` : bodyPlain;
    const result = rich ? await copyRich(current.body, plain) : await copyText(plain);
    if (result === 'failed') {
      toast.danger('Could not reach the clipboard');
      return;
    }
    copied = true;
  }

  async function markSent() {
    if (!person || sending) return;
    sending = true;
    try {
      const res = await fetch('/api/outreach/sent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          templateId: template.id,
          // Exactly one of these; the endpoint rejects both and neither, and
          // rejects the one that disagrees with the template's target.
          ...(toCompany ? { companyId: person.id } : { personId: person.id }),
          subject: current.subject,
          body: current.body,
          remindInDays: template.nudgeDays
        })
      });
      if (!res.ok) {
        toast.danger('Could not log it');
        return;
      }
      sentIds = [...sentIds, person.id];
      next();
    } catch {
      toast.danger('Could not log it');
    } finally {
      sending = false;
    }
  }
</script>

<svelte:head>
  <title>{template.name} — {APP_NAME}</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-2xl flex-col gap-4">
  <header class="flex items-center gap-3">
    <a
      href={`/outreach/${template.id}`}
      aria-label="Back to the template"
      class="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-subtle)] hover:bg-[var(--color-surface)]"
    >
      <ArrowLeft size={16} strokeWidth={2} />
    </a>
    <div class="min-w-0 flex-1">
      <h1 class="truncate text-lg font-semibold tracking-tight">{template.name}</h1>
      <p class="text-xs text-[var(--color-muted)]">
        {data.sourceName} · {sentIds.length} of {data.members.length} logged
      </p>
    </div>
  </header>

  {#if data.members.length === 0}
    <p
      class="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-10 text-center text-sm text-[var(--color-muted)]"
    >
      {#if toCompany}
        No companies in {data.sourceName}. This template addresses a company, so people there are
        skipped.
      {:else}
        No people in {data.sourceName}. This template addresses a person, so companies there are
        skipped.
      {/if}
    </p>
  {:else if done}
    <div
      class="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center"
    >
      <p class="text-sm font-medium">Finished {data.sourceName}.</p>
      <p class="mt-1 text-sm text-[var(--color-muted)]">
        {sentIds.length} of {data.members.length} logged.
      </p>
      <a
        href="/outreach"
        class="mt-4 inline-flex rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)]"
        >Back to templates</a
      >
    </div>
  {:else if person}
    <div class="flex items-center justify-between text-xs text-[var(--color-muted)]">
      <span>{index + 1} of {data.members.length}</span>
      {#if sentIds.includes(person.id)}
        <span class="inline-flex items-center gap-1 text-[var(--color-success)]">
          <Check size={12} strokeWidth={2} /> Already logged
        </span>
      {/if}
    </div>

    <div
      class="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <div>
        <a
          href={toCompany ? `/companies/${person.id}` : `/people/${person.id}`}
          class="text-base font-semibold hover:underline">{person.name}</a
        >
        {#if subtitle}
          <p class="text-xs text-[var(--color-muted)]">{subtitle}</p>
        {/if}
      </div>

      {#if rendered[index]?.unresolved.length}
        <p
          class="rounded-[var(--radius-md)] border border-[var(--color-warning)] bg-[var(--color-warning-bg)] px-3 py-2 text-xs"
        >
          Nothing on file for
          <span class="font-mono">{rendered[index].unresolved.join(', ')}</span>.
        </p>
      {/if}

      {#if spec.hasSubject}
        <label class="flex flex-col gap-1">
          <span class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]"
            >Subject</span
          >
          <input
            value={current.subject}
            oninput={(e) => edit('subject', (e.currentTarget as HTMLInputElement).value)}
            type="text"
            class="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm"
          />
        </label>
      {/if}

      {#snippet bodyHeading()}
        <span
          class="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]"
        >
          <span>Message</span>
          <span
            class={spec.bodyMax !== null && bodyPlain.length > spec.bodyMax
              ? 'text-[var(--color-danger)]'
              : ''}>{bodyPlain.length}{spec.bodyMax !== null ? `/${spec.bodyMax}` : ''}</span
          >
        </span>
      {/snippet}

      {#if rich}
        <!-- A div rather than a label: RichText renders a contenteditable. -->
        <div class="flex flex-col gap-1">
          {@render bodyHeading()}
          <!-- Keyed on the person, so stepping the queue reseeds the editor
               with the next message instead of keeping the previous one. -->
          {#key person.id}
            <RichText
              value={current.body}
              showActions={false}
              placeholder="Your message"
              onInput={(html) => edit('body', html)}
            />
          {/key}
        </div>
      {:else}
        <label class="flex flex-col gap-1">
          {@render bodyHeading()}
          <textarea
            value={current.body}
            oninput={(e) => edit('body', (e.currentTarget as HTMLTextAreaElement).value)}
            rows="9"
            class="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm leading-relaxed"
          ></textarea>
        </label>
      {/if}

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onclick={copy}
          class="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)]"
        >
          {#if copied}
            <Check size={14} strokeWidth={2} /> Copied
          {:else}
            <Copy size={14} strokeWidth={2} /> Copy
          {/if}
        </button>
        {#if link}
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-sm"
          >
            <ExternalLink size={14} strokeWidth={2} />
            {link.label}
          </a>
        {/if}
        <!-- Copy and Mark as sent stay two deliberate steps here too. A queue
             is exactly where a one-click shortcut would log messages nobody
             sent. -->
        <button
          type="button"
          onclick={markSent}
          disabled={sending}
          class="ml-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-sm disabled:opacity-60"
          >{sending ? 'Logging…' : 'Mark as sent'}</button
        >
      </div>
    </div>

    <div class="flex items-center justify-between">
      <button
        type="button"
        onclick={prev}
        disabled={index === 0}
        class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-sm disabled:opacity-40"
      >
        <ArrowLeft size={14} strokeWidth={2} /> Previous
      </button>
      <button
        type="button"
        onclick={next}
        class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-sm"
      >
        <SkipForward size={14} strokeWidth={2} /> Skip
        <ArrowRight size={14} strokeWidth={2} />
      </button>
    </div>
  {/if}
</div>
