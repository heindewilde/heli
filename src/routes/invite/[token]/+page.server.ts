import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { acceptInvite, getInvite, InviteError } from '$lib/server/invites';
import { switchWorkspace } from '$lib/server/auth';
import { setSessionCookie } from '$lib/server/cookies';

export const load: PageServerLoad = async ({ params, locals }) => {
  const invite = await getInvite(params.token);
  if (!invite) {
    return { token: params.token, invite: null, signedInAs: locals.user?.email ?? null, mismatch: false };
  }
  // Signed in as someone other than the invited address: say so plainly rather
  // than silently adding the wrong account to the workspace.
  const mismatch = !!locals.user && locals.user.email !== invite.email;
  return {
    token: params.token,
    invite: {
      workspaceName: invite.workspaceName,
      email: invite.email,
      role: invite.role,
      needsSignup: invite.needsSignup
    },
    signedInAs: locals.user?.email ?? null,
    mismatch
  };
};

export const actions: Actions = {
  default: async ({ params, locals, cookies }) => {
    if (!locals.user || !locals.sessionId) {
      // Bounce through auth, preserving the deep link.
      throw redirect(303, `/auth?next=${encodeURIComponent(`/invite/${params.token}`)}`);
    }
    try {
      const invite = await acceptInvite(params.token, locals.user.id, locals.user.email);
      // Land them in the workspace they just joined. Rotates the session id,
      // which also partitions the service worker's cached /api/* responses.
      const next = await switchWorkspace(
        locals.sessionId,
        locals.user.id,
        locals.user.region,
        invite.workspaceId
      );
      setSessionCookie(cookies, next.sessionId);
    } catch (err) {
      if (err instanceof InviteError) return fail(400, { code: err.code });
      throw err;
    }
    throw redirect(303, '/');
  }
};
