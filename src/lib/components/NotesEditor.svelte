<script lang="ts">
  import { Pencil } from 'lucide-svelte';

  type Props = {
    value: string | null;
    placeholder?: string;
    onSave: (next: string) => Promise<void> | void;
    saveLabel?: string;
  };

  let { value, placeholder = 'Add notes…', onSave, saveLabel = 'Save' }: Props = $props();

  // svelte-ignore state_referenced_locally
  let draft = $state(value ?? '');
  let editing = $state(false);
  let saving = $state(false);
  let textareaEl = $state<HTMLTextAreaElement | undefined>(undefined);

  async function commit() {
    if (saving) return;
    saving = true;
    try {
      await onSave(draft);
      editing = false;
    } finally {
      saving = false;
    }
  }

  function cancel() {
    draft = value ?? '';
    editing = false;
  }

  function startEditing() {
    draft = value ?? '';
    editing = true;
    setTimeout(() => textareaEl?.focus(), 0);
  }
</script>

<div class="flex flex-col gap-2">
  {#if editing}
    <textarea
      bind:this={textareaEl}
      bind:value={draft}
      rows="6"
      {placeholder}
      onkeydown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      }}
      class="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm leading-relaxed"
    ></textarea>
    <div class="flex items-center gap-2 text-xs">
      <button
        type="button"
        onclick={commit}
        disabled={saving}
        class="rounded-[var(--radius-sm)] bg-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-hover)] px-3 py-1.5 font-medium text-[var(--color-accent-fg)] disabled:opacity-60"
      >{saving ? 'Saving…' : saveLabel}</button>
      <button
        type="button"
        onclick={cancel}
        class="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5"
      >Cancel</button>
      <span class="ml-auto text-[var(--color-subtle)]">⌘↩ to save · esc to cancel</span>
    </div>
  {:else}
    <button
      type="button"
      onclick={startEditing}
      aria-label={value ? 'Edit notes' : 'Add notes'}
      class="group flex w-full items-start gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left text-sm leading-relaxed transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg)]"
    >
      <span class="min-w-0 flex-1">
        {#if value}
          <div class="prose prose-sm max-w-none whitespace-pre-wrap text-[var(--color-text)] [&_a]:text-[var(--color-text)]">
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
