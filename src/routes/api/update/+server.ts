import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { version } from '$app/environment';
import { authUser } from '$lib/server/admin';
import type { RequestHandler } from './$types';

/**
 * Het Update-knopje.
 *   GET  -> welke versie draait er, en hoeveel nieuwe wijzigingen staan er op GitHub
 *   POST -> start een nieuwe Netlify-build via de build hook
 */
export const GET: RequestHandler = async ({ request }) => {
	await authUser(request);
	const current = version;
	const result: { current: string; canDeploy: boolean; ahead: number | null; commits: { sha: string; message: string; date: string }[] } = {
		current,
		canDeploy: Boolean(env.NETLIFY_BUILD_HOOK),
		ahead: null,
		commits: []
	};
	const repo = env.GITHUB_REPO;
	if (repo && /^[0-9a-f]{7,40}$/.test(current)) {
		const headers: Record<string, string> = { accept: 'application/vnd.github+json', 'user-agent': 'winkellijstje' };
		if (env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;
		const res = await fetch(`https://api.github.com/repos/${repo}/compare/${current}...${env.GITHUB_BRANCH || 'main'}`, { headers });
		if (res.ok) {
			const data = await res.json();
			result.ahead = data.ahead_by ?? 0;
			result.commits = (data.commits ?? [])
				.slice(-10)
				.reverse()
				.map((c: { sha: string; commit: { message: string; author: { date: string } } }) => ({
					sha: c.sha.slice(0, 7),
					message: c.commit.message.split('\n')[0],
					date: c.commit.author.date
				}));
		}
	}
	return json(result);
};

export const POST: RequestHandler = async ({ request }) => {
	const caller = await authUser(request);
	if (!env.NETLIFY_BUILD_HOOK) error(500, 'NETLIFY_BUILD_HOOK is niet ingesteld');
	const res = await fetch(`${env.NETLIFY_BUILD_HOOK}?trigger_title=${encodeURIComponent('Update-knop in de app')}`, {
		method: 'POST',
		body: JSON.stringify({ by: caller.userId })
	});
	if (!res.ok) error(502, `Netlify antwoordde ${res.status}`);
	return json({ ok: true });
};
