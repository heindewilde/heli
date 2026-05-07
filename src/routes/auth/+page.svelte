<script lang="ts">
  import { APP_NAME } from '$lib/branding';
  import { Lock, Database, Zap, Sparkles } from 'lucide-svelte';
  import { enhance } from '$app/forms';

  let { data, form } = $props();

  // svelte-ignore state_referenced_locally
  let mode = $state<'login' | 'register'>(data.mode === 'register' ? 'register' : 'login');
  let submitting = $state(false);

  const error = $derived(form?.error ?? null);
  const formMode = $derived(form?.mode ?? mode);
  const initialEmail = $derived(form?.email ?? '');
  const initialUsername = $derived(form && 'username' in form ? form.username ?? '' : '');

  const trust = [
    { icon: Lock, label: 'Open source' },
    { icon: Database, label: 'Self-hostable' },
    { icon: Zap, label: 'No tracking' },
    { icon: Sparkles, label: 'One file backup' }
  ];
</script>

<section class="grid min-h-[calc(100vh-3.5rem)] grid-cols-1 md:grid-cols-2">
  <aside class="hidden flex-col justify-between gap-12 border-r border-[var(--color-border)] bg-[var(--color-surface)] p-12 md:flex">
    <a href="/" class="flex items-center gap-2 font-semibold tracking-tight">
      <span class="inline-block h-6 w-6 rounded-[var(--radius-sm)] bg-[var(--color-product)]"></span>
      <span>{APP_NAME}</span>
    </a>
    <ul class="flex flex-col gap-3">
      {#each trust as t (t.label)}
        <li class="flex items-center gap-3 text-sm text-[var(--color-muted)]">
          <span class="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)]">
            <t.icon size={14} strokeWidth={2} />
          </span>
          <span>{t.label}</span>
        </li>
      {/each}
    </ul>
    <p class="text-xs text-[var(--color-subtle)]">A calmer CRM for the people you care about.</p>
  </aside>

  <div class="flex items-center justify-center p-8">
    <div class="w-full max-w-sm">
      <div class="mb-6 inline-flex rounded-[var(--radius-md)] border border-[var(--color-border)] p-1 text-sm">
        <button
          type="button"
          class="rounded-[var(--radius-sm)] px-3 py-1 {mode === 'login' ? 'bg-[var(--color-surface)]' : 'text-[var(--color-muted)]'}"
          onclick={() => (mode = 'login')}
        >Sign in</button>
        <button
          type="button"
          class="rounded-[var(--radius-sm)] px-3 py-1 {mode === 'register' ? 'bg-[var(--color-surface)]' : 'text-[var(--color-muted)]'}"
          onclick={() => (mode = 'register')}
          disabled={data.registrationDisabled}
        >Sign up</button>
      </div>

      <h1 class="mb-6 text-2xl font-semibold tracking-tight">
        {mode === 'login' ? 'Welcome back' : 'Create your account'}
      </h1>

      {#if data.registrationDisabled && mode === 'register'}
        <p class="mb-4 rounded-[var(--radius-sm)] border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-3 py-2 text-sm text-[var(--color-warning)]">
          Registration is currently disabled on this instance.
        </p>
      {/if}

      <form
        method="POST"
        action="?/{mode}"
        use:enhance={() => {
          submitting = true;
          return async ({ update }) => {
            await update();
            submitting = false;
          };
        }}
        class="flex flex-col gap-3"
      >
        <input type="hidden" name="next" value={data.next} />
        {#if mode === 'register'}
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-[var(--color-muted)]">Username (optional)</span>
            <input
              name="username"
              type="text"
              autocomplete="username"
              value={formMode === 'register' ? initialUsername : ''}
              class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
            />
          </label>
        {/if}
        <label class="flex flex-col gap-1 text-sm">
          <span class="text-[var(--color-muted)]">Email</span>
          <input
            name="email"
            type="email"
            required
            autocomplete="email"
            value={formMode === mode ? initialEmail : ''}
            class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
          />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          <span class="text-[var(--color-muted)]">Password</span>
          <input
            name="password"
            type="password"
            required
            minlength="8"
            maxlength="72"
            autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
            class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
          />
        </label>

        {#if error && formMode === mode}
          <p class="rounded-[var(--radius-sm)] border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3 py-2 text-sm text-[var(--color-danger)]">
            {error}
          </p>
        {/if}

        <button
          type="submit"
          disabled={submitting}
          class="mt-1 rounded-[var(--radius-sm)] bg-[var(--color-product)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {submitting ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <div class="mt-4 flex items-center justify-between text-xs text-[var(--color-muted)]">
        <a href="/auth/forgot-password" class="hover:underline">Forgot password?</a>
      </div>
    </div>
  </div>
</section>
