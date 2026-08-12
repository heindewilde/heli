<script lang="ts">
  import Select from '$lib/ui/Select.svelte';
  import Smartphone from 'lucide-svelte/icons/smartphone';
  import DevicesSection from '$lib/components/DevicesSection.svelte';

  const ROLE_OPTIONS = [
    { value: 'member', label: 'Member' },
    { value: 'admin', label: 'Admin' }
  ];
  import { goto, invalidateAll } from '$app/navigation';
  import { APP_NAME } from '$lib/branding';
  import { toast } from '$lib/toasts.svelte';
  import { readErrorCode } from '$lib/api-error';
  // Not `navigator.clipboard` directly: that is undefined outside a secure
  // context, which is exactly the docker-compose quickstart before Caddy is in
  // front of it and any plain-HTTP LAN self-host. copyText falls back.
  import { copyText } from '$lib/client/clipboard';
  import {
    hoursToMinutes,
    minutesToHours,
    DEFAULT_WEEKLY_CAPACITY_MINUTES
  } from '$lib/duration';
  import { Bookmark, Building2, CalendarDays, Download, ShieldAlert, KeyRound, Mail, User, LogOut, Copy, Check, Users } from 'lucide-svelte';

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

  /**
   * The part of a mutation that is the same in every handler on this page:
   * JSON headers, `JSON.stringify`, mapping an error code to a message, and
   * toasting it. Returns the response on success and null once it has already
   * reported the failure, so a call site reads `if (!res) return;`.
   *
   * Deliberately *not* a `mutate()` that also owns the busy flag, the success
   * toast and what happens afterwards. Those differ at nearly every call site —
   * some redirect, some purge the service worker, some re-invalidate on failure
   * to put a `<select>` back — and folding them in would need one option per
   * handler, which is a switch statement wearing a function's clothes.
   */
  async function request(
    url: string,
    init: { method: string; body?: unknown },
    errors: Record<string, string>,
    fallback: string
  ): Promise<Response | null> {
    try {
      const res = await fetch(url, {
        method: init.method,
        ...(init.body === undefined
          ? {}
          : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(init.body) })
      });
      if (!res.ok) {
        toast.danger(errors[await readErrorCode(res)] ?? fallback);
        return null;
      }
      return res;
    } catch {
      toast.danger(fallback);
      return null;
    }
  }

  // ── Team ───────────────────────────────────────────────────────────────────
  const teamAdmin = $derived(data.workspace.role === 'owner' || data.workspace.role === 'admin');
  const isOwner = $derived(data.workspace.role === 'owner');
  let inviteEmail = $state('');
  let inviteRole = $state<'member' | 'admin'>('member');
  let busy = $state<string | null>(null);

  const INVITE_ERRORS: Record<string, string> = {
    already_member: 'They are already in this workspace.',
    already_invited: 'There is already a pending invitation for that address.',
    invalid_email: 'That email address does not look right.',
    seat_limit_reached: 'This workspace has no seats left.',
    rate_limited: 'Too many invitations sent from this workspace. Try again later.',
    region_mismatch:
      'That account already exists in a different data region and cannot join this workspace.'
  };

  async function sendInvite(e: SubmitEvent) {
    e.preventDefault();
    busy = 'invite';
    try {
      const res = await request(
        '/api/workspace/invites',
        { method: 'POST', body: { email: inviteEmail, role: inviteRole } },
        INVITE_ERRORS,
        'Could not send that invitation.'
      );
      if (!res) return;
      const { emailed } = await res.json();
      toast.success(emailed ? 'Invitation sent.' : 'Invitation created — copy the link to share it.');
      inviteEmail = '';
      await invalidateAll();
    } finally {
      busy = null;
    }
  }

  async function revokeInvite(token: string) {
    busy = token;
    try {
      const res = await request(
        `/api/workspace/invites/${encodeURIComponent(token)}`,
        { method: 'DELETE' },
        {},
        'Could not revoke that invitation.'
      );
      if (res) await invalidateAll();
    } finally {
      busy = null;
    }
  }

  async function copyInvite(url: string) {
    // copyText reports failure by return value, not by throwing — it has a
    // non-secure-context fallback that can itself fail.
    if ((await copyText(url)) === 'failed') {
      toast.danger('Could not copy the link.');
      return;
    }
    toast.success('Invite link copied.');
  }

  async function removeMember(userId: string, label: string) {
    if (!confirm(`Remove ${label} from this workspace? Records they created stay, reassigned to the owner.`)) {
      return;
    }
    busy = userId;
    try {
      const res = await request(
        `/api/workspace/members/${encodeURIComponent(userId)}`,
        { method: 'DELETE' },
        {},
        'Could not remove that member.'
      );
      if (!res) return;
      toast.success(`${label} removed.`);
      await invalidateAll();
    } finally {
      busy = null;
    }
  }

  // svelte-ignore state_referenced_locally
  let workspaceName = $state(data.workspace.name);
  let newWorkspaceName = $state('');

  let deleteWorkspaceConfirm = $state('');

  const WORKSPACE_ERRORS: Record<string, string> = {
    rate_limited: 'Too many workspaces created recently. Try again later.',
    workspace_limit_reached: 'You already own the maximum number of workspaces.',
    missing_name: 'Give the workspace a name.',
    invalid_name: 'Give the workspace a name.',
    workspace_has_members: 'Remove the other members first, or hand the workspace over.',
    not_owner: 'Only the owner can delete a workspace.'
  };

  async function deleteWorkspace() {
    busy = 'deleteWorkspace';
    try {
      const res = await request(
        '/api/workspace',
        { method: 'DELETE' },
        WORKSPACE_ERRORS,
        'Could not delete this workspace.'
      );
      if (!res) return;
      navigator.serviceWorker?.controller?.postMessage('PURGE_API');
      location.assign('/');
    } finally {
      busy = null;
    }
  }

  async function renameWorkspace(e: SubmitEvent) {
    e.preventDefault();
    busy = 'rename';
    try {
      const res = await request(
        '/api/workspace',
        { method: 'PATCH', body: { name: workspaceName } },
        WORKSPACE_ERRORS,
        'Could not rename this workspace.'
      );
      if (!res) return;
      toast.success('Workspace renamed.');
      // The header switcher reads memberships from the layout load, which
      // doesn't re-run on client-side navigation — without this the old name
      // stays up there for the rest of the session.
      await invalidateAll();
    } catch {
      toast.danger('Could not rename this workspace.');
    } finally {
      busy = null;
    }
  }

  async function createWorkspace(e: SubmitEvent) {
    e.preventDefault();
    busy = 'newWorkspace';
    try {
      const res = await request(
        '/api/workspace',
        { method: 'POST', body: { name: newWorkspaceName } },
        WORKSPACE_ERRORS,
        'Could not create that workspace.'
      );
      if (!res) return;
      // The session moved to the new workspace, so everything cached on this
      // page belongs to the old one.
      navigator.serviceWorker?.controller?.postMessage('PURGE_API');
      location.assign('/');
    } catch {
      toast.danger('Could not create that workspace.');
    } finally {
      busy = null;
    }
  }

  /**
   * A member on the default shows the default rather than an empty box — the
   * number is what availability actually uses, so leaving it blank would hide
   * the assumption being made about their week.
   */
  function capacityDraft(m: { weeklyCapacityMinutes: number | null }): string {
    return String(minutesToHours(m.weeklyCapacityMinutes ?? DEFAULT_WEEKLY_CAPACITY_MINUTES));
  }

  async function saveCapacity(userId: string, raw: string) {
    const trimmed = raw.trim();
    // Clearing the field means "use the default", which is a null on the row.
    const minutes = trimmed === '' ? null : hoursToMinutes(trimmed);
    if (trimmed !== '' && minutes == null) {
      toast.danger('Enter hours per week, e.g. 32 or 37.5');
      await invalidateAll();
      return;
    }
    const res = await request(
      '/api/workspace/capacity',
      { method: 'PATCH', body: { userId, weeklyCapacityMinutes: minutes } },
      { invalid_minutes: 'That is not a workable week.', forbidden: 'Only admins can change that.' },
      'Could not save that capacity.'
    );
    if (res) await invalidateAll();
  }

  async function changeRole(userId: string, role: string) {
    busy = userId;
    try {
      const res = await fetch(`/api/workspace/members/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role })
      });
      if (!res.ok) throw new Error();
      toast.success('Role updated.');
      await invalidateAll();
    } catch {
      toast.danger('Could not change that role.');
      await invalidateAll(); // put the select back where it was
    } finally {
      busy = null;
    }
  }

  async function makeOwner(userId: string, label: string) {
    if (
      !confirm(
        `Make ${label} the owner of ${data.workspace.name}? You stay on as an admin and cannot undo this yourself.`
      )
    ) {
      return;
    }
    busy = userId;
    try {
      const res = await request(
        '/api/workspace/transfer',
        { method: 'POST', body: { userId } },
        {},
        'Could not transfer ownership.'
      );
      if (!res) return;
      toast.success(`${label} is now the owner.`);
      await invalidateAll();
    } finally {
      busy = null;
    }
  }

  async function leaveWorkspace() {
    if (
      !confirm(
        `Leave ${data.workspace.name}? The people, companies and notes you added stay with the workspace, reattributed to its owner. Your reminders are deleted.`
      )
    ) {
      return;
    }
    busy = 'leave';
    const res = await request(
      `/api/workspace/members/${encodeURIComponent(data.user.id)}`,
      { method: 'DELETE' },
      {},
      'Could not leave that workspace.'
    );
    if (!res) {
      busy = null;
      return;
    }
    // `busy` stays set on success: the page is navigating away, and clearing it
    // would re-enable the button for the frames before unload.
    //
    // The session now points at a different workspace, so every cached /api/*
    // response and every $state island on the page belongs to the one just
    // left. Same purge-and-hard-navigate as WorkspaceSwitcher.
    navigator.serviceWorker?.controller?.postMessage('PURGE_API');
    location.assign('/');
  }

  /**
   * Reviewing and committing live on /settings/import; this page only stages,
   * links across, and can throw a staged import away.
   */
  async function discardImport() {
    await fetch('/api/import', { method: 'DELETE' });
    await invalidateAll();
  }

  let csvBusy = $state(false);
  let csvError = $state<string | null>(null);

  const CSV_ERRORS: Record<string, string> = {
    no_file: 'No file was selected.',
    empty_file: 'That file is empty.',
    file_too_large: 'That file is too large to read.',
    // By far the likeliest mistake: the archive LinkedIn sends holds a dozen
    // CSVs and only one of them is the connections list.
    not_a_connections_export:
      'That does not look like a LinkedIn connections export. Look for Connections.csv inside the archive.',
    // A staged import is held in memory until you commit it, so the row count is
    // capped. Splitting the file is the answer, and each half commits normally.
    too_many_rows:
      'That export has more connections than can be staged at once. Split the CSV and import it in two halves.'
  };

  /**
   * Uploads the CSV, which *stages* the import, then hands over to the review
   * screen — the same landing the Google OAuth callback redirects to.
   */
  async function uploadLinkedInCsv(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    csvBusy = true;
    csvError = null;
    try {
      const body = new FormData();
      body.set('file', file);
      const res = await fetch('/api/import/linkedin', { method: 'POST', body });
      if (!res.ok) {
        const code = await readErrorCode(res);
        csvError = CSV_ERRORS[code] ?? 'Could not read that file.';
        return;
      }
      const { skipped } = (await res.json()) as { skipped: number };
      if (skipped > 0) {
        toast.info(`${skipped} row${skipped === 1 ? '' : 's'} had no name and were ignored.`);
      }
      await goto('/settings/import');
    } catch {
      csvError = 'Could not read that file.';
    } finally {
      csvBusy = false;
      // Cleared so re-picking the same file fires `change` again.
      input.value = '';
    }
  }

  let copied = $state(false);
  /* ── Calendar feeds ──────────────────────────────────────────────────── */

  // svelte-ignore state_referenced_locally
  let calendars = $state(data.calendars);
  let calUrl = $state('');
  let calLabel = $state('');
  let calSelf = $state('');
  let calBusy = $state(false);
  let calSyncing = $state<string | null>(null);
  let calPreview = $state<Record<string, string>>({});

  $effect(() => {
    calendars = data.calendars;
  });

  async function addCalendar() {
    if (calBusy || !calUrl.trim()) return;
    calBusy = true;
    try {
      const res = await request(
        '/api/calendar',
        {
          method: 'POST',
          body: {
            url: calUrl.trim(),
            label: calLabel.trim() || null,
            selfEmails: calSelf
              .split(',')
              .map((e) => e.trim())
              .filter(Boolean)
          }
        },
        { private_address: 'That address is not reachable from the server.' },
        'Could not add that calendar.'
      );
      if (!res) return;
      calendars = [...calendars, await res.json()];
      calUrl = '';
      calLabel = '';
      await syncCalendar(calendars[calendars.length - 1].id);
    } finally {
      calBusy = false;
    }
  }

  async function syncCalendar(id: string) {
    calSyncing = id;
    try {
      const res = await fetch(`/api/calendar/${id}`, { method: 'POST' });
      if (!res.ok) {
        // Without this, a 404 (feed deleted in another tab) or a 500 left
        // `result.status` undefined, skipped the error branch, and reported
        // "undefined added, undefined updated" as a success.
        toast.danger('Could not sync that calendar.');
        return;
      }
      const result = await res.json();
      if (result.status === 'error') {
        toast.danger(result.error ?? 'Sync failed');
      } else {
        toast.success(
          result.status === 'unchanged'
            ? 'No changes since last sync.'
            : `${result.created} added, ${result.updated} updated.`
        );
      }
      await invalidateAll();
    } finally {
      calSyncing = null;
    }
  }

  async function previewCalendar(id: string) {
    calPreview = { ...calPreview, [id]: 'Checking…' };
    const res = await fetch(`/api/calendar/${id}?action=preview`, { method: 'POST' });
    if (!res.ok) {
      calPreview = { ...calPreview, [id]: 'Could not check.' };
      return;
    }
    const p = await res.json();
    calPreview = {
      ...calPreview,
      [id]: `${p.events} events · ${p.matched} attendees already in Heli · would create ${p.wouldCreate.length} new people`
    };
  }

  async function setMatchMode(id: string, matchMode: string) {
    const res = await request(
      `/api/calendar/${id}`,
      { method: 'PATCH', body: { matchMode } },
      {},
      'Could not update.'
    );
    if (!res) return;
    calendars = calendars.map((c) => (c.id === id ? { ...c, matchMode } : c));
  }

  async function removeCalendar(id: string, label: string | null) {
    if (!confirm(`Remove ${label || 'this calendar'}? Imported meetings stay.`)) return;
    const res = await request(`/api/calendar/${id}`, { method: 'DELETE' }, {}, 'Could not remove.');
    if (!res) return;
    calendars = calendars.filter((c) => c.id !== id);
  }

  /* ── Personal access tokens ─────────────────────────────────────────── */

  // svelte-ignore state_referenced_locally
  let tokens = $state(data.apiTokens);
  let tokenName = $state('');
  let tokenScopes = $state<string[]>(['read']);
  // Shown once, immediately after minting. There is no way to recover it later
  // — only the SHA-256 hash is stored.
  let freshSecret = $state<string | null>(null);
  let secretCopied = $state(false);
  let tokenBusy = $state(false);

  $effect(() => {
    tokens = data.apiTokens;
  });

  function toggleScope(scope: string) {
    tokenScopes = tokenScopes.includes(scope)
      ? tokenScopes.filter((x) => x !== scope)
      : [...tokenScopes, scope];
  }

  async function createApiToken() {
    if (tokenBusy || tokenScopes.length === 0) return;
    tokenBusy = true;
    try {
      const res = await request(
        '/api/v1/tokens',
        { method: 'POST', body: { name: tokenName.trim() || 'Untitled token', scopes: tokenScopes } },
        {},
        'Could not create token'
      );
      if (!res) return;
      const { data: created } = await res.json();
      freshSecret = created.secret;
      secretCopied = false;
      tokenName = '';
      tokens = [{ ...created, secret: undefined }, ...tokens];
    } finally {
      tokenBusy = false;
    }
  }

  async function revokeApiToken(id: string, name: string) {
    if (!confirm(`Revoke "${name}"? Anything using it stops working immediately.`)) return;
    const res = await request(`/api/v1/tokens/${id}`, { method: 'DELETE' }, {}, 'Could not revoke token');
    if (!res) return;
    tokens = tokens.filter((t) => t.id !== id);
    toast.success('Token revoked');
  }

  async function copySecret() {
    if (!freshSecret) return;
    if ((await copyText(freshSecret)) === 'failed') {
      // The secret is shown exactly once, so a silent failure here is the worst
      // of the three: the user closes the dialog believing they have it.
      toast.danger('Could not copy. Select the token and copy it by hand.');
      return;
    }
    secretCopied = true;
    setTimeout(() => (secretCopied = false), 2000);
  }

  function fmtWhen(ts: number | null): string {
    if (!ts) return 'never';
    const days = Math.floor((Date.now() - ts) / 86_400_000);
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    return `${days}d ago`;
  }

  async function copyBookmarklet() {
    if ((await copyText(bookmarkletJs)) === 'failed') {
      toast.danger('Could not copy. Drag the button instead.');
      return;
    }
    copied = true;
    setTimeout(() => (copied = false), 1500);
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
        // owner_must_transfer tells the user to do something specific — say what
        // it is, rather than falling through to the generic failure.
        toast.danger(
          r.status === 403
            ? 'Current password is incorrect'
            : r.body?.message === 'owner_must_transfer'
              ? 'Make someone else the owner, or remove the other members, before deleting your account.'
              : 'Could not delete account'
        );
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
    <h1 class="text-3xl font-bold">Settings</h1>
    <p class="text-sm text-[var(--color-muted)]">Account, capture surfaces, exports, and danger zone.</p>
  </header>

  <!--
    Nine panels in one 1300-line scroll, with nothing telling you what was
    below the fold. This is a table of contents rather than tabs or routes:
    it needs no restructuring of the panels, keeps ⌘F working across the whole
    page, and every section stays linkable.
  -->
  <nav aria-label="Settings sections" class="flex flex-wrap gap-1">
    <a
      href="#workspaces"
      class="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium text-[var(--color-muted)] transition-colors hover:border-[var(--color-interactive-ring)] hover:text-[var(--color-text)]"
    ><Building2 size={13} strokeWidth={2} class="text-[var(--color-subtle)]" /> Workspaces</a>
    <a
      href="#team"
      class="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium text-[var(--color-muted)] transition-colors hover:border-[var(--color-interactive-ring)] hover:text-[var(--color-text)]"
    ><Users size={13} strokeWidth={2} class="text-[var(--color-subtle)]" /> Team</a>
    <a
      href="#bookmarklet"
      class="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium text-[var(--color-muted)] transition-colors hover:border-[var(--color-interactive-ring)] hover:text-[var(--color-text)]"
    ><Bookmark size={13} strokeWidth={2} class="text-[var(--color-subtle)]" /> Bookmarklet</a>
    <a
      href="#calendars"
      class="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium text-[var(--color-muted)] transition-colors hover:border-[var(--color-interactive-ring)] hover:text-[var(--color-text)]"
    ><CalendarDays size={13} strokeWidth={2} class="text-[var(--color-subtle)]" /> Calendars</a>
    <a
      href="#devices"
      class="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium text-[var(--color-muted)] transition-colors hover:border-[var(--color-interactive-ring)] hover:text-[var(--color-text)]"
    ><Smartphone size={13} strokeWidth={2} class="text-[var(--color-subtle)]" /> Devices</a>
    <a
      href="#tokens"
      class="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium text-[var(--color-muted)] transition-colors hover:border-[var(--color-interactive-ring)] hover:text-[var(--color-text)]"
    ><KeyRound size={13} strokeWidth={2} class="text-[var(--color-subtle)]" /> Access tokens</a>
    <a
      href="#export"
      class="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium text-[var(--color-muted)] transition-colors hover:border-[var(--color-interactive-ring)] hover:text-[var(--color-text)]"
    ><Download size={13} strokeWidth={2} class="text-[var(--color-subtle)]" /> Export</a>
    <a
      href="#import"
      class="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium text-[var(--color-muted)] transition-colors hover:border-[var(--color-interactive-ring)] hover:text-[var(--color-text)]"
    ><Users size={13} strokeWidth={2} class="text-[var(--color-subtle)]" /> Import contacts</a>
    <a
      href="#account"
      class="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium text-[var(--color-muted)] transition-colors hover:border-[var(--color-interactive-ring)] hover:text-[var(--color-text)]"
    ><User size={13} strokeWidth={2} class="text-[var(--color-subtle)]" /> Account</a>
    <a
      href="#danger"
      class="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium text-[var(--color-muted)] transition-colors hover:border-[var(--color-interactive-ring)] hover:text-[var(--color-text)]"
    ><ShieldAlert size={13} strokeWidth={2} class="text-[var(--color-subtle)]" /> Danger zone</a>
  </nav>

  {#if !data.emailConfigured}
    <div class="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-4 py-3 text-sm text-[var(--color-warning)]">
      <Mail size={15} strokeWidth={2} class="mt-0.5 shrink-0" />
      <span>Email is not configured — password reset links will only appear in server logs. Set <code class="font-mono text-xs">RESEND_API_KEY</code> in your environment to enable email delivery.</span>
    </div>
  {/if}

  <section id="workspaces" style="scroll-margin-top:1rem" class="flex flex-col gap-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
    <h2 class="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
      <Building2 size={14} strokeWidth={2} /> Workspaces
    </h2>

    {#if teamAdmin}
      <form class="flex flex-wrap items-end gap-2" onsubmit={renameWorkspace}>
        <label class="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          <span class="text-[var(--color-muted)]">Name</span>
          <input
            class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
            type="text"
            maxlength="80"
            bind:value={workspaceName}
            required
          />
        </label>
        <button
          class="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-bg)] disabled:opacity-60"
          type="submit"
          disabled={busy === 'rename' || workspaceName.trim() === data.workspace.name}
        >
          {busy === 'rename' ? 'Saving…' : 'Rename'}
        </button>
      </form>
    {:else}
      <p class="text-sm text-[var(--color-muted)]">
        You're in <strong>{data.workspace.name}</strong>. Only owners and admins can rename it.
      </p>
    {/if}

    {#if data.memberships.length > 1}
      <ul class="flex flex-col divide-y divide-[var(--color-border)]">
        {#each data.memberships as m (m.workspaceId)}
          <li class="flex items-center justify-between gap-3 py-2 text-sm">
            <span class="truncate">{m.workspaceName}</span>
            <span class="cap-label shrink-0 text-[var(--color-muted)]">
              {m.workspaceId === data.workspace.id ? 'current' : m.role}
            </span>
          </li>
        {/each}
      </ul>
    {/if}

    <form class="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-4" onsubmit={createWorkspace}>
      <input
        class="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
        type="text"
        placeholder="New workspace name"
        maxlength="80"
        bind:value={newWorkspaceName}
        required
      />
      <button
        class="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-bg)] disabled:opacity-60"
        type="submit"
        disabled={busy === 'newWorkspace'}
      >
        {busy === 'newWorkspace' ? 'Creating…' : 'Create workspace'}
      </button>
    </form>
    <p class="text-xs text-[var(--color-muted)]">
      A new workspace starts empty and you own it. Creating one switches you into it.
    </p>

    {#if isOwner}
      <!-- Typed-name confirmation rather than the usual confirm(): this removes
           every record in the workspace, and unlike deleting a single entity
           there is nothing left to undo it from. -->
      <div class="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] p-4">
        <span class="text-sm font-medium text-[var(--color-danger)]">Delete this workspace</span>
        <p class="text-sm text-[var(--color-muted)]">
          Permanently removes {data.workspace.name} and its {data.counts.people} people,
          {data.counts.companies} companies and {data.counts.interactions} interactions.
          {#if data.members.length > 1}
            Remove the other members first.
          {:else}
            Type the workspace name to confirm.
          {/if}
        </p>
        {#if data.members.length === 1}
          <div class="flex flex-wrap items-center gap-2">
            <input
              class="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
              type="text"
              placeholder={data.workspace.name}
              bind:value={deleteWorkspaceConfirm}
            />
            <button
              class="shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-danger)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              onclick={deleteWorkspace}
              disabled={busy === 'deleteWorkspace' || deleteWorkspaceConfirm !== data.workspace.name}
            >
              {busy === 'deleteWorkspace' ? 'Deleting…' : 'Delete workspace'}
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </section>

  <section id="team" style="scroll-margin-top:1rem" class="flex flex-col gap-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
    <h2 class="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
      <Users size={14} strokeWidth={2} /> Team
    </h2>
    <p class="text-sm text-[var(--color-muted)]">
      Everyone in <strong>{data.workspace.name}</strong> shares the same people, companies,
      projects and pipelines. Reminders stay private to each person.
    </p>

    <ul class="flex flex-col divide-y divide-[var(--color-border)]">
      {#each data.members as m (m.userId)}
        <li class="flex items-center justify-between gap-3 py-2">
          <div class="min-w-0">
            <div class="truncate text-sm">{m.username ?? m.email}</div>
            <div class="truncate text-xs text-[var(--color-muted)]">{m.email}</div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <!-- Your own working week is yours to state; a colleague's is
                 workspace configuration, so the input is read-only unless you
                 are an admin. The server enforces the same rule. -->
            <label class="flex items-center gap-1 text-xs text-[var(--color-muted)]">
              <input
                type="text"
                inputmode="decimal"
                value={capacityDraft(m)}
                disabled={!teamAdmin && m.userId !== data.user.id}
                onblur={(e) => saveCapacity(m.userId, e.currentTarget.value)}
                aria-label="Weekly capacity for {m.username ?? m.email}"
                class="w-14 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-1 text-right tabular-nums disabled:opacity-50"
              />
              h/wk
            </label>
            {#if teamAdmin && !m.isOwner && m.userId !== data.user.id}
              <!-- Self excluded deliberately: an admin demoting themselves would
                   lose the page they are standing on. -->
              <Select
                value={m.role}
                options={ROLE_OPTIONS}
                onchange={(role) => changeRole(m.userId, role)}
                disabled={busy === m.userId}
                label="Role for {m.username ?? m.email}"
              />
            {:else}
              <span class="cap-label text-[var(--color-muted)]">{m.role}</span>
            {/if}
            {#if isOwner && !m.isOwner && m.userId !== data.user.id}
              <button
                class="text-xs underline"
                onclick={() => makeOwner(m.userId, m.username ?? m.email)}
                disabled={busy === m.userId}
              >
                Make owner
              </button>
            {/if}
            {#if teamAdmin && !m.isOwner && m.userId !== data.user.id}
              <button
                class="text-xs text-[var(--color-danger)] underline"
                onclick={() => removeMember(m.userId, m.username ?? m.email)}
                disabled={busy === m.userId}
              >
                Remove
              </button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>

    {#if teamAdmin}
      <form class="flex flex-wrap items-center gap-2" onsubmit={sendInvite}>
        <input
          class="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
          type="email"
          placeholder="colleague@example.com"
          bind:value={inviteEmail}
          required
        />
        <Select size="md" label="Invite role" options={ROLE_OPTIONS} bind:value={inviteRole} />
        <button
          class="rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-2 text-sm text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
          type="submit"
          disabled={busy === 'invite'}
        >
          {busy === 'invite' ? 'Inviting…' : 'Invite'}
        </button>
      </form>

      {#if data.invites.length}
        <div class="flex flex-col gap-2">
          <span class="cap-label text-[var(--color-muted)]">Pending invitations</span>
          {#each data.invites as inv (inv.token)}
            <div class="flex items-center justify-between gap-3 text-sm">
              <span class="truncate">{inv.email}</span>
              <div class="flex shrink-0 items-center gap-3">
                <!-- Always offered, whether or not email is configured: on a
                     self-host without RESEND_API_KEY the link IS the delivery. -->
                <button class="text-xs underline" onclick={() => copyInvite(inv.url)}>
                  Copy link
                </button>
                <button
                  class="text-xs text-[var(--color-danger)] underline"
                  onclick={() => revokeInvite(inv.token)}
                >
                  Revoke
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {/if}

    {#if !isOwner}
      <!-- The owner can't leave — removeMember refuses (cannot_remove_owner).
           They hand the workspace over first, or delete the account. -->
      <div class="flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-4">
        <span class="text-sm text-[var(--color-muted)]">
          Leave this workspace and go back to your own.
        </span>
        <button
          class="shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-danger-border)] px-3 py-2 text-sm text-[var(--color-danger)] disabled:opacity-60"
          onclick={leaveWorkspace}
          disabled={busy === 'leave'}
        >
          {busy === 'leave' ? 'Leaving…' : 'Leave workspace'}
        </button>
      </div>
    {/if}
  </section>

  <section id="bookmarklet" style="scroll-margin-top:1rem" class="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
    <h2 class="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]"><Bookmark size={14} strokeWidth={2} /> Bookmarklet</h2>
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

  <section id="calendars" style="scroll-margin-top:1rem"
    class="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
  >
    <h2 class="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
      <CalendarDays size={14} strokeWidth={2} /> Calendars
    </h2>
    <p class="text-sm text-[var(--color-muted)]">
      Subscribe to a calendar and meetings become interactions automatically, linked to the
      attendees you already have. No account connection — every calendar app can hand you a
      private feed URL.
    </p>
    <details class="text-xs text-[var(--color-muted)]">
      <summary class="cursor-pointer">Where do I find the URL?</summary>
      <ul class="mt-2 flex list-disc flex-col gap-1 pl-4">
        <li><strong>Google</strong> — Settings → click the calendar → “Secret address in iCal format”.</li>
        <li><strong>Apple</strong> — right-click the calendar → Share Calendar → Public Calendar.</li>
        <li><strong>Fastmail</strong> — Calendar → ⋯ → Export / Subscribe.</li>
        <li><strong>Outlook</strong> — Settings → Shared calendars → Publish, then copy the ICS link.</li>
      </ul>
    </details>
    <p
      class="rounded-[var(--radius-sm)] border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-3 py-2 text-xs text-[var(--color-warning)]"
    >
      That URL is a password. Anyone holding it can read your calendar. Heli stores it, never
      shows it again, and leaves it out of exports.
    </p>

    <div class="flex flex-wrap items-end gap-2">
      <label class="flex min-w-[220px] flex-[2] flex-col gap-1">
        <span class="cap-label">Feed URL</span>
        <input
          bind:value={calUrl}
          type="url"
          placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
          class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
        />
      </label>
      <label class="flex min-w-[120px] flex-1 flex-col gap-1">
        <span class="cap-label">Label</span>
        <input
          bind:value={calLabel}
          placeholder="Work"
          class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
        />
      </label>
      <label class="flex min-w-[160px] flex-1 flex-col gap-1">
        <span class="cap-label">Your own addresses</span>
        <input
          bind:value={calSelf}
          placeholder="you@work.com, you@home.com"
          class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
        />
      </label>
      <button
        type="button"
        onclick={addCalendar}
        disabled={calBusy}
        class="rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
      >
        {calBusy ? 'Adding…' : 'Add calendar'}
      </button>
    </div>

    {#if calendars.length > 0}
      <ul class="flex flex-col divide-y divide-[var(--color-border)]">
        {#each calendars as c (c.id)}
          <li class="flex flex-col gap-1.5 py-2.5">
            <div class="flex items-center gap-3">
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{c.label ?? 'Calendar'}</span>
                <span class="block truncate text-xs text-[var(--color-muted)]">
                  <code>{c.urlHint}</code>
                  {#if c.lastFetchedAt}
                    · synced {fmtWhen(c.lastFetchedAt)}
                  {:else}
                    · never synced
                  {/if}
                  {#if c.lastEventCount != null}
                    · {c.lastEventCount} events
                  {/if}
                  {#if c.lastSkippedRecurring}
                    · {c.lastSkippedRecurring} recurring skipped
                  {/if}
                </span>
              </span>
              <button
                type="button"
                onclick={() => syncCalendar(c.id)}
                disabled={calSyncing === c.id}
                class="shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-bg)]"
              >
                {calSyncing === c.id ? 'Syncing…' : 'Sync now'}
              </button>
              <button
                type="button"
                onclick={() => removeCalendar(c.id, c.label)}
                class="shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-danger)] hover:border-[var(--color-danger)]"
              >
                Remove
              </button>
            </div>

            {#if c.lastError}
              <p class="text-xs text-[var(--color-danger)]">{c.lastError}</p>
            {/if}

            <div class="flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
              <span>Attendees:</span>
              <button
                type="button"
                onclick={() => setMatchMode(c.id, 'known')}
                class="rounded-full border px-2 py-0.5 {c.matchMode === 'known'
                  ? 'border-[var(--color-border-strong)] bg-[var(--color-highlight-bg)] text-[var(--color-text)]'
                  : 'border-[var(--color-border)]'}">link people I already have</button
              >
              <button
                type="button"
                onclick={() => setMatchMode(c.id, 'all')}
                class="rounded-full border px-2 py-0.5 {c.matchMode === 'all'
                  ? 'border-[var(--color-border-strong)] bg-[var(--color-highlight-bg)] text-[var(--color-text)]'
                  : 'border-[var(--color-border)]'}">create everyone</button
              >
              <button
                type="button"
                onclick={() => previewCalendar(c.id)}
                class="underline">what would that do?</button
              >
            </div>
            {#if calPreview[c.id]}
              <p class="text-xs text-[var(--color-subtle)]">{calPreview[c.id]}</p>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <p class="text-xs text-[var(--color-subtle)]">No calendars yet.</p>
    {/if}
  </section>

  <DevicesSection devices={data.devices} />

  <section id="tokens" style="scroll-margin-top:1rem"
    class="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
  >
    <h2 class="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
      <KeyRound size={14} strokeWidth={2} /> Personal access tokens
    </h2>
    <p class="text-sm text-[var(--color-muted)]">
      For the browser extension, scripts, and anything else that talks to
      <a href="https://github.com/heindewilde/heli/blob/main/API.md" class="underline" target="_blank" rel="noopener">the API</a>. A token acts as you, in this workspace, and
      can never do more than your role allows.
    </p>

    {#if freshSecret}
      <div
        class="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-[var(--color-success-border)] bg-[var(--color-success-bg)] px-3 py-2"
      >
        <p class="text-xs font-medium text-[var(--color-success)]">
          Copy this now — it is not shown again.
        </p>
        <div class="flex items-center gap-2">
          <code
            class="min-w-0 flex-1 truncate rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs"
            >{freshSecret}</code
          >
          <button
            type="button"
            onclick={copySecret}
            class="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs"
          >
            {#if secretCopied}<Check size={12} strokeWidth={2} /> Copied{:else}<Copy
                size={12}
                strokeWidth={2}
              /> Copy{/if}
          </button>
        </div>
      </div>
    {/if}

    <div class="flex flex-wrap items-end gap-2">
      <label class="flex min-w-[200px] flex-1 flex-col gap-1">
        <span class="cap-label">Name</span>
        <input
          bind:value={tokenName}
          placeholder="Browser extension"
          class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
        />
      </label>
      <div class="flex flex-col gap-1">
        <span class="cap-label">Scopes</span>
        <div class="flex gap-1">
          {#each ['read', 'write', 'capture'] as scope (scope)}
            <button
              type="button"
              onclick={() => toggleScope(scope)}
              aria-pressed={tokenScopes.includes(scope)}
              class="rounded-full border px-2.5 py-1 text-xs transition-colors {tokenScopes.includes(
                scope
              )
                ? 'border-[var(--color-border-strong)] bg-[var(--color-highlight-bg)] text-[var(--color-text)]'
                : 'border-[var(--color-border)] text-[var(--color-muted)]'}"
            >
              {scope}
            </button>
          {/each}
        </div>
      </div>
      <button
        type="button"
        onclick={createApiToken}
        disabled={tokenBusy || tokenScopes.length === 0}
        class="rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
      >
        {tokenBusy ? 'Creating…' : 'Create token'}
      </button>
    </div>

    {#if tokens.length > 0}
      <ul class="flex flex-col divide-y divide-[var(--color-border)]">
        {#each tokens as t (t.id)}
          <li class="flex items-center gap-3 py-2">
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium">{t.name}</span>
              <span class="block truncate text-xs text-[var(--color-muted)]">
                <code>{t.prefix}…</code> · {t.scopes.join(', ')} · used {fmtWhen(t.lastUsedAt)}
              </span>
            </span>
            <button
              type="button"
              onclick={() => revokeApiToken(t.id, t.name)}
              class="shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-danger)] hover:border-[var(--color-danger)]"
            >
              Revoke
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="text-xs text-[var(--color-subtle)]">No tokens yet.</p>
    {/if}
  </section>

  {#if teamAdmin}
  <section id="export" style="scroll-margin-top:1rem" class="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
    <h2 class="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]"><Download size={14} strokeWidth={2} /> Export</h2>
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
      <a href="/api/export?kind=projects" class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-bg)]">
        <Download size={14} strokeWidth={2} /> Projects
      </a>
      <a href="/api/export?kind=time" class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-bg)]">
        <Download size={14} strokeWidth={2} /> Tracked time
      </a>
    </div>
    <p class="text-xs text-[var(--color-muted)]">
      Heli does not generate invoices. The tracked-time CSV carries the rate that was in force
      when each entry was recorded, so it is what you bill from.
    </p>
  </section>
  {/if}

  <!-- Importing bulk-inserts into the shared people table, so POST /api/import
       is admin-only; don't show members a flow that ends in a 403.

       One section, two sources, one handoff. Both stage into the same pending
       import and are reviewed and committed on /settings/import, so nothing
       below is duplicated per source. -->
  {#if teamAdmin}
    <section id="import" style="scroll-margin-top:1rem" class="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <h2 class="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]"><Users size={14} strokeWidth={2} /> Import contacts</h2>

      {#if data.importError}
        <p class="rounded-[var(--radius-sm)] border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3 py-2 text-sm text-[var(--color-danger)]">
          Could not connect to Google. Please try again.
        </p>
      {/if}
      {#if csvError}
        <p class="rounded-[var(--radius-sm)] border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3 py-2 text-sm text-[var(--color-danger)]">
          {csvError}
        </p>
      {/if}

      {#if data.pendingImport}
        <div class="flex flex-wrap items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
          <p class="min-w-0 flex-1 text-sm">
            <strong>{data.pendingImport.totalToImport}</strong> contact{data.pendingImport.totalToImport !== 1 ? 's' : ''} staged
            {#if data.pendingImport.duplicateCount > 0}
              · <span class="text-[var(--color-muted)]">{data.pendingImport.duplicateCount} already in {APP_NAME}, left out</span>
            {/if}
          </p>
          <a
            href="/settings/import"
            class="rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-[var(--color-accent-fg)] transition-colors hover:bg-[var(--color-accent-hover)]"
          >Review and import</a>
          <button
            type="button"
            onclick={discardImport}
            class="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-surface)]"
          >Discard</button>
        </div>
      {:else}
        <p class="text-sm text-[var(--color-muted)]">
          Bring an existing address book into {APP_NAME}. Nothing is written until you've
          been through the list and picked who to keep, and people already here are skipped.
        </p>
        <div class="flex flex-wrap items-center gap-2">
          {#if data.googleAuthEnabled}
            <a
              href="/auth/google/contacts"
              class="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-surface)]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google Contacts
            </a>
          {/if}
          <label
            class="inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-surface)]"
            class:opacity-60={csvBusy}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#0A66C2" d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05a3.74 3.74 0 0 1 3.37-1.85c3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zm1.78 13.02H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.22.79 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z"/>
            </svg>
            {csvBusy ? 'Reading…' : 'LinkedIn connections (.csv)'}
            <input
              type="file"
              accept=".csv,text/csv"
              class="hidden"
              disabled={csvBusy}
              onchange={uploadLinkedInCsv}
            />
          </label>
        </div>
        <p class="text-xs text-[var(--color-subtle)]">
          LinkedIn has no API for other people's profiles, so the export is the reliable
          route in. Get it from
          <a
            href="https://www.linkedin.com/mypreferences/d/download-my-data"
            target="_blank"
            rel="noopener"
            class="underline"
          >Settings → Get a copy of your data → Connections</a>,
          then upload the <code>Connections.csv</code> from the archive. It carries name,
          profile URL, company and position — and an email only for connections who chose
          to share it, which is most often nobody.
        </p>
      {/if}
    </section>
  {/if}

  <section id="account" style="scroll-margin-top:1rem" class="flex flex-col gap-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
    <h2 class="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]"><User size={14} strokeWidth={2} /> Account</h2>

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

  <section id="danger" style="scroll-margin-top:1rem" class="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] p-5">
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
