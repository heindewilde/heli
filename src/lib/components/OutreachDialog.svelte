<script lang="ts">
  import Dialog from '$lib/ui/Dialog.svelte';
  import RichText from '$lib/ui/RichText.svelte';
  import { Copy, Check, ExternalLink, ChevronDown } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';
  import { copyRich, copyText } from '$lib/client/clipboard';
  import { htmlToPlain } from '$lib/richText';
  import { PLATFORMS, isRichPlatform, type OutreachPlatform } from '$lib/outreach/platforms';
  import { PLATFORM_ICONS } from '$lib/outreach/platformIcons';
  import { deepLinkFor, type LinkTarget } from '$lib/outreach/deepLink';
  import { renderFor, type Recipient, type Sender } from '$lib/outreach/render';

  type Template = {
    id: string;
    name: string;
    platform: OutreachPlatform;
    subject: string | null;
    body: string;
    nudgeDays: number | null;
  };

  type Props = {
    open: boolean;
    person: Recipient & LinkTarget & { id: string };
    sender: Sender;
    /** Preselect a template — used when opening from a pipeline stage. */
    templateId?: string | null;
    onclose: () => void;
    /** Fires after a send is logged, so the caller can refresh its timeline. */
    onSent?: () => void;
  };

  let { open, person, sender, templateId = null, onclose, onSent }: Props = $props();

  let templates = $state<Template[]>([]);
  let loading = $state(true);
  // svelte-ignore state_referenced_locally
  // A preselection, not a binding: once the dialog is open the user owns the
  // choice, and re-reading the prop would yank it back on any parent update.
  let selectedId = $state<string | null>(templateId);
  let copied = $state(false);
  let sending = $state(false);
  let sent = $state(false);
  let plainOnly = $state(false);

  /**
   * The edited message. Rendering happens once on selection rather than on
   * every keystroke: from that point the user owns the text, and re-rendering
   * would throw away their edits.
   */
  let subjectDraft = $state('');
  let bodyDraft = $state('');
  let remindDays = $state<number | null>(null);

  const selected = $derived(templates.find((t) => t.id === selectedId) ?? null);
  const spec = $derived(selected ? PLATFORMS[selected.platform] : null);
  const rich = $derived(selected ? isRichPlatform(selected.platform) : false);

  /** Unresolved names, computed against the template rather than the edit. */
  let unresolved = $state<string[]>([]);

  /**
   * The plain-text flavour: the clipboard's `text/plain`, the `mailto:` body,
   * and what the character budget counts. LinkedIn's 300 is 300 characters of
   * message, not of markup.
   */
  const bodyPlain = $derived(rich ? htmlToPlain(bodyDraft) : bodyDraft);
  const bodyCount = $derived(bodyPlain.length);
  const overBudget = $derived(spec?.bodyMax != null && bodyCount > spec.bodyMax);

  const link = $derived(
    selected
      ? deepLinkFor(selected.platform, person, { subject: subjectDraft, body: bodyPlain })
      : null
  );

  $effect(() => {
    if (!open) return;
    loading = true;
    fetch('/api/outreach')
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j: { items: Template[] }) => {
        templates = j.items ?? [];
        // A preselected id (from a pipeline stage) and a library of exactly one
        // both mean "this is the template" — either way the drafts have to be
        // filled, which only `choose` does.
        const auto = selectedId ?? (templates.length === 1 ? templates[0].id : null);
        if (auto) choose(auto);
      })
      .catch(() => (templates = []))
      .finally(() => (loading = false));
  });

  /** Fill the drafts from the template. Runs on selection, never on edit. */
  function choose(id: string) {
    selectedId = id;
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    // An email body stays HTML the whole way through — flattening it here is
    // what silently discarded the bold and links the template was authored
    // with. Merge values are escaped for that context; a plain platform must
    // not be, or a LinkedIn message ends up containing `&amp;`.
    const escapeHtml = isRichPlatform(t.platform);
    const body = renderFor(t.body, person, sender, { escapeHtml });
    // The subject is plain text on every platform that has one.
    const subject = t.subject ? renderFor(t.subject, person, sender) : null;
    bodyDraft = body.text;
    subjectDraft = subject?.text ?? '';
    unresolved = [...new Set([...(subject?.unresolved ?? []), ...body.unresolved])];
    remindDays = t.nudgeDays;
    copied = false;
    sent = false;
  }

  async function copy() {
    if (!selected) return;
    // The whole message, subject included — pasting into a mail client without
    // the subject would silently drop half of what was written.
    const plain = spec?.hasSubject && subjectDraft ? `${subjectDraft}\n\n${bodyPlain}` : bodyPlain;
    // The HTML flavour is the editor's own markup, so formatting survives the
    // paste into a mail client.
    const result = rich ? await copyRich(bodyDraft, plain) : await copyText(plain);

    if (result === 'failed') {
      toast.danger('Could not reach the clipboard');
      return;
    }
    plainOnly = result === 'plain-only' && rich;
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }

  async function markSent() {
    if (!selected || sending) return;
    sending = true;
    try {
      const res = await fetch('/api/outreach/sent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          templateId: selected.id,
          personId: person.id,
          subject: subjectDraft,
          body: bodyDraft,
          remindInDays: remindDays
        })
      });
      if (!res.ok) {
        toast.danger('Could not log it');
        return;
      }
      const { reminderId } = (await res.json()) as { reminderId: string | null };
      sent = true;
      toast.success(
        reminderId ? `Logged — reminder set for ${remindDays} days` : 'Logged as an interaction'
      );
      onSent?.();
      onclose();
    } catch {
      toast.danger('Could not log it');
    } finally {
      sending = false;
    }
  }
</script>

