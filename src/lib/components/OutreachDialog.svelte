<script lang="ts">
  import Dialog from '$lib/ui/Dialog.svelte';
  import MessageComposer from '$lib/components/MessageComposer.svelte';
  import Select from '$lib/ui/Select.svelte';
  import { toast } from '$lib/toasts.svelte';
  import { PLATFORMS, isRichPlatform, type OutreachPlatform } from '$lib/outreach/platforms';
  import { type LinkTarget } from '$lib/outreach/deepLink';
  import { logSend } from '$lib/outreach/logSend';
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
  let sending = $state(false);
  let sent = $state(false);

  /**
   * The edited message. Rendering happens once on selection rather than on
   * every keystroke: from that point the user owns the text, and re-rendering
   * would throw away their edits.
   */
  let subjectDraft = $state('');
  let bodyDraft = $state('');
  let remindDays = $state<number | null>(null);

  const selected = $derived(templates.find((t) => t.id === selectedId) ?? null);

  /** Unresolved names, computed against the template rather than the edit. */
  let unresolved = $state<string[]>([]);

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
    // `copied` lives in MessageComposer now and clears itself on its own 2s
    // timer. `sent` stays here because it gates this dialog's own button.
    sent = false;
  }

  async function markSent() {
    if (!selected || sending) return;
    sending = true;
    try {
      const result = await logSend({
        templateId: selected.id,
        personId: person.id,
        subject: subjectDraft,
        body: bodyDraft,
        remindInDays: remindDays
      });
      if (!result.ok) {
        toast.danger('Could not log it');
        return;
      }
      sent = true;
      toast.success(
        result.reminderId
          ? `Logged — reminder set for ${remindDays} days`
          : 'Logged as an interaction'
      );
      onSent?.();
      onclose();
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
          <div class="flex flex-col gap-1">
            <span class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]"
              >Template</span
            >
            <Select
              size="md"
              label="Template"
              placeholder="Pick a template…"
              value={selectedId ?? ''}
              options={templates.map((t) => ({
                value: t.id,
                label: t.name,
                hint: PLATFORMS[t.platform].label
              }))}
              onchange={choose}
              class="w-full"
            />
          </div>
        {/if}

        {#if selected}
          <MessageComposer
            platform={selected.platform}
            {person}
            subject={subjectDraft}
            body={bodyDraft}
            {unresolved}
            seedKey={selected.id}
            onEdit={(field, value) =>
              field === 'subject' ? (subjectDraft = value) : (bodyDraft = value)}
          >
            {#snippet actions()}
              <!-- Copy and Mark as sent stay two deliberate steps. -->
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
            {/snippet}
          </MessageComposer>

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
