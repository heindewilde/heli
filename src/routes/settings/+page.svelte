<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { APP_NAME } from '$lib/branding';
  import { toast } from '$lib/toasts.svelte';
  import { Bookmark, Download, ShieldAlert, KeyRound, Mail, User, LogOut, Copy, Check, Users } from 'lucide-svelte';

  let { data } = $props();
  const user = $derived(data.user);

  // svelte-ignore state_referenced_locally
  let username = $state(user.username ?? '');
  // svelte-ignore state_referenced_locally
  let email = $state(user.email);
  let emailPwd = $state('');
  let currentPwd = $state('');
  let newPwd = $state('');
  let confirmPwd = $state('');
  let deletePwd = $state('');
  let saving = $state<null | string>(null);

  // Bookmarklet: opens /save?url=… in a new tab on this Heli instance.
  // Same-origin /api/save requires the cookie, which arbitrary websites cannot
  // send — so we navigate to Heli where the cookie *is* present. The /save
  // route classifies and lands on the new entity page.
  const bookmarkletJs = $derived(
    `javascript:void(window.open('${data.origin}/save?url='+encodeURIComponent(location.href),'_blank'))`
  );

  let importState = $state<'idle' | 'importing' | 'done'>('idle');
  let importResult = $state<{ imported: number; duplicates: number; errors: number } | null>(null);

  async function confirmImport() {
    importState = 'importing';
    try {
      const res = await fetch('/api/import', { method: 'POST' });
      if (!res.ok) {
        toast.danger('Import failed. Please try again.');
        importState = 'idle';
        return;
      }
      importResult = await res.json();
      importState = 'done';
      await invalidateAll();
    } catch {
      toast.danger('Import failed. Please try again.');
      importState = 'idle';
    }
  }

  async function cancelImport() {
    await fetch('/api/import', { method: 'DELETE' });
    await goto('/settings', { replaceState: true });
  }

  let copied = $state(false);
  async function copyBookmarklet() {
    try {
      await navigator.clipboard.writeText(bookmarkletJs);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      toast.danger('Could not copy. Drag the button instead.');
    }
  }

  async function postUser(payload: Record<string, unknown>): Promise<{ ok: boolean; status: number; body: any }> {
    const res = await fetch('/api/user', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { ok: res.ok, status: res.status, body };
  }

  async function saveUsername() {
    saving = 'username';
    try {
      const r = await postUser({ action: 'updateUsername', username });
      if (!r.ok) {
        toast.danger('Could not update username');
        return;
      }
      toast.success('Username updated');
      await invalidateAll();
    } finally {
      saving = null;
    }
  }

  async function saveEmail() {
    saving = 'email';
    try {
      const r = await postUser({ action: 'updateEmail', email, ...(data.hasPassword ? { currentPassword: emailPwd } : {}) });
      if (!r.ok) {
        toast.danger(
          r.body?.message === 'wrong_password' || r.status === 403
            ? 'Current password is incorrect'
            : r.body?.message === 'email_taken'
              ? 'That email is already in use'
              : 'Could not update email'
        );
        return;
      }
      emailPwd = '';
      toast.success('Email updated');
      await invalidateAll();
    } finally {
      saving = null;
    }
  }

  async function savePassword() {
    if (newPwd !== confirmPwd) {
      toast.danger('Passwords do not match');
      return;
    }
    if (newPwd.length < 8) {
      toast.danger('Password must be at least 8 characters');
      return;
    }
    saving = 'password';
    try {
      const r = await postUser({
        action: 'updatePassword',
        ...(data.hasPassword ? { currentPassword: currentPwd } : {}),
        newPassword: newPwd
      });
      if (!r.ok) {
        toast.danger(r.status === 403 ? 'Current password is incorrect' : 'Could not update password');
        return;
      }
      currentPwd = '';
      newPwd = '';
      confirmPwd = '';
      toast.success('Password updated');
    } finally {
      saving = null;
    }
  }

  async function signOutOthers() {
    saving = 'others';
    try {
      const r = await postUser({ action: 'signOutOtherDevices' });
      if (!r.ok) {
        toast.danger('Could not sign out other devices');
        return;
      }
      toast.success('Signed out other devices');
    } finally {
      saving = null;
    }
  }

  async function deleteAccount() {
    if (!confirm(`Delete your ${APP_NAME} account? This wipes every person, company, interaction, tag, and reminder. This cannot be undone.`)) return;
    saving = 'delete';
    try {
      const r = await postUser({ action: 'deleteAccount', ...(data.hasPassword ? { currentPassword: deletePwd } : {}) });
      if (!r.ok) {
        toast.danger(r.status === 403 ? 'Current password is incorrect' : 'Could not delete account');
        return;
      }
      toast.success('Account deleted');
      await goto('/');
    } finally {
      saving = null;
    }
  }
</script>

<svelte:head>
  <title>Settings — {APP_NAME}</title>
</svelte:head>

<article class="flex flex-col gap-8">
  <header>
    <h1 class="text-2xl font-semibold tracking-tight">Settings</h1>
    <p class="text-sm text-[var(--color-muted)]">Account, capture surfaces, exports, and danger zone.</p>
  </header>

  {#if !data.emailConfigured}
    <div class="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-4 py-3 text-sm text-[var(--color-warning)]">
      <Mail size={15} strokeWidth={2} class="mt-0.5 shrink-0" />
      <span>Email is not configured — password reset links will only appear in server logs. Set <code class="font-mono text-xs">RESEND_API_KEY</code> in your environment to enable email delivery.</span>
    </div>
  {/if}

  <section class="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
    <h2 class="flex items-center gap-2 text-sm font-medium"><Bookmark size={14} strokeWidth={2} /> Bookmarklet</h2>
    <p class="text-sm text-[var(--color-muted)]">
      Drag this button to your bookmarks bar. Clicking it from any page opens {APP_NAME} in a new tab with the page's URL queued for save.
    </p>
    <p class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs text-[var(--color-muted)]">
      Heads up: the bookmarklet opens a new tab pointing to {data.origin} so the saved cookie can authenticate the request — it's a tab navigation, not an inline fetch.
    </p>
    <div class="flex flex-wrap items-center gap-3">
      <a
        href={bookmarkletJs}
        onclick={(e) => e.preventDefault()}
        class="inline-flex cursor-grab items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)] px-3 py-2 text-sm font-medium text-[var(--color-text)]"
        draggable="true"
      >
        <Bookmark size={14} strokeWidth={2} />
        Save to {APP_NAME}
      </a>
      <button
        type="button"
        onclick={copyBookmarklet}
        class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-bg)]"
      >
        {#if copied}<Check size={14} strokeWidth={2} /> Copied{:else}<Copy size={14} strokeWidth={2} /> Copy snippet{/if}
      </button>
    </div>
  </section>

  <section class="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
    <h2 class="flex items-center gap-2 text-sm font-medium"><Download size={14} strokeWidth={2} /> Export</h2>
    <p class="text-sm text-[var(--color-muted)]">
      Stream your data as CSV. Includes tags as a pipe-separated column and (for interactions) a pipe-separated <code>person_ids</code>.
    </p>
    <div class="flex flex-wrap gap-2">
      <a href="/api/export?kind=people" class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-bg)]">
        <Download size={14} strokeWidth={2} /> People ({data.counts.people})
      </a>
      <a href="/api/export?kind=companies" class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-bg)]">
        <Download size={14} strokeWidth={2} /> Companies ({data.counts.companies})
      </a>
      <a href="/api/export?kind=interactions" class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-bg)]">
        <Download size={14} strokeWidth={2} /> Interactions ({data.counts.interactions})
      </a>
    </div>
  </section>

  {#if data.googleAuthEnabled}
    <section class="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <h2 class="flex items-center gap-2 text-sm font-medium"><Users size={14} strokeWidth={2} /> Google Contacts</h2>

      {#if data.importError}
        <p class="rounded-[var(--radius-sm)] border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3 py-2 text-sm text-[var(--color-danger)]">
          Could not connect to Google. Please try again.
        </p>
      {/if}

      {#if importState === 'done' && importResult}
        <p class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-muted)]">
          Imported {importResult.imported} contact{importResult.imported !== 1 ? 's' : ''}.{importResult.duplicates > 0 ? ` ${importResult.duplicates} already existed and were skipped.` : ''}
        </p>
      {:else if data.pendingImport && importState !== 'done'}
        <div class="flex flex-col gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
          <p class="text-sm">
            <strong>{data.pendingImport.totalToImport}</strong> contact{data.pendingImport.totalToImport !== 1 ? 's' : ''} ready to import
            {#if data.pendingImport.duplicateCount > 0}
              · <span class="text-[var(--color-muted)]">{data.pendingImport.duplicateCount} already in {APP_NAME}, will be skipped</span>
            {/if}
          </p>

          {#if data.pendingImport.preview.length > 0}
            <ul class="flex flex-col gap-1">
              {#each data.pendingImport.preview as contact}
                <li class="flex items-baseline gap-2 text-sm">
                  <span class="font-medium">{contact.name}</span>
                  {#if contact.email}<span class="text-[var(--color-muted)] text-xs">{contact.email}</span>{/if}
                </li>
              {/each}
              {#if data.pendingImport.totalToImport > data.pendingImport.preview.length}
                <li class="text-xs text-[var(--color-subtle)]">… and {data.pendingImport.totalToImport - data.pendingImport.preview.length} more</li>
              {/if}
            </ul>
          {/if}

          <div class="flex items-center gap-2">
            <button
              type="button"
              onclick={confirmImport}
              disabled={importState === 'importing'}
              class="rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-[var(--color-accent-fg)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
            >
              {importState === 'importing' ? 'Importing…' : `Import ${data.pendingImport.totalToImport} contact${data.pendingImport.totalToImport !== 1 ? 's' : ''}`}
            </button>
            <button
              type="button"
              onclick={cancelImport}
              disabled={importState === 'importing'}
              class="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-surface)] disabled:opacity-60"
            >Cancel</button>
          </div>
        </div>
      {:else}
        <p class="text-sm text-[var(--color-muted)]">
          Import your Google Contacts directly into {APP_NAME}. Contacts already in your account are automatically skipped.
        </p>
        <a
          href="/auth/google/contacts"
          class="self-start inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-surface)]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Import from Google Contacts
        </a>
      {/if}
    </section>
  {/if}

  <section class="flex flex-col gap-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
    <h2 class="flex items-center gap-2 text-sm font-medium"><User size={14} strokeWidth={2} /> Account</h2>

    <div class="flex flex-col gap-2">
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-[var(--color-muted)]">Username</span>
        <input
          type="text"
          bind:value={username}
          maxlength="64"
          class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
        />
      </label>
      <button
        type="button"
        onclick={saveUsername}
        disabled={saving === 'username'}
        class="self-start rounded-[var(--radius-sm)] bg-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-hover)] px-3 py-2 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-60"
      >Save username</button>
    </div>

    <hr class="border-[var(--color-border)]" />

    <div class="flex flex-col gap-2">
      <h3 class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">
        <Mail size={12} strokeWidth={2} /> Email
      </h3>
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-[var(--color-muted)]">New email</span>
        <input
          type="email"
          bind:value={email}
          class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
        />
      </label>
      {#if data.hasPassword}
        <label class="flex flex-col gap-1 text-sm">
          <span class="text-[var(--color-muted)]">Current password</span>
          <input
            type="password"
            bind:value={emailPwd}
            autocomplete="current-password"
            class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
          />
        </label>
      {/if}
      <button
        type="button"
        onclick={saveEmail}
        disabled={saving === 'email'}
        class="self-start rounded-[var(--radius-sm)] bg-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-hover)] px-3 py-2 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-60"
      >Update email</button>
    </div>

    <hr class="border-[var(--color-border)]" />

    <div class="flex flex-col gap-2">
      <h3 class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">
        <KeyRound size={12} strokeWidth={2} /> {data.hasPassword ? 'Password' : 'Set a password'}
      </h3>
      {#if !data.hasPassword}
        <p class="text-xs text-[var(--color-muted)]">Your account uses Google sign-in. You can set a password to also sign in with email.</p>
      {/if}
      {#if data.hasPassword}
        <label class="flex flex-col gap-1 text-sm">
          <span class="text-[var(--color-muted)]">Current password</span>
          <input type="password" bind:value={currentPwd} autocomplete="current-password" class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2" />
        </label>
      {/if}
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-[var(--color-muted)]">New password</span>
        <input type="password" bind:value={newPwd} minlength="8" maxlength="72" autocomplete="new-password" class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2" />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-[var(--color-muted)]">Confirm new password</span>
        <input type="password" bind:value={confirmPwd} minlength="8" maxlength="72" autocomplete="new-password" class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2" />
      </label>
      <button
        type="button"
        onclick={savePassword}
        disabled={saving === 'password'}
        class="self-start rounded-[var(--radius-sm)] bg-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-hover)] px-3 py-2 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-60"
      >{data.hasPassword ? 'Update password' : 'Set password'}</button>
    </div>

    <hr class="border-[var(--color-border)]" />

    <div class="flex flex-col gap-2">
      <h3 class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">
        <LogOut size={12} strokeWidth={2} /> Sessions
      </h3>
      <p class="text-xs text-[var(--color-muted)]">Sign out everywhere except this browser. Useful if a device was lost.</p>
      <button
        type="button"
        onclick={signOutOthers}
        disabled={saving === 'others'}
        class="self-start rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-bg)] disabled:opacity-60"
      >Sign out other devices</button>
    </div>
  </section>

  <section class="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] p-5">
    <h2 class="flex items-center gap-2 text-sm font-medium text-[var(--color-danger)]">
      <ShieldAlert size={14} strokeWidth={2} /> Danger zone
    </h2>
    <p class="text-sm text-[var(--color-danger)]">
      Deleting your account erases every person, company, interaction, tag, reminder, and session. This cannot be undone.
    </p>
    {#if data.hasPassword}
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-[var(--color-danger)]">Confirm with current password</span>
        <input
          type="password"
          bind:value={deletePwd}
          autocomplete="current-password"
          class="rounded-[var(--radius-sm)] border border-[var(--color-danger-border)] bg-[var(--color-bg)] px-3 py-2"
        />
      </label>
    {/if}
    <button
      type="button"
      onclick={deleteAccount}
      disabled={saving === 'delete' || (data.hasPassword && !deletePwd)}
      class="self-start rounded-[var(--radius-sm)] bg-[var(--color-danger)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
    >Delete account permanently</button>
  </section>

  <footer class="flex gap-4 text-xs text-[var(--color-subtle)]">
    <a href="/privacy" class="hover:text-[var(--color-muted)]">Privacy Policy</a>
    <a href="/terms" class="hover:text-[var(--color-muted)]">Terms of Service</a>
  </footer>
</article>
