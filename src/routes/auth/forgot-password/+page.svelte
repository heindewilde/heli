<script lang="ts">
  let { form } = $props();
</script>

<section class="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-sm flex-col justify-center gap-4 px-6">
  <h1 class="text-2xl font-semibold tracking-tight">Reset your password</h1>
  <p class="text-sm text-[var(--color-muted)]">
    Enter the email on your account. If it exists, we'll send a link to reset the password.
  </p>
  {#if form?.sent}
    <p class="rounded-[var(--radius-sm)] border border-[var(--color-success-border)] bg-[var(--color-success-bg)] px-3 py-2 text-sm text-[var(--color-success)]">
      If that email is registered, a reset link is on its way.
    </p>
  {:else}
    <form method="POST" class="flex flex-col gap-3">
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-[var(--color-muted)]">Email</span>
        <input
          name="email"
          type="email"
          required
          class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
        />
      </label>
      <button
        type="submit"
        class="rounded-[var(--radius-sm)] bg-[var(--color-product)] px-3 py-2 text-sm font-medium text-white"
      >Send reset link</button>
    </form>
  {/if}
  <a href="/auth" class="text-xs text-[var(--color-muted)] hover:underline">← Back to sign in</a>
</section>
