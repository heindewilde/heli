<script lang="ts">
  import { enhance } from '$app/forms';

  let { form } = $props();
  let submitting = $state(false);

  const inputClass =
    'rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2';
</script>

<article class="mx-auto flex max-w-xl flex-col gap-4">
  <header>
    <h1 class="text-2xl font-semibold tracking-tight">New person</h1>
    <p class="text-sm text-[var(--color-muted)]">
      Fill in what you know — you can also paste a profile link in the topbar instead.
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
      <input name="name" required class={inputClass} />
    </label>
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-[var(--color-muted)]">Role</span>
      <input name="role" class={inputClass} />
    </label>
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-[var(--color-muted)]">Email</span>
      <input name="email" type="email" class={inputClass} />
    </label>
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-[var(--color-muted)]">Phone</span>
      <input name="phone" class={inputClass} />
    </label>
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-[var(--color-muted)]">Location</span>
      <input name="location" class={inputClass} />
    </label>
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-[var(--color-muted)]">Notes</span>
      <textarea name="notes" rows="4" class={inputClass}></textarea>
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
      >{submitting ? 'Saving…' : 'Save person'}</button>
      <a href="/people" class="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-4 py-2 text-sm">Cancel</a>
    </div>
  </form>
</article>
