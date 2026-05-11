import { redirect } from '@sveltejs/kit';

// Dedicated "new company" page is gone — creation is inline on the list.
// 308 keeps stale links + bookmarks alive.
export const load = () => {
  throw redirect(308, '/companies');
};
