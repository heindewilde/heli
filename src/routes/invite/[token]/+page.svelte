<script lang="ts">
  import { enhance } from '$app/forms';
  import { Users } from 'lucide-svelte';
  import { APP_NAME } from '$lib/branding';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const ERRORS: Record<string, string> = {
    invite_invalid: 'This invitation has expired or been revoked.',
    wrong_account: 'This invitation was sent to a different email address.',
    seat_limit_reached: 'This workspace has no seats left. Ask the owner to free one up.'
  };
</script>

<svelte:head>
  <title>Invitation · {APP_NAME}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-4">
  <div
    class="flex flex-col gap-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
  >
    {#if !data.invite}
      <h1 class="text-base font-medium">Invitation not valid</h1>
      <p class="text-sm text-[var(--color-muted)]">
        This invitation has expired, been revoked, or was already accepted. Ask whoever invited you
        to send a new one.
      </p>
      <a class="text-sm underline" href="/">Go to {APP_NAME}</a>
    {:else}
      <div class="flex items-center gap-2 text-[var(--color-muted)]">
        <Users size={16} strokeWidth={2} />
        <span class="cap-label">Invitation</span>
      </div>
      <h1 class="text-base font-medium">
        Join {data.invite.workspaceName}
      </h1>
      <p class="text-sm text-[var(--color-muted)]">
        You've been invited to join <strong>{data.invite.workspaceName}</strong> as
        {data.invite.role}. The invitation was sent to {data.invite.email}.
      </p>

      {#if form?.code}
        <p class="text-sm text-[var(--color-danger)]">
          {ERRORS[form.code] ?? 'Something went wrong accepting this invitation.'}
        </p>
      {/if}

      {#if data.mismatch}
        <p class="text-sm text-[var(--color-danger)]">
          You're signed in as {data.signedInAs}, but this invitation is for {data.invite.email}.
          Sign out and sign back in with that address to accept.
        </p>
        <form method="POST" action="/auth/logout">
          <button class="text-sm underline" type="submit">Sign out</button>
        </form>
      {:else if data.signedInAs}
        <form method="POST" use:enhance>
          <button
            class="w-full rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-2 text-sm text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
            type="submit"
          >
            Accept invitation
          </button>
        </form>
      {:else}
        <a
          class="w-full rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-2 text-center text-sm text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
          href="/auth?next={encodeURIComponent(`/invite/${data.token}`)}"
        >
          {data.invite.needsSignup ? 'Create your account to join' : 'Sign in to accept'}
        </a>
      {/if}
    {/if}
  </div>
</div>
