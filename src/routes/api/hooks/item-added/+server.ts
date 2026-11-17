import { json, error } from '@sveltejs/kit';
import webpush from 'web-push';
import { env } from '$env/dynamic/private';
import { PUBLIC_VAPID_PUBLIC_KEY } from '$env/static/public';
import { admin } from '$lib/server/admin';
import { formatQuantity } from '$lib/parse';
import type { RequestHandler } from './$types';

const SOURCE_LABEL: Record<string, string> = { keep: 'via Google Home', siri: 'via Siri' };

/**
 * Aangeroepen door Supabase (pg_net) zodra er een item bijkomt.
 * Stuurt een push-melding naar wie nu in winkelmodus staat (behalve wie het toevoegde).
 */
export const POST: RequestHandler = async ({ request }) => {
	if (!env.WEBHOOK_SECRET || request.headers.get('x-webhook-secret') !== env.WEBHOOK_SECRET) error(401, 'Nee');
	if (!env.VAPID_PRIVATE_KEY) return json({ skipped: 'geen VAPID-sleutel' });
	webpush.setVapidDetails(env.VAPID_SUBJECT || 'mailto:admin@example.com', PUBLIC_VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

	const { item_id } = await request.json();
	const db = admin();
	const { data: item } = await db.from('items').select('*, products(name)').eq('id', item_id).maybeSingle();
	if (!item) return json({ skipped: 'item niet gevonden' });

	const since = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
	const { data: shoppers } = await db
		.from('profiles')
		.select('id, shopping_store_id, stores:shopping_store_id(name)')
		.eq('household_id', item.household_id)
		.not('shopping_store_id', 'is', null)
		.gte('shopping_since', since);
	const targets = (shoppers ?? []).filter((s) => s.id !== item.added_by);
	if (targets.length === 0) return json({ sent: 0 });

	const { data: adder } = item.added_by
		? await db.from('profiles').select('display_name').eq('id', item.added_by).maybeSingle()
		: { data: null };
	const { data: links } = await db.from('product_stores').select('store_id').eq('product_id', item.product_id);
	const storeIds = new Set((links ?? []).map((l) => l.store_id));

	const name = (item.products as { name: string } | null)?.name ?? 'iets';
	const q = formatQuantity(item.quantity === null ? null : Number(item.quantity), item.unit);
	const who = adder?.display_name || 'Iemand';
	let sent = 0;

	for (const shopper of targets) {
		const storeName = (shopper.stores as unknown as { name: string } | null)?.name;
		const here = storeIds.has(shopper.shopping_store_id!);
		const where = storeIds.size === 0 ? 'nog geen winkel' : here ? `ligt hier in ${storeName}` : 'andere winkel';
		const payload = JSON.stringify({
			title: `${who} zette iets op de lijst`,
			body: `${[q, name].filter(Boolean).join(' ')}${item.note ? ` (${item.note})` : ''} · ${where}${SOURCE_LABEL[item.source] ? ` · ${SOURCE_LABEL[item.source]}` : ''}`,
			url: shopper.shopping_store_id ? `/winkel/${shopper.shopping_store_id}` : '/',
			tag: `item-${item.id}`
		});
		const { data: subs } = await db.from('push_subscriptions').select('*').eq('user_id', shopper.id);
		for (const sub of subs ?? []) {
			try {
				await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 3600 });
				sent++;
			} catch (e) {
				const status = (e as { statusCode?: number }).statusCode;
				if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('id', sub.id);
				else console.error('push mislukt', status, e);
			}
		}
	}
	return json({ sent });
};
