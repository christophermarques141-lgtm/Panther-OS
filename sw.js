importScripts("/scram/scramjet.bundle.js");
const { ScramjetServiceWorker } = $scramjetLoadWorker();
const sw = new ScramjetServiceWorker();
self.addEventListener("fetch", (event) => {
  if (sw.route(event)) event.respondWith(sw.fetch(event));
});