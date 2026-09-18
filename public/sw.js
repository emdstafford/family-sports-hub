self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = data.title || "FamBam Sports";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "There is something new in FamBam!",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "fambam-update",
    data: { url: data.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    for (const windowClient of windows) {
      if ("focus" in windowClient) {
        windowClient.navigate(target);
        return windowClient.focus();
      }
    }
    return clients.openWindow(target);
  }));
});
