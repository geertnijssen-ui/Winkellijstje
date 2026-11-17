import { dev, version } from '$app/environment';
import { supabase } from './supabase';

type ServerInfo = { current: string; canDeploy: boolean; ahead: number | null; commits: { sha: string; message: string; date: string }[] };

class Updater {
	waiting = $state<ServiceWorker | null>(null);
	info = $state<ServerInfo | null>(null);
	building = $state(false);
	error = $state<string | null>(null);
	version = version;
	#reg: ServiceWorkerRegistration | null = null;
	#poll: ReturnType<typeof setInterval> | null = null;

	async register() {
		if (!('serviceWorker' in navigator)) return;
		try {
			const reg = await navigator.serviceWorker.register('/service-worker.js', { type: dev ? 'module' : 'classic' });
			this.#reg = reg;
			if (reg.waiting && navigator.serviceWorker.controller) this.waiting = reg.waiting;
			reg.addEventListener('updatefound', () => {
				const sw = reg.installing;
				sw?.addEventListener('statechange', () => {
					if (sw.state === 'installed' && navigator.serviceWorker.controller) {
						this.waiting = sw;
						this.building = false;
						this.#stopPoll();
					}
				});
			});
			let reloading = false;
			navigator.serviceWorker.addEventListener('controllerchange', () => {
				if (reloading) return;
				reloading = true;
				location.reload();
			});
		} catch (e) {
			console.warn('service worker', e);
		}
	}

	/** Kijk of Netlify al een nieuwere versie heeft */
	async check() {
		await this.#reg?.update().catch(() => {});
	}

	apply() {
		if (this.waiting) this.waiting.postMessage('SKIP_WAITING');
		else location.reload();
	}

	async #authHeader() {
		const { data } = await supabase.auth.getSession();
		return { authorization: `Bearer ${data.session?.access_token ?? ''}` };
	}

	async loadInfo() {
		this.error = null;
		try {
			const res = await fetch('/api/update', { headers: await this.#authHeader() });
			if (!res.ok) throw new Error(await res.text());
			this.info = await res.json();
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
		}
		this.check();
	}

	/** Start een Netlify-build. Daarna kijken we elke 20 s of de nieuwe versie klaar is. */
	async deploy() {
		this.error = null;
		const res = await fetch('/api/update', { method: 'POST', headers: await this.#authHeader() });
		if (!res.ok) {
			this.error = (await res.text()) || `Fout ${res.status}`;
			return;
		}
		this.building = true;
		const started = Date.now();
		this.#stopPoll();
		this.#poll = setInterval(() => {
			if (Date.now() - started > 15 * 60 * 1000) {
				this.#stopPoll();
				this.building = false;
				this.error = 'De build duurt lang. Kijk even in Netlify.';
				return;
			}
			this.check();
		}, 20_000);
	}

	#stopPoll() {
		if (this.#poll) clearInterval(this.#poll);
		this.#poll = null;
	}
}

export const updater = new Updater();
