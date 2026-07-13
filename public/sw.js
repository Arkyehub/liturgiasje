// Basic Service Worker for PWA
const CACHE_NAME = 'liturgia-sje-v4';
const ASSETS_TO_CACHE = [
  '/',
  '/icons/android-chrome-192x192.png',
  '/icons/android-chrome-512x512.png',
  '/Logo-Liturgia-SJE.png'
];

self.addEventListener('install', (event) => {
  // self.skipWaiting(); // Removido para evitar que o SW assuma o controle sem ação do usuário, causando reloads
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Não cachear o próprio Service Worker para garantir que atualizações sejam detectadas
  if (url.pathname === '/sw.js') return;

  // 2. Apenas lidar com requisições GET
  if (event.request.method !== 'GET') return;

  // 3. NÃO cachear requisições de API (Supabase, etc)
  if (url.hostname.includes('supabase.co') || url.pathname.startsWith('/api/')) return;

  // 4. Estratégia Network-First para navegações (HTML principal)
  // Isso garante que se houver internet, ele sempre pega o HTML mais novo do servidor.
  if (event.request.mode === 'navigate' || (url.origin === self.location.origin && url.pathname === '/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Opcionalmente atualizar o cache com a versão nova
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch((err) => {
          // Se falhar a rede, tenta o cache
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            throw err; // Relança o erro de rede original se não houver cache
          });
        })
    );
    return;
  }

  // 4. Estratégia Stale-While-Revalidate para outros ativos (JS, CSS, Imagens)
  // Serve do cache IMEDIATAMENTE, mas busca na rede por trás para atualizar o cache para a próxima vez.
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const cacheCopy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cacheCopy));
        }
        return networkResponse;
      });

      return cachedResponse || fetchPromise;
    }).catch((err) => {
      throw err; // Evita retornar undefined para event.respondWith
    })
  );
});

// --- Início da lógica de Notificações Push ---

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const options = {
      body: data.body || 'Nova atualização no Liturgia SJE',
      icon: '/notification-icon.png', 
      badge: '/notification-icon.png',
      data: {
        url: data.url || '/'
      },
      vibrate: [100, 50, 100]
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'Liturgia SJE', options)
    );
  } catch (error) {
    console.error('Erro ao processar notificação push:', error);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Converter URL relativa para absoluta para comparação correta
  const urlToOpen = new URL(event.notification.data.url || '/', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        // Compara URLs absolutas
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
