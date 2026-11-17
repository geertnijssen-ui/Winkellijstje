import { json, text } from '@sveltejs/kit';
import { admin, authToken } from '$lib/server/admin';
import { groupedList, loadSnapshot } from '$lib/server/list';
import type { RequestHandler } from './$types';

/**
 * De lijst opvragen, gegroepeerd per winkel.
 *   GET /api/list                 -> JSON
 *   GET /api/list?format=text     -> leesbare tekst (voor Siri: "Wat moet ik kopen?")
 *   GET /api/list?store=Colruyt   -> alleen die winkel
 */
export const GET: RequestHandler = async ({ request, url }) => {
	const caller = await authToken(request, url);
	const snap = await loadSnapshot(admin(), caller.householdId);
	const groups = groupedList(snap, url.searchParams.get('store'));
	if (url.searchParams.get('format') === 'text') {
		if (groups.length === 0) return text('De lijst is leeg.');
		return text(groups.map((g) => `${g.store}: ${g.entries.map((e) => e.label).join(', ')}.`).join('\n'));
	}
	return json({ groups, stores: snap.stores.map((s) => s.name) });
};
