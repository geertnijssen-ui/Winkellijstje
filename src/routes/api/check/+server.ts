import { json, error } from '@sveltejs/kit';
import { admin, authToken } from '$lib/server/admin';
import type { RequestHandler } from './$types';

/** Items afvinken (gebruikt door het Keep-script als je in Google Keep iets afvinkt). */
export const POST: RequestHandler = async ({ request, url }) => {
	const caller = await authToken(request, url);
	const body = await request.json().catch(() => ({}));
	const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String) : [];
	if (ids.length === 0) error(400, 'Geen ids');
	const { error: err } = await admin()
		.from('items')
		.update({ checked_at: new Date().toISOString(), checked_by: caller.userId })
		.eq('household_id', caller.householdId)
		.is('checked_at', null)
		.in('id', ids);
	if (err) error(500, err.message);
	return json({ ok: true });
};
