<script lang="ts">
  /**
   * The editable message: warning strip, subject, body, counter, Copy, deep link.
   *
   * This existed twice — once in `OutreachDialog` and once on the bulk run
   * screen — down to the same `bodyPlain` derivation, the same subject-plus-body
   * clipboard payload, the same `{#key}` around the rich editor and the same
   * "Nothing on file for…" strip. The two copies had already drifted in the ways
   * copies do: one textarea was nine rows and the other ten, one sat on
   * `--color-bg` and the other on `--color-surface`, one labelled its body
   * "Message" and the other named the platform, and only one told you when the
   * clipboard had fallen back to plain text. None of those were decisions, so
   * this keeps the better half of each.
   *
   * What stays at the call site is what genuinely differs: how a template is
   * chosen, and what "sent" means — closing a dialog versus stepping a queue.
   * Those arrive through the `actions` snippet.
   */
  import RichText from '$lib/ui/RichText.svelte';
  import { Copy, Check, ExternalLink } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';
  import { copyRich, copyText } from '$lib/client/clipboard';
  import { htmlToPlain } from '$lib/richText';
  import { PLATFORMS, isRichPlatform, type OutreachPlatform } from '$lib/outreach/platforms';
  import { PLATFORM_ICONS } from '$lib/outreach/platformIcons';
  import { deepLinkFor, type LinkTarget } from '$lib/outreach/deepLink';
  import type { Snippet } from 'svelte';

  type Props = {
    platform: OutreachPlatform;
    /** Who the message is for — supplies the deep link's address or handle. */
    person: LinkTarget;
    subject: string;
    body: string;
    /** Merge fields with nothing behind them, warned about above the fields. */
    unresolved: string[];
    /**
     * Remounts the rich editor when it changes. Squire seeds from `value` once
     * and owns the DOM afterwards, so without this, switching template (dialog)
     * or stepping to the next person (run screen) leaves the previous message
     * on screen.
     */
    seedKey: string;
    onEdit: (field: 'subject' | 'body', value: string) => void;
    /** Trailing buttons — "Mark as sent" and whatever else the screen needs. */
    actions?: Snippet;
  };

  let { platform, person, subject, body, unresolved, seedKey, onEdit, actions }: Props = $props();

  const spec = $derived(PLATFORMS[platform]);
  const rich = $derived(isRichPlatform(platform));

  /**
   * The plain-text flavour: the clipboard's `text/plain`, the `mailto:` body,
   * and what the character budget counts. LinkedIn's 300 is 300 characters of
   * message, not of markup.
   */
  const bodyPlain = $derived(rich ? htmlToPlain(body) : body);
  const bodyCount = $derived(bodyPlain.length);
  const overBudget = $derived(spec.bodyMax != null && bodyCount > spec.bodyMax);

  const link = $derived(deepLinkFor(platform, person, { subject, body: bodyPlain }));

  let copied = $state(false);
  let plainOnly = $state(false);

  async function copy() {
    // The whole message, subject included — pasting into a mail client without
    // the subject would silently drop half of what was written.
    const plain = spec.hasSubject && subject ? `${subject}\n\n${bodyPlain}` : bodyPlain;
    // The HTML flavour is the editor's own markup, so formatting survives the
    // paste into a mail client.
    const result = rich ? await copyRich(body, plain) : await copyText(plain);

    if (result === 'failed') {
      toast.danger('Could not reach the clipboard');
      return;
    }
    plainOnly = result === 'plain-only' && rich;
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }
</script>

{#if unresolved.length > 0}
  <p
    class="rounded-[var(--radius-md)] border border-[var(--color-warning)] bg-[var(--color-warning-bg)] px-3 py-2 text-xs"
  >
    Nothing on file for <span class="font-mono">{unresolved.join(', ')}</span>. Fill it in below
    before you copy.
  </p>
{/if}

{#if spec.hasSubject}
  <label class="flex flex-col gap-1">
    <span
      class="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]"
    >
      <span>Subject</span>
      {#if spec.subjectMax !== undefined}
        <span class={subject.length > spec.subjectMax ? 'text-[var(--color-danger)]' : ''}
          >{subject.length}/{spec.subjectMax}</span
        >
      {/if}
    </span>
    <input
      value={subject}
      oninput={(e) => onEdit('subject', (e.currentTarget as HTMLInputElement).value)}
      type="text"
      class="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm"
    />
  </label>
{/if}

{#snippet bodyHeading()}
  {@const Icon = PLATFORM_ICONS[platform]}
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
  <!-- A div, not a label: RichText renders a contenteditable, which a label has
       nothing to associate with. Its own aria-label names it. -->
  <div class="flex flex-col gap-1">
    {@render bodyHeading()}
    {#key seedKey}
      <RichText
        value={body}
        showActions={false}
        placeholder="Your message"
        onInput={(html) => onEdit('body', html)}
      />
    {/key}
  </div>
{:else}
  <label class="flex flex-col gap-1">
    {@render bodyHeading()}
    <textarea
      value={body}
      oninput={(e) => onEdit('body', (e.currentTarget as HTMLTextAreaElement).value)}
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

  {#if actions}
    <span class="ml-auto flex items-center gap-2">{@render actions()}</span>
  {/if}
</div>

{#if plainOnly}
  <p class="text-xs text-[var(--color-muted)]">
    Copied as plain text — this browser would not take formatted content. Over plain HTTP, a secure
    origin is required for that.
  </p>
{/if}
{#if link?.truncates}
  <p class="text-xs text-[var(--color-muted)]">
    This message is long enough that some mail apps will truncate the link. Copying and pasting is
    safer.
  </p>
{/if}
