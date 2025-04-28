const CACHE_NAME = 'flowerasia-v1';
// Only cache essential assets that are needed for the offline screen
// We'll keep this minimal to ensure updates are applied immediately
const urlsToCache = [
  '/api/ping',
  '/favicon.svg'
];

// Version number to force cache updates
const VERSION = Date.now();

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  // Only allow caching of specific assets
  const url = new URL(event.request.url);
  
  // Check if this is a ping request (used to check connectivity)
  if (url.pathname === '/api/ping') {
    event.respondWith(new Response('pong', { status: 200 }));
    return;
  }
  
  // Add cache busting for all non-static assets
  // This ensures we always get the latest version
  const shouldNotCache = (
    url.pathname.includes('.js') || 
    url.pathname.includes('.css') || 
    url.pathname.includes('.html') || 
    url.pathname.includes('/api/') || 
    url.pathname === '/' ||
    event.request.mode === 'navigate'
  );
  
  if (shouldNotCache) {
    // For important resources, always go to network and don't cache
    const fetchRequest = new Request(event.request.url, {
      method: event.request.method,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      mode: event.request.mode,
      credentials: event.request.credentials,
      redirect: event.request.redirect
    });
    
    event.respondWith(
      fetch(fetchRequest)
        .catch(() => {
          // If network request fails, show offline screen for navigation
          if (event.request.mode === 'navigate') {
            return new Response(
              '<html><body><script>window.isOffline = true;</script></body></html>',
              { headers: { 'Content-Type': 'text/html' } }
            );
          }
          
          return new Response('Offline', { status: 503 });
        })
    );
    return;
  }
  
  // For other requests, try network first, then cache
  event.respondWith(
    fetch(event.request)
      .catch(() => {
        // If network request fails, only return cached assets for the offline screen
        return caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            
            // If not in cache and network failed, return a special response
            // that will trigger the offline screen
            if (event.request.mode === 'navigate') {
              return new Response(
                '<html><body><script>window.isOffline = true;</script></body></html>',
                { headers: { 'Content-Type': 'text/html' } }
              );
            }
            
            return new Response('Offline', { status: 503 });
          });
      })
  );
});

self.addEventListener('activate', event => {
  // Clear all caches on activation to ensure fresh content
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          console.log(`Clearing cache: ${cacheName}`);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      // Take control of all clients immediately
      return self.clients.claim();
    })
  );
});

// Add message handler to force update when requested
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
  
  if (event.data === 'clearCache') {
    caches.keys().then(cacheNames => {
      cacheNames.forEach(cacheName => {
        caches.delete(cacheName);
      });
    });
  }
});