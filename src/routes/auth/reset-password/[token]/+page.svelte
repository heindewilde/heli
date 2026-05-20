<script lang="ts">
  import { APP_NAME } from '$lib/branding';
  let { form } = $props();
</script>

<svelte:head>
  <title>Reset password — {APP_NAME}</title>
</svelte:head>

<section class="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-sm flex-col justify-center gap-4 px-6">
  <h1 class="text-2xl font-semibold tracking-tight">Choose a new password</h1>

  <form method="POST" class="flex flex-col gap-3">
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-[var(--color-muted)]">New password</span>
      <input
        name="password"
        type="password"
        required
        minlength="8"
        maxlength="72"
        autocomplete="new-password"
        class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
      />
    </label>

    {#if form?.error}
      <p class="rounded-[var(--radius-sm)] border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3 py-2 text-sm text-[var(--color-danger)]">
        {form.error}
      </p>
    {/if}

    <button
      type="submit"
      class="rounded-[var(--radius-sm)] bg-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-hover)] px-3 py-2 text-sm font-medium text-[var(--color-accent-fg)]"
    >Update password</button>
  </form>

  <a href="/auth" class="inline-block py-2 text-xs text-[var(--color-muted)] hover:underline">← Back to sign in</a>
</section>
