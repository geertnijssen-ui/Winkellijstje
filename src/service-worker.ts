/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `wl-${version}`;
const SHELL = '/';
const ASSETS = [...build, ...files];

sw.addEventListener('install', (event) => {
	// Niet meteen activeren: de app toont "Nieuwe versie klaar" en de gebruiker kiest wanneer.
	event.waitUntil(
		caches.open(CACHE).then(async (cache) => {
			await cache.addAll(ASSETS);
			const res = await fetch(SHELL, { cache: 'reload' });
			if (res.ok) await cache.put(SHELL, res);
		})
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
			await sw.clients.claim();
		})()
	);
});

sw.addEventListener('message', (event) => {
	if (event.data === 'SKIP_WAITING') sw.skipWaiting();
});

sw.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	if (url.origin !== sw.location.origin) return; // Supabase e.d. niet cachen
	if (url.pathname.startsWith('/api/')) return;

	if (ASSETS.includes(url.pathname)) {
		event.respondWith(caches.match(url.pathname).then((r) => r ?? fetch(req)));
		return;
	}
	if (req.mode === 'navigate') {
		// Netwerk eerst (vers), anders de bewaarde app-schil: de app werkt offline.
		event.respondWith(
			(async () => {
				try {
					const res = await fetch(req);
					return res;
				} catch {
					const cached = await caches.match(SHELL);
					return cached ?? new Response('Offline', { status: 503 });
				}
			})()
		);
	}
});

sw.addEventListener('push', (event) => {
	const data = event.data?.json() ?? {};
	event.waitUntil(
		sw.registration.showNotification(data.title ?? 'Winkellijstje', {
			body: data.body,
			tag: data.tag,
			icon: '/icon-192.png',
			badge: '/icon-192.png',
			data: { url: data.url ?? '/' }
		})
	);
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = event.notification.data?.url ?? '/';
	event.waitUntil(
		(async () => {
			const all = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
			for (const client of all) {
				if ('focus' in client) {
					await client.focus();
					(client as WindowClient).navigate(url).catch(() => {});
					return;
				}
			}
			await sw.clients.openWindow(url);
		})()
	);
});
