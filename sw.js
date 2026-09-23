// 9jaCash service worker — exists solely to receive Web Push events and show
// them as real OS-level notifications, including while the app/browser tab
// isn't open at all. Registered from dashboard.html's subscribeToPush().
//
// Deliberately does NOT do any asset caching / offline support — the app
// isn't a full offline-first PWA, so keeping this worker minimal avoids it
// silently serving stale HTML/JS after a deploy.

self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

// A tap-through URL is only unambiguous if it's a path ("/dashboard.html")
// or already has a scheme ("https://..."). Anything else — most commonly an
// admin typing a bare domain like "www.9jacash.com.ng" into the broadcast
// notification's URL field — has no way to be told apart from a relative
// path, so the browser resolves it as one: navigating to
// "https://<this-site>/www.9jacash.com.ng", which 404s ("Cannot GET
// /www.9jacash.com.ng"). Treat anything that isn't already unambiguous as an
// external https:// address instead, since that's what a bare domain means.
function normalizeNotificationUrl(url) {
  if (!url) return '/dashboard.html';
  if (url.indexOf('/') === 0 || /^https?:\/\//i.test(url)) return url;
  return 'https://' + url;
}

self.addEventListener('push', function (event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: '9jaCash', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || '9jaCash';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || ('9jacash-' + Date.now()),
    requireInteraction: true,
    data: { url: normalizeNotificationUrl(data.url) }
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      // Also hand the raw push straight to any open 9jaCash tab so it can
      // react right away (re-sync userData) instead of only finding out
      // about the change next time it's focused/reloaded — e.g. an admin
      // flipping Account Verification off for this user should make the
      // "Verify Linked Account" button/popup reappear immediately, not
      // whenever the tab happens to regain focus.
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
        clientList.forEach(function (client) {
          client.postMessage({ type: '9jacash-push', title, body: options.body, url: options.data.url });
        });
      })
    ])
  );
});

// Clicking the notification focuses an already-open 9jaCash tab if there is
// one, otherwise opens a new one at the relevant page.
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/dashboard.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (const client of clientList) {
        if ('focus' in client) {
          // Best-effort — some browsers restrict navigate() on unfocused
          // clients, so a rejection here shouldn't stop us from focusing.
          if ('navigate' in client) client.navigate(targetUrl).catch(function () {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
