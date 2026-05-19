// Watches the service worker registration for an update — when a new SW is
// installed while another one is already controlling the page, we expose a
// reactive `updateAvailable` flag so the UI can prompt the user to reload.
// Calling `applyUpdate()` posts SKIP_WAITING to the waiting worker; the
// resulting `controllerchange` event reloads the page once.

import { browser } from '$app/environment';

let updateAvailable = $state(false);
let waitingWorker: ServiceWorker | null = null;

export function swStatus() {
  return {
    get updateAvailable() {
      return updateAvailable;
    }
  };
}

export function applyUpdate(): void {
  if (!waitingWorker) {
    location.reload();
    return;
  }
  waitingWorker.postMessage('SKIP_WAITING');
  // controllerchange fires once the new SW takes over; reload there.
}

export function watchServiceWorker(): void {
  if (!browser || !('serviceWorker' in navigator)) return;

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });

  navigator.serviceWorker.ready
    .then((registration) => {
      const promote = (worker: ServiceWorker | null) => {
        if (!worker) return;
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          waitingWorker = worker;
          updateAvailable = true;
        }
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            waitingWorker = worker;
            updateAvailable = true;
          }
        });
      };
      promote(registration.waiting);
      registration.addEventListener('updatefound', () => promote(registration.installing));
    })
    .catch(() => {});
}
