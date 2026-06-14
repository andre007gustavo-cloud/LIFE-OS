/**
 * LIFE OS — Service Worker
 * Estratégia:
 *  - Arquivos locais (JS/CSS/HTML): pre-cache no install, cache-first no runtime
 *  - CDN externo (Firebase SDK, Tabler Icons): cache-first após primeiro fetch
 *  - APIs Firebase/Google (Firestore, Auth): pass-through (Firebase gerencia offline)
 *
 * Para publicar nova versão: incremente CACHE_VERSION.
 */

const CACHE_VERSION = 'v20260614-fase4-cartoes';
const CACHE_NAME = `lifeos-${CACHE_VERSION}`;

// Domínios do Firebase/Google — deixa passar, Firebase cuida do offline via IndexedDB
const FIREBASE_BYPASS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebase.googleapis.com',
  'googleapis.com',
  'apis.google.com',
  'accounts.google.com',
  'fcm.googleapis.com',
  'firebaseinstallations.googleapis.com',
];

// Arquivos locais pré-cacheados na instalação do SW
const PRECACHE = [
  '/',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/maskable.svg',
  '/css/base.css',
  '/css/components.css',
  '/css/dashboard.css',
  '/css/tasks.css',
  '/css/calendar.css',
  '/css/finance.css',
  '/css/projects.css',
  '/css/habits.css',
  '/css/review.css',
  '/css/now.css',
  '/css/responsive.css',
  '/js/config/constants.js',
  '/js/core/utils.js',
  '/js/core/quickParser.js',
  '/js/core/firebase.js',
  '/js/core/storage.js',
  '/js/core/state.js',
  '/js/services/taskService.js',
  '/js/services/areaService.js',
  '/js/services/inboxService.js',
  '/js/services/projectService.js',
  '/js/services/financeService.js',
  '/js/services/cartaoService.js',
  '/js/services/pomodoroService.js',
  '/js/services/habitService.js',
  '/js/services/reviewService.js',
  '/js/services/activityService.js',
  '/js/ui/navigation.js',
  '/js/ui/theme.js',
  '/js/ui/modal.js',
  '/js/ui/mobile.js',
  '/js/components/feedback.js',
  '/js/components/settingsModal.js',
  '/js/components/taskModal.js',
  '/js/components/areaModal.js',
  '/js/components/financeModal.js',
  '/js/components/projectModal.js',
  '/js/components/imageResize.js',
  '/js/components/noteEditor.js',
  '/js/components/fileHandler.js',
  '/js/components/pomodoroUI.js',
  '/js/components/loginScreen.js',
  '/js/components/inboxCapture.js',
  '/js/components/commandPalette.js',
  '/js/components/nextUpBar.js',
  '/js/components/datePopover.js',
  '/js/components/quickAddShared.js',
  '/js/components/quickAddPopover.js',
  '/js/components/financeQuickAdd.js',
  '/js/components/financeBudget.js',
  '/js/components/financeRecorrencias.js',
  '/js/components/financeCartoes.js',
  '/js/components/financeCartaoModal.js',
  '/js/views/dashboardView.js',
  '/js/views/tasksView.js',
  '/js/views/taskDetail.js',
  '/js/views/calendarView.js',
  '/js/views/financeView.js',
  '/js/views/areasView.js',
  '/js/views/habitsView.js',
  '/js/views/reviewView.js',
  '/js/views/comebackView.js',
  '/js/views/nowView.js',
  '/js/app.js',
  '/js/pwa.js',
];

// ===== INSTALL: pré-cacheia todos os assets locais =====
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(err => {
        console.warn('[SW] Pre-cache parcialmente falhou:', err);
        return self.skipWaiting();
      })
  );
});

// ===== ACTIVATE: remove caches antigos =====
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k.startsWith('lifeos-') && k !== CACHE_NAME)
          .map(k => {
            console.log('[SW] Removendo cache antigo:', k);
            return caches.delete(k);
          })
      ))
      .then(() => self.clients.claim())
  );
});

// ===== FETCH: intercepta requisições =====
self.addEventListener('fetch', event => {
  const { request } = event;

  // Só intercepta GET
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Firebase/Google: deixa passar completamente
  if (FIREBASE_BYPASS.some(domain => url.hostname.includes(domain))) return;

  // Assets de CDN externo (Firebase SDK, Tabler Icons, etc): cache-first
  if (url.origin !== self.location.origin) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Documento HTML principal: network-first (garante app atualizado)
  if (request.destination === 'document') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Assets locais (JS, CSS, imagens): cache-first
  event.respondWith(cacheFirst(request));
});

// ===== Estratégias de cache =====

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    // Cacheia respostas válidas (inclui opaque responses de CDN)
    if (response.ok || response.status === 0) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Fallback: tenta servir a raiz
    const root = await caches.match('/');
    return root || new Response('App offline', { status: 503 });
  }
}
