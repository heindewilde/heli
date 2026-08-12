<script lang="ts">
  import { Pencil } from 'lucide-svelte';
  import RichText from '$lib/ui/RichText.svelte';
  import { hasBlockMarkup } from '$lib/richText';
  // The read view renders the same markup the editor produces, so it needs the
  // same typography. Importing it twice is free — Vite dedupes the module.
  import '$lib/ui/richText.css';

  type Props = {
    value: string | null;
    placeholder?: string;
    onSave: (next: string) => Promise<void> | void;
  };

  let { value, placeholder = 'Add notes…', onSave }: Props = $props();

  let editing = $state(false);
  let saving = $state(false);
  let editorRef = $state<ReturnType<typeof RichText> | undefined>(undefined);

  /**
   * Values written before the rich editor existed are plain text whose line
   * breaks live in `\n`. `whitespace-pre-wrap` is what rendered them; applying
   * it to real paragraph markup doubles every gap instead.
   */
  const legacyPlainText = $derived(!hasBlockMarkup(value));

  async function commit() {
    if (saving) return;
    saving = true;
    try {
      await onSave(editorRef?.getHtml() ?? '');
      editing = false;
    } finally {
      saving = false;
    }
  }
</script>

<div class="flex flex-col gap-2">
  {#if editing}
    <RichText
      bind:this={editorRef}
      {value}
      {placeholder}
      {saving}
      onCommit={commit}
      onCancel={() => (editing = false)}
    />
  {:else}
    <button
      type="button"
      onclick={() => (editing = true)}
      aria-label={value ? 'Edit notes' : 'Add notes'}
      class="group flex w-full items-start gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left text-sm leading-relaxed transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg)]"
    >
      <span class="min-w-0 flex-1">
        {#if value}
          <div
            class="rich-text [&_a]:text-[var(--color-text)] {legacyPlainText
              ? 'whitespace-pre-wrap'
              : ''}"
          >
            {@html value}
          </div>
        {:else}
          <span class="text-[var(--color-subtle)]">{placeholder}</span>
        {/if}
      </span>
      <Pencil
        size={12}
        strokeWidth={2}
        class="mt-1 shrink-0 text-[var(--color-subtle)] opacity-60 transition-opacity group-hover:opacity-100"
      />
    </button>
  {/if}
</div>
