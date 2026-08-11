<script lang="ts">
  import { onMount } from 'svelte';
  import { Bold, Italic, Link2, List, ListOrdered } from 'lucide-svelte';
  import { toEditorHtml } from '$lib/richText';
  import { sanitizeToDOMFragment } from './pasteFilter';
  import type Squire from 'squire-rte';

  type Props = {
    /** Stored value. Plain text from before the editor existed is converted on load. */
    value: string | null;
    placeholder?: string;
    onCommit?: () => Promise<void> | void;
    onCancel?: () => void;
    saving?: boolean;
    /**
     * Own the Save/Cancel row, or leave it to the parent. Off when this sits
     * inside a larger form that has its own submit — the parent then reads the
     * value with `getHtml()` at submit time.
     */
    showActions?: boolean;
    /** Fires on every edit, for a live preview. */
    onInput?: (html: string) => void;
  };

  let {
    value,
    placeholder = 'Write something…',
    onCommit,
    onCancel,
    saving = false,
    showActions = true,
    onInput
  }: Props = $props();

  let rootEl = $state<HTMLDivElement | undefined>(undefined);
  let editor: Squire | undefined;
  // svelte-ignore state_referenced_locally
  // Seeded once, then owned by `refreshState` off Squire's own input events —
  // the editor's DOM is the source of truth for emptiness after mount, not the
  // prop it was initialised from.
  let empty = $state(!value);
  let active = $state({ bold: false, italic: false, ul: false, ol: false });
  let linkOpen = $state(false);
  let linkUrl = $state('');
  let linkInputEl = $state<HTMLInputElement | undefined>(undefined);

  /**
   * The current HTML. Read by the parent on save rather than pushed through a
   * binding: Squire owns the DOM, and mirroring every keystroke into Svelte
   * state would fight its undo stack for no benefit.
   */
  export function getHtml(): string {
    return editor?.getHTML() ?? '';
  }

  export function focus(): void {
    editor?.focus();
  }

  /**
   * Replace the content. For programmatic edits from the parent — inserting a
   * variable token, say. `value` seeds the editor once on mount and is not
   * watched afterwards, because Squire owns the DOM from then on.
   */
  export function setHtml(html: string): void {
    editor?.setHTML(html);
    refreshState();
  }

  function refreshState() {
    if (!editor) return;
    // Squire normalises to B/I, which is also what `sanitize.ts` maps back to
    // strong/em on write.
    active = {
      bold: editor.hasFormat('B'),
      italic: editor.hasFormat('I'),
      ul: editor.hasFormat('UL'),
      ol: editor.hasFormat('OL')
    };
    const html = editor.getHTML();
    empty = !html.replace(/<[^>]+>|&nbsp;|\s/g, '');
    onInput?.(html);
  }

  function toggle(on: boolean, apply: () => void, remove: () => void) {
    if (on) remove();
    else apply();
    editor?.focus();
    refreshState();
  }

  function applyLink() {
    const url = linkUrl.trim();
    if (url) {
      // A bare domain is what people paste; without a scheme Squire writes a
      // relative href and the link points inside the app.
      editor?.makeLink(/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`);
    }
    linkOpen = false;
    linkUrl = '';
    editor?.focus();
  }

  onMount(() => {
    // Squire touches `document` at construction, so it can never be imported at
    // module scope — SSR would break on every page that renders a notes field.
    let disposed = false;
    let instance: Squire | undefined;

    (async () => {
      const { default: SquireCtor } = await import('squire-rte');
      if (disposed || !rootEl) return;
      // blockTag defaults to DIV, which `sanitize.ts` strips — every paragraph
      // would vanish on save.
      instance = new SquireCtor(rootEl, { blockTag: 'P', sanitizeToDOMFragment });
      instance.setHTML(toEditorHtml(value));
      instance.addEventListener('input', refreshState);
      instance.addEventListener('pathChange', refreshState);
      editor = instance;
      refreshState();
      instance.focus();
    })();

    return () => {
      disposed = true;
      instance?.destroy();
      editor = undefined;
    };
  });

  function onKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onCommit?.();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      // Stop here rather than letting it reach `layerStack`: when this editor
      // sits inside a Dialog, Escape should abandon the edit, not close the
      // surface the edit lives on.
      e.stopPropagation();
      if (linkOpen) {
        linkOpen = false;
        editor?.focus();
      } else {
        onCancel?.();
      }
    }
  }
</script>

<div class="flex flex-col gap-2">
  <div
    class="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]"
  >
    <div
      class="flex items-center gap-0.5 border-b border-[var(--color-border)] px-1.5 py-1"
      role="toolbar"
      aria-label="Formatting"
    >
      {#snippet toolButton(
        label: string,
        on: boolean,
        icon: typeof Bold,
        run: () => void
      )}
        {@const Icon = icon}
        <button
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={on}
          onclick={run}
          class="rounded-[var(--radius-sm)] p-1.5 transition-colors {on
            ? 'bg-[var(--color-bg)] text-[var(--color-text)]'
            : 'text-[var(--color-subtle)] hover:bg-[var(--color-bg)]'}"
        >
          <Icon size={14} strokeWidth={2} />
        </button>
      {/snippet}

      {@render toolButton('Bold', active.bold, Bold, () =>
        toggle(active.bold, () => editor?.bold(), () => editor?.removeBold())
      )}
      {@render toolButton('Italic', active.italic, Italic, () =>
        toggle(active.italic, () => editor?.italic(), () => editor?.removeItalic())
      )}
      {@render toolButton('Bulleted list', active.ul, List, () =>
        toggle(active.ul, () => editor?.makeUnorderedList(), () => editor?.removeList())
      )}
      {@render toolButton('Numbered list', active.ol, ListOrdered, () =>
        toggle(active.ol, () => editor?.makeOrderedList(), () => editor?.removeList())
      )}
      {@render toolButton('Link', linkOpen, Link2, () => {
        linkOpen = !linkOpen;
        if (linkOpen) setTimeout(() => linkInputEl?.focus(), 0);
      })}
    </div>

    {#if linkOpen}
      <div class="flex items-center gap-1.5 border-b border-[var(--color-border)] px-1.5 py-1.5">
        <input
          bind:this={linkInputEl}
          bind:value={linkUrl}
          type="url"
          placeholder="https://…"
          onkeydown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              applyLink();
            }
          }}
          class="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs"
        />
        <button
          type="button"
          onclick={applyLink}
          class="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1 text-xs"
          >Apply</button
        >
      </div>
    {/if}

    <div class="relative">
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        bind:this={rootEl}
        onkeydown={onKeydown}
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        tabindex="0"
        class="prose prose-sm max-w-none min-h-32 px-3 py-2 text-sm leading-relaxed text-[var(--color-text)] focus:outline-none [&_a]:text-[var(--color-text)]"
      ></div>
      {#if empty}
        <span
          class="pointer-events-none absolute left-3 top-2 text-sm text-[var(--color-subtle)]"
          aria-hidden="true">{placeholder}</span
        >
      {/if}
    </div>
  </div>

  {#if showActions}
    <div class="flex items-center gap-2 text-xs">
      <button
        type="button"
        onclick={() => onCommit?.()}
        disabled={saving}
        class="rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-1.5 font-medium text-[var(--color-accent-fg)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
        >{saving ? 'Saving…' : 'Save'}</button
      >
      <button
        type="button"
        onclick={() => onCancel?.()}
        class="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5"
        >Cancel</button
      >
      <span class="ml-auto text-[var(--color-subtle)]">⌘↩ to save · esc to cancel</span>
    </div>
  {/if}
</div>
