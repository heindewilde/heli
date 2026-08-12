import { clearCredential, loadCredential, saveCredential, type Credential } from './credentials';

/**
 * The one place the app talks to a Heli server.
 *
 * Every response goes through `/api/v1`'s documented envelope — `{ data }` or
 * `{ error: { code, message } }` — because `reshapeApiError` in
 * `hooks.server.ts` normalises even thrown SvelteKit errors into it. So this
 * client can assume one shape unconditionally, which is why there is no
 * defensive parsing below.
 */

export type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'invalid_request'
  | 'rate_limited'
  | 'server_error'
  /** Local: the request never reached a server. Not produced by the API. */
  | 'offline';

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /**
   * Worth retrying later from the outbox. Everything else is a decision the
   * server has made and will make again, so replaying it just burns battery.
   */
  get retryable(): boolean {
    return this.code === 'offline' || this.code === 'rate_limited' || this.status >= 500;
  }
}

export type Paged<T> = { data: T[]; nextCursor: string | null };

/** Called when a credential stops working, so the UI can route to pairing. */
let onSignedOut: (() => void) | null = null;
export function setSignedOutHandler(fn: () => void): void {
  onSignedOut = fn;
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Set on writes replayed from the outbox so a retry cannot double-create. */
  idempotencyKey?: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
};

function buildUrl(server: string, path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${server}/api/v1${path}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== null && v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }
  return url.toString();
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const cred = await loadCredential();
  if (!cred) throw new ApiError('unauthorized', 'Not paired.', 401);
  return requestWith<T>(cred, path, opts);
}

export async function requestWith<T>(
  cred: Credential,
  path: string,
  opts: RequestOptions = {}
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cred.token}`,
    Accept: 'application/json'
  };
  // Sent on every request. The server falls back to the device's last workspace
  // and then to the default membership, so omitting it is safe — but a client
  // that thinks it switched workspace and did not would read the wrong tenant's
  // data as the right one, which is worth being explicit about.
  if (cred.workspaceId) headers['X-Heli-Workspace'] = cred.workspaceId;
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(buildUrl(cred.server, path, opts.query), {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal
    });
  } catch {
    // fetch rejects only on a transport failure. Everything else — including
    // every 4xx and 5xx — resolves, so this branch really is "no network".
    throw new ApiError('offline', 'No connection.', 0);
  }

  if (res.status === 204) return undefined as T;

  const payload = (await res.json().catch(() => null)) as
    | { data?: unknown; nextCursor?: string | null; error?: { code: string; message: string } }
    | null;

  if (!res.ok) {
    const code = (payload?.error?.code ?? 'server_error') as ApiErrorCode;
    const message = payload?.error?.message ?? `Request failed (${res.status})`;

    // A dead credential is not an error the caller can do anything about: wipe
    // it and let the app route to pairing. 403 is deliberately *not* included —
    // it means "not in that workspace", which is recoverable by switching.
    if (code === 'unauthorized') {
      await clearCredential();
      onSignedOut?.();
    }
    throw new ApiError(code, message, res.status);
  }

  // The server echoes the workspace it actually acted in. Recording it means a
  // freshly paired app learns its default without a second call to /me.
  const acted = res.headers.get('X-Heli-Workspace');
  if (acted && acted !== cred.workspaceId) {
    await saveCredential({ ...cred, workspaceId: acted });
  }

  if (payload && 'nextCursor' in payload) {
    return { data: payload.data, nextCursor: payload.nextCursor ?? null } as T;
  }
  return payload?.data as T;
}

/* ── pairing ─────────────────────────────────────────────────────────────── */

export type ClaimResult = {
  token: string;
  device: { id: string; name: string; platform: string };
  workspaces: { id: string; name: string; role: string }[];
  defaultWorkspaceId: string | null;
};

/**
 * Exchange a pairing code for a device token. The only unauthenticated call the
 * app makes, and the only one that takes an explicit server.
 */
export async function claimPairing(
  server: string,
  code: string,
  device: { name: string; platform: string; appVersion: string }
): Promise<ClaimResult> {
  let res: Response;
  try {
    res = await fetch(`${server}/api/v1/pairing/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        deviceName: device.name,
        platform: device.platform,
        appVersion: device.appVersion
      })
    });
  } catch {
    throw new ApiError('offline', `Could not reach ${server}.`, 0);
  }

  const payload = (await res.json().catch(() => null)) as
    | { data?: ClaimResult; error?: { code: string; message: string } }
    | null;

  if (!res.ok || !payload?.data) {
    throw new ApiError(
      (payload?.error?.code ?? 'server_error') as ApiErrorCode,
      payload?.error?.message ?? 'That code is not valid.',
      res.status
    );
  }
  return payload.data;
}

/** Unauthenticated health probe, used to validate a hand-typed server URL. */
export async function checkServer(server: string): Promise<boolean> {
  try {
    const res = await fetch(`${server}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}
