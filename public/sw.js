// COS service worker — bump CACHE_VERSION to force clients onto new assets.
const CACHE_VERSION = "cos-v9";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;
const OFFLINE_URL = "/offline.html";

const PRECACHE = [OFFLINE_URL, "/manifest.json", "/icon-192.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET requests on our own origin. Everything else
  // (server actions/POST, Supabase, Groq, cross-origin) passes straight through.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API routes — always go to the network.
  if (url.pathname.startsWith("/api/")) return;

  // Authenticated portal pages are NEVER cached: a cached HTML snapshot could
  // flash a previous (or signed-out) session's data for a moment before the
  // server re-checks the cookie. Always hit the network; fall back only to the
  // offline page when genuinely offline.
  if (request.mode === "navigate" && url.pathname.startsWith("/portal")) {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // HTML navigations: network-first, fall back to cache, then the offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match(OFFLINE_URL);
        })
    );
    return;
  }

  // Static assets (Next build output, images, fonts): stale-while-revalidate.
  if (url.pathname.startsWith("/_next/static/") || /\.(?:png|svg|jpg|jpeg|webp|ico|woff2?|css|js)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});

// --- Push notifications -------------------------------------------------
// Server sends a JSON payload: { title, body, url, tag, count } and, for
// actionable notifications: { id, actions: ["open","done","snooze"],
// taskCode, threadId }. All of the action fields are optional — older
// payloads (and the cron operations alert) just open the deep link.
const ACTION_LABELS = {
  open: "Open",
  done: "Mark done",
  snooze: "Snooze",
};

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "COS", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "COS";

  // Build the action buttons from the payload's action ids. We never show
  // "open" as a button — tapping the notification body already opens it,
  // and a duplicate button just wastes the limited action slots. Unknown
  // ids are ignored so a future payload can't break older clients.
  const actions = Array.isArray(data.actions)
    ? data.actions
        .filter((a) => a !== "open" && ACTION_LABELS[a])
        .slice(0, 2) // most platforms only render two action buttons
        .map((a) => ({ action: a, title: ACTION_LABELS[a] }))
    : [];

  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "cos",
    // Re-alert (sound + heads-up) even when a notification with the same tag is
    // already showing — otherwise a 2nd message in the same chat silently replaces
    // the first with no sound. requireInteraction keeps it until tapped on Android.
    renotify: true,
    // Carry everything the click handler needs to act offline (no window open).
    data: {
      url: data.url || "/",
      id: typeof data.id === "number" ? data.id : null,
      taskCode: data.taskCode || null,
      threadId: typeof data.threadId === "number" ? data.threadId : null,
    },
    actions,
  };
  // Badge the installed-app icon (Android / desktop PWA / iOS 16.4+ home screen)
  // even while the app is closed. The page sets the exact count and clears it
  // when opened; here we just light it up. `data.count` is used when supplied.
  try {
    if (self.navigator && self.navigator.setAppBadge) self.navigator.setAppBadge(data.count || 1);
  } catch {
    /* unsupported */
  }

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      // Nudge any open tab so the in-app bell refreshes its count/list in
      // real time, not on the next poll.
      refreshBell(),
    ])
  );
});

// Nudge any open tab so the in-app bell refreshes its count/list.
function refreshBell() {
  return self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((clients) => {
      for (const client of clients) client.postMessage({ type: "cos-notification" });
    });
}

// Open (focus an existing tab if one is open, else open a new one).
function openTarget(target) {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    for (const client of clients) {
      if ("focus" in client) {
        client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  });
}

// POST an action to the act endpoint. Works with no window open (the SW can
// fetch in the background). Best-effort — failures are swallowed so a flaky
// network never throws out of the click handler. credentials:"include" sends
// the admin/portal session cookie so the route can scope to the recipient.
function postAct(action, info) {
  return fetch("/api/notifications/act", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      id: info.id,
      action,
      taskCode: info.taskCode || undefined,
      threadId: info.threadId || undefined,
    }),
  }).catch(() => {});
}

self.addEventListener("notificationclick", (event) => {
  const info = (event.notification && event.notification.data) || {};
  const target = info.url || "/";
  const act = event.action; // "" for a body tap, else the action id

  event.notification.close();

  // "done" / "snooze" act in the background and DON'T navigate — the whole
  // point of the buttons is to clear the item without opening the app.
  if ((act === "done" || act === "snooze") && typeof info.id === "number") {
    event.waitUntil(Promise.all([postAct(act, info), refreshBell()]));
    return;
  }

  // Body tap, "open", or any unhandled action → deep-link as before.
  event.waitUntil(Promise.all([openTarget(target), refreshBell()]));
});
