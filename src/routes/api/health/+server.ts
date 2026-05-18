import { client } from '$lib/server/db';
import { VERSION } from '$lib/version';

export const GET = async () => {
  try {
    await client().execute('SELECT 1');
  } catch {
    return new Response(JSON.stringify({ status: 'error', reason: 'db', version: VERSION }), {
      status: 503,
      headers: { 'content-type': 'application/json' }
    });
  }
  return Response.json({ status: 'ok', version: VERSION });
};
