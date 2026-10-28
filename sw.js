const C = "novel-reader-v4";

const F = [
    "./",
    "./index.html",
    "./style.css",
    "./app.js",
    "./manifest.json"
];

self.addEventListener("install", e => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(C).then(cache => cache.addAll(F))
    );
});

self.addEventListener("activate", e => {
    e.waitUntil(
        Promise.all([
            caches.keys().then(keys =>
                Promise.all(
                    keys
                        .filter(key => key.startsWith("novel-reader-") && key !== C)
                        .map(key => caches.delete(key))
                )
            ),
            self.clients.claim()
        ])
    );
});

self.addEventListener("fetch", e => {
    if (e.request.method !== "GET") return;

    e.respondWith(
        fetch(e.request).then(response => {
            if (response.ok) {
                const copy = response.clone();

                caches.open(C).then(cache => {
                    cache.put(e.request, copy);
                });
            }

            return response;
        }).catch(() => caches.match(e.request))
    );
});
