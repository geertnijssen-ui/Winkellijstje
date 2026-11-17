import { PUBLIC_VAPID_PUBLIC_KEY } from '$env/static/public';
import { supabase } from './supabase';

function urlBase64ToUint8Array(base64: string) {
	const padding = '='.repeat((4 - (base64.length % 4)) % 4);
	const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
	return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSupport(): 'ok' | 'install-first' | 'unsupported' {
	if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
		const ios = /iphone|ipad/i.test(navigator.userAgent);
		const standalone = (navigator as { standalone?: boolean }).standalone || matchMedia('(display-mode: standalone)').matches;
		return ios && !standalone ? 'install-first' : 'unsupported';
	}
	return 'ok';
}

export async function currentSubscription() {
	if (pushSupport() !== 'ok') return null;
	const reg = await navigator.serviceWorker.ready;
	return reg.pushManager.getSubscription();
}

export async function enablePush(userId: string) {
	const permission = await Notification.requestPermission();
	if (permission !== 'granted') throw new Error('Meldingen zijn niet toegestaan. Zet ze aan in Instellingen > Meldingen.');
	const reg = await navigator.serviceWorker.ready;
	const sub =
		(await reg.pushManager.getSubscription()) ??
		(await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_PUBLIC_KEY) }));
	const json = sub.toJSON();
	const { error } = await supabase.from('push_subscriptions').upsert(
		{ user_id: userId, endpoint: sub.endpoint, p256dh: json.keys!.p256dh, auth: json.keys!.auth },
		{ onConflict: 'endpoint' }
	);
	if (error) throw error;
}

export async function disablePush() {
	const sub = await currentSubscription();
	if (!sub) return;
	await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
	await sub.unsubscribe();
}
