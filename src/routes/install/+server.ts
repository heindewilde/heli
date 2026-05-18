import type { RequestHandler } from '@sveltejs/kit';

// Friendly redirect for the one-line self-host installer:
//   curl -sSL https://heli.so/install | sudo sh
// The script itself lives at the repo root so it's also available via the
// raw GitHub URL and can be reviewed before piping into a shell.
const SCRIPT_URL =
  'https://raw.githubusercontent.com/heindewilde/heli/main/install.sh';

export const GET: RequestHandler = () =>
  new Response(null, {
    status: 302,
    headers: {
      location: SCRIPT_URL,
      'cache-control': 'public, max-age=300'
    }
  });
