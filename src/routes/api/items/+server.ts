import { json, error } from '@sveltejs/kit';
import { admin, authToken } from '$lib/server/admin';
import { parseItem, splitItems } from '$lib/parse';
import type { RequestHandler } from './$types';

/**
 * Item(s) toevoegen vanuit Siri of het Google Keep-script.
 *
 *   POST /api/items
 *   Authorization: Bearer wl_...
 *   { "text": "melk, brood en 2 eieren", "source": "siri" }   (of gewoon platte tekst)
 */
export const POST: RequestHandler = async ({ request, url }) => {
	const caller = await authToken(request, url);
	const type = request.headers.get('content-type') ?? '';
	let text = '';
	let source = url.searchParams.get('source') ?? 'siri';
	if (type.includes('application/json')) {
		const body = await request.json().catch(() => ({}));
		text = String(body.text ?? body.item ?? '');
		if (body.source) source = String(body.source);
	} else if (type.includes('form')) {
		const form = await request.formData();
		text = String(form.get('text') ?? '');
	} else {
		text = await request.text();
	}
	if (!['siri', 'keep'].includes(source)) source = 'siri';
	const parts = splitItems(text);
	if (parts.length === 0) error(400, 'Geen tekst');

	const added: string[] = [];
	for (const part of parts) {
		const p = parseItem(part);
		if (!p.name) continue;
		const { error: err } = await admin().rpc('api_add_item', {
			p_household: caller.householdId,
			p_user: caller.userId,
			p_name: p.name,
			p_quantity: p.quantity,
			p_unit: p.unit,
			p_note: p.note,
			p_source: source
		});
		if (err) error(500, err.message);
		added.push(p.name);
	}
	const message =
		added.length === 1 ? `${added[0]} staat op de lijst` : `${added.slice(0, -1).join(', ')} en ${added.at(-1)} staan op de lijst`;
	return json({ ok: true, added, message });
};
