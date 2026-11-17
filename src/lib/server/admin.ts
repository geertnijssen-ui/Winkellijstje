import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { error } from '@sveltejs/kit';
import { createHash } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

let client: SupabaseClient | null = null;

/** Supabase met service role: alleen op de server gebruiken. */
export function admin(): SupabaseClient {
	if (!env.SUPABASE_SERVICE_ROLE_KEY) error(500, 'SUPABASE_SERVICE_ROLE_KEY ontbreekt');
	client ??= createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
	return client;
}

export type Caller = { householdId: string; userId: string };

/** API-sleutel (Siri / Keep-script) uit de Authorization-header of ?token= */
export async function authToken(request: Request, url: URL): Promise<Caller> {
	const header = request.headers.get('authorization') ?? '';
	const token = header.replace(/^Bearer\s+/i, '').trim() || url.searchParams.get('token') || '';
	if (!token.startsWith('wl_')) error(401, 'Geen geldige API-sleutel');
	const hash = createHash('sha256').update(token).digest('hex');
	const { data } = await admin().from('api_tokens').select('id, household_id, user_id').eq('token_hash', hash).maybeSingle();
	if (!data) error(401, 'Geen geldige API-sleutel');
	await admin().from('api_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
	return { householdId: data.household_id, userId: data.user_id };
}

/** Ingelogde app-gebruiker (Supabase access token) */
export async function authUser(request: Request): Promise<Caller> {
	const jwt = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
	if (!jwt) error(401, 'Niet ingelogd');
	const { data } = await admin().auth.getUser(jwt);
	if (!data.user) error(401, 'Niet ingelogd');
	const { data: profile } = await admin().from('profiles').select('household_id').eq('id', data.user.id).maybeSingle();
	if (!profile?.household_id) error(403, 'Geen huishouden');
	return { householdId: profile.household_id, userId: data.user.id };
}
