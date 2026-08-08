// Generuje build.py – needituj ručně.
const V = "batcave-4d3fd0bc";
const ASSETS = ["./", "./index.html", "./manifest.json", "./icon.png", "./icon-180.png", "./css/font.css?v=4d3fd0bc", "./css/style.css?v=4d3fd0bc", "./js/app.js?v=4d3fd0bc", "./js/icons.js?v=4d3fd0bc", "./js/plan.js?v=4d3fd0bc", "./js/sound.js?v=4d3fd0bc", "./js/spotify.js?v=4d3fd0bc", "./js/sync.js?v=4d3fd0bc", "./splash/1170x2532.png", "./splash/1179x2556.png", "./splash/1206x2622.png", "./splash/1290x2796.png", "./splash/1320x2868.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // cloud a Spotify vždycky ze sítě
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: false }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(V).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match("./index.html"));
    })
  );
});
