<script lang="ts">
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
      class="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm leading-relaxed"
    ></textarea>
    <div class="flex items-center gap-2">
      <button
        type="button"
        onclick={commit}
        disabled={saving}
        class="rounded-[var(--radius-sm)] bg-[var(--color-product)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
      >{saving ? 'Saving…' : saveLabel}</button>
      <button
        type="button"
        onclick={cancel}
        class="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-xs"
      >Cancel</button>
    </div>
  {:else}
    <button
      type="button"
      onclick={startEditing}
      class="group rounded-[var(--radius-md)] border border-dashed border-transparent px-3 py-2 text-left text-sm leading-relaxed hover:border-[var(--color-border)]"
    >
      {#if value}
        <div class="prose prose-sm max-w-none text-[var(--color-text)] [&_a]:text-[var(--color-product)]">
          {@html value}
        </div>
      {:else}
        <span class="text-[var(--color-subtle)]">{placeholder}</span>
      {/if}
    </button>
  {/if}
</div>
