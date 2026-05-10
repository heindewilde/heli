<script lang="ts">
  import { enhance } from '$app/forms';

  let { form } = $props();
  let submitting = $state(false);

  const inputClass =
    'rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2';
</script>

<article class="mx-auto flex max-w-2xl flex-col gap-4">
  <header>
    <h1 class="text-2xl font-semibold tracking-tight">New collection</h1>
    <p class="text-sm text-[var(--color-muted)]">
      A collection is a named group of people and companies — useful for ad-hoc lists like "warm intros" or "speakers I follow". You can add members on the next page.
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
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-[var(--color-muted)]">Name *</span>
      <input name="name" required maxlength="200" class={inputClass} />
    </label>

    <label class="flex flex-col gap-1 text-sm">
      <span class="text-[var(--color-muted)]">Description</span>
      <textarea name="description" rows="3" class={inputClass}></textarea>
    </label>

    {#if form?.error}
      <p class="rounded-[var(--radius-sm)] border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3 py-2 text-sm text-[var(--color-danger)]">
        {form.error}
      </p>
    {/if}

    <div class="flex items-center gap-2">
      <button
        type="submit"
        disabled={submitting}
        class="rounded-[var(--radius-sm)] bg-[var(--color-product)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >{submitting ? 'Saving…' : 'Save collection'}</button>
      <a href="/collections" class="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-4 py-2 text-sm">Cancel</a>
    </div>
  </form>
</article>
