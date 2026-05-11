import { redirect } from '@sveltejs/kit';

// The dedicated "new person" page is gone — creation is inline on the list
// page (type a name, press Enter). Keep this route as a permanent 308
// redirect so any bookmarks, share links, or stale tabs land on the list
// where the inline create row is.
export const load = () => {
  throw redirect(308, '/people');
};
