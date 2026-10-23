// The app shell remains owned by the navigation worker. Registration is isolated here.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // An unavailable service worker must not block the authenticated web app.
    });
  });
}