{#if open}
  <Dialog {open} {onclose} label="Outreach to {person.name}" panelClass="max-w-2xl">
    {#snippet children({ close })}
      <div class="flex flex-col gap-4 p-4">
        <header class="flex items-start justify-between gap-3">
          <div>
            <h2 class="text-base font-semibold">Outreach to {person.name}</h2>
            <p class="mt-0.5 text-xs text-[var(--color-muted)]">
              Heli copies the message. You send it.
            </p>
          </div>
        </header>

        {#if loading}
          <p class="text-sm text-[var(--color-muted)]">Loading templates…</p>
        {:else if templates.length === 0}
          <p
            class="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted)]"
          >
            No templates yet.
            <a href="/outreach/new" class="underline">Write one</a>.
          </p>
        {:else}
          <label class="flex flex-col gap-1">
            <span class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]"
              >Template</span
            >
            <span class="relative">
              <select
                value={selectedId ?? ''}
                onchange={(e) => choose((e.currentTarget as HTMLSelectElement).value)}
                class="h-9 w-full appearance-none rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 pr-8 text-sm"
              >
                <option value="" disabled>Pick a template…</option>
                {#each templates as t (t.id)}
                  <option value={t.id}>{t.name} · {PLATFORMS[t.platform].label}</option>
                {/each}
              </select>
              <span
                class="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[var(--color-subtle)]"
              >
                <ChevronDown size={14} strokeWidth={2} />
              </span>
            </span>
          </label>
        {/if}

        {#if selected && spec}
          {@const Icon = PLATFORM_ICONS[selected.platform]}

          {#if unresolved.length > 0}
            <p
              class="rounded-[var(--radius-md)] border border-[var(--color-warning)] bg-[var(--color-warning-bg)] px-3 py-2 text-xs"
            >
              Nothing on file for <span class="font-mono">{unresolved.join(', ')}</span>. Fill it in
              below before you copy.
            </p>
          {/if}

          {#if spec.hasSubject}
            <label class="flex flex-col gap-1">
              <span
                class="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]"
              >
                <span>Subject</span>
                {#if spec.subjectMax !== undefined}
                  <span
                    class={subjectDraft.length > spec.subjectMax
                      ? 'text-[var(--color-danger)]'
                      : ''}>{subjectDraft.length}/{spec.subjectMax}</span
                  >
                {/if}
              </span>
              <input
                bind:value={subjectDraft}
                type="text"
                class="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm"
              />
            </label>
          {/if}

          {#snippet bodyHeading()}
            <span
              class="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]"
            >
              <span class="inline-flex items-center gap-1.5">
                <Icon size={12} strokeWidth={2} />
                {spec.label}
              </span>
              <span class={overBudget ? 'text-[var(--color-danger)]' : ''}>
                {bodyCount}{spec.bodyMax !== null ? `/${spec.bodyMax}` : ''}
              </span>
            </span>
          {/snippet}

          {#if rich}
            <!-- A div, not a label: RichText renders a contenteditable, which a
                 label has nothing to associate with. Its own aria-label names it. -->
            <div class="flex flex-col gap-1">
              {@render bodyHeading()}
              <!-- Keyed on the template so switching selection remounts the
                   editor: `value` seeds Squire once and it owns the DOM after. -->
              {#key selected.id}
                <RichText
                  value={bodyDraft}
                  showActions={false}
                  placeholder="Your message"
                  onInput={(html) => (bodyDraft = html)}
                />
              {/key}
            </div>
          {:else}
            <label class="flex flex-col gap-1">
              {@render bodyHeading()}
              <textarea
                bind:value={bodyDraft}
                rows="10"
                class="rounded-[var(--radius-md)] border bg-[var(--color-surface)] px-3 py-2 text-sm leading-relaxed {overBudget
                  ? 'border-[var(--color-danger)]'
                  : 'border-[var(--color-border)]'}"
              ></textarea>
            </label>
          {/if}

          {#if overBudget}
            <p class="text-xs text-[var(--color-danger)]">
              {spec.label} cuts off at {spec.bodyMax?.toLocaleString()} characters.
            </p>
          {/if}

          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onclick={copy}
              class="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] transition-colors hover:bg-[var(--color-accent-hover)]"
            >
              {#if copied}
                <Check size={14} strokeWidth={2} /> Copied
              {:else}
                <Copy size={14} strokeWidth={2} /> Copy message
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

            <span class="ml-auto flex items-center gap-2">
              <button
                type="button"
                onclick={markSent}
                disabled={sending || sent}
                class="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-sm disabled:opacity-60"
                >{sending ? 'Logging…' : 'Mark as sent'}</button
              >
              <button
                type="button"
                onclick={close}
                class="rounded-[var(--radius-sm)] px-2 py-1.5 text-sm text-[var(--color-muted)]"
                >Close</button
              >
            </span>
          </div>

          {#if plainOnly}
            <p class="text-xs text-[var(--color-muted)]">
              Copied as plain text — this browser would not take formatted content. Over plain HTTP,
              a secure origin is required for that.
            </p>
          {/if}
          {#if link?.truncates}
            <p class="text-xs text-[var(--color-muted)]">
              This message is long enough that some mail apps will truncate the link. Copying and
              pasting is safer.
            </p>
          {/if}

          <label class="flex items-center gap-2 text-xs text-[var(--color-muted)]">
            <span>Remind me to follow up in</span>
            <input
              type="number"
              min="0"
              max="365"
              value={remindDays ?? ''}
              oninput={(e) => {
                const raw = (e.currentTarget as HTMLInputElement).value;
                remindDays = raw === '' ? null : Number(raw);
              }}
              class="h-7 w-16 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2"
            />
            <span>days — leave blank for none.</span>
          </label>
        {/if}
      </div>
    {/snippet}
  </Dialog>
{/if}
