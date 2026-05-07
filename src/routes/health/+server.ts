import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = () => {
  return new Response('ok', {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
  });
};
