// COS service worker — bump CACHE_VERSION to force clients onto new assets.
const CACHE_VERSION = "cos-v15"; // v15 = a cached page keeps its own JS (one visit is now enough). v14 = the offline screen matches the real one.
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const OFFLINE_URL = "/offline.html";

/* The one page of the app itself that is kept for offline use.
 *
 * ⚠️ EXACTLY ONE, AND IT MUST HOLD NO DATA. Everything else here refuses to cache
 * an HTML page on purpose: COS sits behind a login, and a cached page could show
 * a stale or another person's screen. /notes/offline is the deliberate exception
 * because it is an EMPTY SHEET OF PAPER — a client-only page with nothing from
 * the server in it. What you write lives in the device's own store, never in this
 * cached HTML. If that page ever starts loading real records, it stops being
 * safe to keep here. */
const WRITE_OFFLINE_URL = "/notes/offline";

const PRECACHE = [OFFLINE_URL, "/manifest.json", "/icon-192.png", "/apple-touch-icon.png"];

/**
 * Keep a page's OWN JavaScript and CSS beside it.
 *
 * ⚠️ WITHOUT THIS, A CACHED PAGE IS A BLANK SCREEN. Static assets are cached as
 * they are requested — but the requests made while the worker was still
 * installing were never intercepted, because nothing was controlling the page
 * yet. So after ONE visit the cache held the HTML and not one chunk, and going
 * offline gave an empty white page. It took two visits to work, and nobody was
 * ever told that. (Measured: 0 chunks after the first visit, 30 after the
 * second.) Reading the assets out of the HTML makes one visit enough.
 */
async function cacheOwnAssets(cache, html) {
  try {
    const urls = [...new Set(Array.from(html.matchAll(/\/_next\/static\/[^"'\s>]+/g), (m) => m[0]))]
      .filter((u) => !u.endsWith(".map"));
    // Individually, so one missing file cannot throw the whole lot away.
    await Promise.all(urls.map((u) => cache.add(u).catch(() => {})));
  } catch {
    /* the page is still cached; it will fill in on the next visit */
  }
}

/** Fetch the write-offline page and keep it, with the code it needs to run.
 *  Best-effort and never fatal: if the worker installs while signed out or
 *  offline, the page is picked up the next time it is visited. */
async function cacheWriteOffline(cache) {
  try {
    const res = await fetch(WRITE_OFFLINE_URL, { credentials: "same-origin" });
    // Only a real page. A redirect to /login is not one, and caching it would
    // put a sign-in screen where the writing surface should be.
    if (!res || !res.ok || res.redirected) return;
    const html = await res.clone().text();
    await cache.put(WRITE_OFFLINE_URL, res.clone());
    await cacheOwnAssets(cache, html);
  } catch {
    /* offline at install time — try again later */
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then(async (cache) => {
        await cache.addAll(PRECACHE);
        await cacheWriteOffline(cache);
      })
      .then(() => self.skipWaiting())
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

  // HTML navigations are NEVER cached. The whole app (admin Administrator AND the
  // staff portal) sits behind a login, so a cached HTML snapshot could flash stale
  // or signed-out content — and, worse, a transient 404/redirect response would get
  // frozen into the cache and served back forever as "not found" in the installed
  // PWA. Always hit the network; fall back to the offline page only when genuinely
  // offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Keep the write-offline page fresh whenever it is visited normally —
          // and its code with it, because a deploy renames every chunk and the
          // page would otherwise point at files that are no longer cached.
          if (url.pathname === WRITE_OFFLINE_URL && res.ok && !res.redirected) {
            const copy = res.clone();
            const forAssets = res.clone();
            caches
              .open(STATIC_CACHE)
              .then(async (c) => {
                await c.put(WRITE_OFFLINE_URL, copy);
                await cacheOwnAssets(c, await forAssets.text());
              })
              .catch(() => {});
          }
          return res;
        })
        .catch(async () => {
          // ⚠️ Somewhere in Notes with no connection? Give the writing surface
          // rather than a dead end. It is the only app page kept, and it holds
          // no data — see WRITE_OFFLINE_URL above.
          const sheet = await caches.match(WRITE_OFFLINE_URL);
          if (sheet) {
            if (url.pathname === WRITE_OFFLINE_URL) return sheet;
            if (url.pathname.startsWith("/notes")) {
              // ⚠️ REDIRECT rather than serve that page's HTML at this URL. The
              // cached document carries its own route data; handing it back for
              // /notes/123 would leave the client router hydrating one page while
              // the address bar claims another, and its first act would be to
              // fetch the real route — which is exactly what is not available.
              // A redirect puts the page at its own address, where it is correct.
              //
              // ⚠️ CARRY THE NOTE ACROSS. Asking for /notes/123 and landing on a
              // list is not the same experience — the offline surface opens the
              // note that was actually asked for.
              const id = url.pathname.match(/^\/notes\/(\d+)/);
              return Response.redirect(id ? `${WRITE_OFFLINE_URL}?note=${id[1]}` : WRITE_OFFLINE_URL, 302);
            }
          }
          return caches.match(OFFLINE_URL);
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
