// Iron Log service worker (v16.2)
// Network first for the app shell so a new release shows up on the next open, not days later;
// the cached copy is only used when the network is unavailable. API calls are never touched.
const CACHE = "iron-log-shell-v1";
const SHELL = /\/(index\.html|nutrition\.js|records\.js|bodymap\.json|privacy\.html|manifest\.json|manifest\.webmanifest)?$/;
self.addEventListener("install", e=>{ self.skipWaiting(); });
self.addEventListener("activate", e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch", e=>{
  const req = e.request;
  if (req.method!=="GET") return;
  const url = new URL(req.url);
  if (url.origin!==self.location.origin || !SHELL.test(url.pathname)) return;
  const key = url.origin + url.pathname;          // ignore ?v= so one copy per file is kept
  e.respondWith(
    fetch(req, {cache:"no-cache"}).then(res=>{
      if (res && res.ok){ const copy = res.clone(); caches.open(CACHE).then(c=>c.put(key, copy)).catch(()=>{}); }
      return res;
    }).catch(()=>caches.open(CACHE).then(c=>c.match(key)).then(hit=>hit || Response.error()))
  );
});
