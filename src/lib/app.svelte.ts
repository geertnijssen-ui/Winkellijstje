import type { RealtimeChannel, Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { formatQuantity } from './parse';
import { emptySnapshot, nameKey, type Item, type Product, type Snapshot } from './types';

/**
 * Centrale app-status met offline-ondersteuning.
 *
 * - Alle data van het huishouden staat lokaal (localStorage) zodat de app ook zonder bereik opent.
 * - Elke wijziging wordt meteen lokaal toegepast en in een wachtrij ("outbox") gezet.
 * - De wachtrij wordt naar Supabase gestuurd zodra er verbinding is.
 * - Via Supabase Realtime komen wijzigingen van de andere telefoon meteen binnen.
 */

type Op =
	| { id: string; kind: 'rpc'; fn: string; args: Record<string, unknown> }
	| { id: string; kind: 'insert'; table: string; row: Record<string, unknown> }
	| { id: string; kind: 'update'; table: string; match: Record<string, unknown>; patch: Record<string, unknown> }
	| { id: string; kind: 'delete'; table: string; match: Record<string, unknown> };

type Toast = { message: string; actionLabel?: string; action?: () => void; id: number };

const SNAP_KEY = 'wl.snapshot';
const OUTBOX_KEY = 'wl.outbox';
const CHECKED_WINDOW_MS = 48 * 3600 * 1000;

function load<T>(key: string, fallback: T): T {
	try {
		const raw = localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : fallback;
	} catch {
		return fallback;
	}
}
function save(key: string, value: unknown) {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		/* vol of privémodus: niet erg */
	}
}

export const uuid = () => crypto.randomUUID();

function isNetworkError(error: { message?: string; code?: string } | null) {
	if (!error) return false;
	if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
	return !error.code && /fetch|network|load failed|timed? ?out/i.test(error.message ?? '');
}

class AppState {
	snap = $state<Snapshot>(emptySnapshot());
	outbox = $state<Op[]>([]);
	session = $state<Session | null>(null);
	authReady = $state(false);
	dataReady = $state(false);
	online = $state(true);
	syncing = $state(false);
	toast = $state<Toast | null>(null);

	#channel: RealtimeChannel | null = null;
	#refetchTimer: ReturnType<typeof setTimeout> | null = null;
	#toastTimer: ReturnType<typeof setTimeout> | null = null;
	#flushing = false;
	#dirty = false;
	#started = false;

	get userId() {
		return this.session?.user.id ?? null;
	}
	get me() {
		return this.snap.profiles.find((p) => p.id === this.userId) ?? null;
	}
	get householdId() {
		return this.me?.household_id ?? null;
	}

	start() {
		if (this.#started) return;
		this.#started = true;
		this.snap = load(SNAP_KEY, emptySnapshot());
		this.outbox = load(OUTBOX_KEY, []);
		this.online = navigator.onLine;
		if (this.snap.household) this.dataReady = true;

		window.addEventListener('online', () => {
			this.online = true;
			this.flush();
		});
		window.addEventListener('offline', () => (this.online = false));
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'visible' && this.session) {
				this.flush();
				this.scheduleRefetch(0);
			}
		});
		setInterval(() => this.flush(), 20_000);

		supabase.auth.getSession().then(({ data }) => {
			this.#onSession(data.session);
			this.authReady = true;
		});
		supabase.auth.onAuthStateChange((event, session) => {
			if (event === 'SIGNED_OUT') this.#reset();
			else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') this.#onSession(session);
		});
	}

	#onSession(session: Session | null) {
		const changedUser = session?.user.id !== this.session?.user.id;
		this.session = session;
		if (session && changedUser) {
			this.flush();
			this.refetch();
		}
	}

	#reset() {
		this.session = null;
		this.snap = emptySnapshot();
		this.outbox = [];
		this.dataReady = false;
		this.#channel?.unsubscribe();
		this.#channel = null;
		localStorage.removeItem(SNAP_KEY);
		localStorage.removeItem(OUTBOX_KEY);
	}

	// ------------------------------------------------------------------ sync

	scheduleRefetch(delay = 400) {
		if (this.#refetchTimer) clearTimeout(this.#refetchTimer);
		this.#refetchTimer = setTimeout(() => this.refetch(), delay);
	}

	async refetch() {
		if (!this.session) return;
		if (this.outbox.length > 0) {
			// eerst onze eigen wijzigingen versturen, anders overschrijven we ze lokaal
			this.#dirty = true;
			this.flush();
			return;
		}
		const { data: profile, error: pErr } = await supabase
			.from('profiles')
			.select('*')
			.eq('id', this.session.user.id)
			.maybeSingle();
		if (pErr) {
			if (isNetworkError(pErr)) this.online = false;
			return;
		}
		this.online = true;
		if (!profile?.household_id) {
			this.snap = { ...emptySnapshot(), profiles: profile ? [profile] : [] };
			this.dataReady = true;
			return;
		}
		const hh = profile.household_id as string;
		const since = new Date(Date.now() - CHECKED_WINDOW_MS).toISOString();
		const [household, profiles, stores, sections, products, productStores, items, stapleSets, stapleSetItems] =
			await Promise.all([
				supabase.from('households').select('*').eq('id', hh).maybeSingle(),
				supabase.from('profiles').select('*').eq('household_id', hh),
				supabase.from('stores').select('*').eq('household_id', hh),
				supabase.from('sections').select('*').eq('household_id', hh),
				supabase.from('products').select('*').eq('household_id', hh).limit(5000),
				supabase.from('product_stores').select('*').eq('household_id', hh),
				supabase.from('items').select('*').eq('household_id', hh).or(`checked_at.is.null,checked_at.gte.${since}`),
				supabase.from('staple_sets').select('*').eq('household_id', hh),
				supabase.from('staple_set_items').select('*').eq('household_id', hh)
			]);
		const results = [household, profiles, stores, sections, products, productStores, items, stapleSets, stapleSetItems];
		if (results.some((r) => r.error)) return;
		if (this.outbox.length > 0) return; // intussen iets gewijzigd: volgende ronde
		this.snap = {
			household: household.data,
			profiles: profiles.data ?? [],
			stores: stores.data ?? [],
			sections: sections.data ?? [],
			products: products.data ?? [],
			productStores: productStores.data ?? [],
			items: (items.data ?? []).map((i) => ({ ...i, quantity: i.quantity === null ? null : Number(i.quantity) })),
			stapleSets: stapleSets.data ?? [],
			stapleSetItems: stapleSetItems.data ?? []
		};
		this.dataReady = true;
		save(SNAP_KEY, this.snap);
		this.#subscribe(hh);
	}

	#subscribe(hh: string) {
		if (this.#channel) return;
		const tables = ['items', 'products', 'product_stores', 'stores', 'sections', 'staple_sets', 'staple_set_items', 'profiles'];
		let ch = supabase.channel(`hh-${hh}`);
		for (const table of tables) {
			ch = ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `household_id=eq.${hh}` }, () =>
				this.scheduleRefetch()
			);
		}
		this.#channel = ch.subscribe();
	}

	#enqueue(op: Op) {
		this.outbox = [...this.outbox, op];
		save(OUTBOX_KEY, this.outbox);
		save(SNAP_KEY, this.snap);
		this.flush();
	}

	async flush() {
		if (this.#flushing || !this.session) return;
		this.#flushing = true;
		this.syncing = this.outbox.length > 0;
		let hadError = false;
		let processed = 0;
		try {
			while (this.outbox.length > 0) {
				const op = this.outbox[0];
				const error = await this.#run(op);
				if (error && isNetworkError(error)) {
					this.online = false;
					break;
				}
				this.online = true;
				if (error) {
					console.error('Wijziging geweigerd', op, error);
					this.showToast(`Kon niet opslaan: ${error.message}`);
					hadError = true;
				}
				this.outbox = this.outbox.slice(1);
				save(OUTBOX_KEY, this.outbox);
				processed++;
			}
		} finally {
			this.#flushing = false;
			this.syncing = false;
		}
		if (this.outbox.length === 0 && (this.#dirty || processed > 0)) {
			this.#dirty = false;
			this.scheduleRefetch(hadError ? 0 : 600);
		}
	}

	async #run(op: Op) {
		switch (op.kind) {
			case 'rpc':
				return (await supabase.rpc(op.fn, op.args)).error;
			case 'insert':
				return (await supabase.from(op.table).upsert(op.row, { ignoreDuplicates: true })).error;
			case 'update': {
				let q = supabase.from(op.table).update(op.patch);
				for (const [k, v] of Object.entries(op.match)) q = q.eq(k, v as string);
				return (await q).error;
			}
			case 'delete': {
				let q = supabase.from(op.table).delete();
				for (const [k, v] of Object.entries(op.match)) q = q.eq(k, v as string);
				return (await q).error;
			}
		}
	}

	// ------------------------------------------------------------------ ui

	showToast(message: string, actionLabel?: string, action?: () => void) {
		if (this.#toastTimer) clearTimeout(this.#toastTimer);
		this.toast = { message, actionLabel, action, id: Date.now() };
		this.#toastTimer = setTimeout(() => (this.toast = null), action ? 6000 : 3500);
	}

	profileName(id: string | null) {
		return this.snap.profiles.find((p) => p.id === id)?.display_name ?? '';
	}

	product(id: string) {
		return this.snap.products.find((p) => p.id === id);
	}

	// ------------------------------------------------------------------ items

	/** Item toevoegen; staat het er al op, dan gaat het aantal omhoog. */
	addItem(name: string, quantity: number | null = null, unit: string | null = null, note: string | null = null, source: 'app' | 'favorites' = 'app') {
		const hh = this.householdId;
		const clean = name.trim().replace(/\s+/g, ' ');
		if (!hh || !clean) return;
		const key = nameKey(clean);
		const opId = uuid();
		let product = this.snap.products.find((p) => p.name_key === key);
		const productId = product?.id ?? uuid();
		const now = new Date().toISOString();

		if (product) {
			product.use_count += 1;
			product.last_used_at = now;
		} else {
			product = { id: productId, household_id: hh, name: clean, name_key: key, favorite: false, use_count: 1, last_used_at: now };
			this.snap.products.push(product);
		}

		const existing = this.snap.items.find((i) => i.product_id === productId && !i.checked_at);
		if (existing) {
			if ((existing.unit ?? '') === (unit ?? '')) existing.quantity = (existing.quantity ?? 1) + (quantity ?? 1);
			if (note && !(existing.note ?? '').toLowerCase().includes(note.toLowerCase()))
				existing.note = [existing.note, note].filter(Boolean).join(', ');
			this.showToast(`${product.name} stond er al op: nu ${formatQuantity(existing.quantity, existing.unit) || 1}`);
		} else {
			this.snap.items.push({
				id: opId,
				household_id: hh,
				product_id: productId,
				quantity,
				unit,
				note,
				source,
				added_by: this.userId,
				created_at: now,
				checked_at: null,
				checked_by: null,
				checked_store_id: null
			});
		}
		this.#enqueue({
			id: opId,
			kind: 'rpc',
			fn: 'add_item',
			args: { p_name: clean, p_quantity: quantity, p_unit: unit, p_note: note, p_op_id: opId, p_product_id: productId, p_source: source }
		});
	}

	updateItem(id: string, patch: Partial<Pick<Item, 'quantity' | 'unit' | 'note'>>) {
		const item = this.snap.items.find((i) => i.id === id);
		if (!item) return;
		Object.assign(item, patch);
		this.#enqueue({ id: uuid(), kind: 'update', table: 'items', match: { id }, patch });
	}

	setChecked(id: string, checked: boolean, storeId: string | null = null, withUndo = true) {
		const item = this.snap.items.find((i) => i.id === id);
		if (!item) return;
		const patch = checked
			? { checked_at: new Date().toISOString(), checked_by: this.userId, checked_store_id: storeId }
			: { checked_at: null, checked_by: null, checked_store_id: null };
		// Bestaat er intussen een nieuwe open regel voor hetzelfde product? Dan niet heropenen.
		if (!checked && this.snap.items.some((i) => i.product_id === item.product_id && !i.checked_at && i.id !== id)) {
			this.showToast('Dit staat al opnieuw op de lijst');
			return;
		}
		Object.assign(item, patch);
		this.#enqueue({ id: uuid(), kind: 'update', table: 'items', match: { id }, patch });
		if (checked && withUndo) {
			const name = this.product(item.product_id)?.name ?? 'Item';
			this.showToast(`${name} afgevinkt`, 'Ongedaan maken', () => this.setChecked(id, false, null, false));
		}
	}

	deleteItem(id: string) {
		const item = this.snap.items.find((i) => i.id === id);
		if (!item) return;
		this.snap.items = this.snap.items.filter((i) => i.id !== id);
		this.#enqueue({ id: uuid(), kind: 'delete', table: 'items', match: { id } });
		const p = this.product(item.product_id);
		this.showToast(`${p?.name ?? 'Item'} verwijderd`, 'Ongedaan maken', () => {
			this.snap.items.push(item);
			this.#enqueue({ id: uuid(), kind: 'insert', table: 'items', row: { ...item } });
		});
	}

	clearChecked() {
		// afgevinkte items zijn geschiedenis; we verbergen ze gewoon uit het lokale venster
		this.snap.items = this.snap.items.filter((i) => !i.checked_at);
		save(SNAP_KEY, this.snap);
	}

	// ------------------------------------------------------------------ producten & winkels

	/** Het "onthouden": vanaf nu komt dit product altijd bij deze winkel(s). */
	setProductStores(productId: string, storeIds: string[]) {
		const hh = this.householdId!;
		const keep = this.snap.productStores.filter((ps) => ps.product_id !== productId || storeIds.includes(ps.store_id));
		const existing = new Set(keep.filter((ps) => ps.product_id === productId).map((ps) => ps.store_id));
		for (const sid of storeIds) {
			if (!existing.has(sid)) keep.push({ household_id: hh, product_id: productId, store_id: sid, section_id: null });
		}
		this.snap.productStores = keep;
		this.#enqueue({ id: uuid(), kind: 'rpc', fn: 'set_product_stores', args: { p_product_id: productId, p_store_ids: storeIds } });
	}

	setProductSection(productId: string, storeId: string, sectionId: string | null) {
		const link = this.snap.productStores.find((ps) => ps.product_id === productId && ps.store_id === storeId);
		if (!link) return;
		link.section_id = sectionId;
		this.#enqueue({
			id: uuid(),
			kind: 'update',
			table: 'product_stores',
			match: { product_id: productId, store_id: storeId },
			patch: { section_id: sectionId }
		});
	}

	updateProduct(id: string, patch: Partial<Pick<Product, 'name' | 'favorite'>>) {
		const p = this.product(id);
		if (!p) return;
		const full: Record<string, unknown> = { ...patch };
		if (patch.name) {
			const key = nameKey(patch.name);
			if (this.snap.products.some((o) => o.id !== id && o.name_key === key)) {
				this.showToast('Er bestaat al een product met die naam');
				return;
			}
			full.name = patch.name.trim();
			full.name_key = key;
		}
		Object.assign(p, full);
		this.#enqueue({ id: uuid(), kind: 'update', table: 'products', match: { id }, patch: full });
	}

	deleteProduct(id: string) {
		this.snap.products = this.snap.products.filter((p) => p.id !== id);
		this.snap.items = this.snap.items.filter((i) => i.product_id !== id);
		this.snap.productStores = this.snap.productStores.filter((ps) => ps.product_id !== id);
		this.snap.stapleSetItems = this.snap.stapleSetItems.filter((s) => s.product_id !== id);
		this.#enqueue({ id: uuid(), kind: 'delete', table: 'products', match: { id } });
	}

	addStore(name: string, color: string) {
		const hh = this.householdId!;
		const row = { id: uuid(), household_id: hh, name: name.trim(), color, position: this.snap.stores.length };
		this.snap.stores.push(row);
		this.#enqueue({ id: uuid(), kind: 'insert', table: 'stores', row });
		return row;
	}

	updateStore(id: string, patch: { name?: string; color?: string; position?: number }) {
		const s = this.snap.stores.find((x) => x.id === id);
		if (!s) return;
		Object.assign(s, patch);
		this.#enqueue({ id: uuid(), kind: 'update', table: 'stores', match: { id }, patch });
	}

	deleteStore(id: string) {
		this.snap.stores = this.snap.stores.filter((s) => s.id !== id);
		this.snap.productStores = this.snap.productStores.filter((ps) => ps.store_id !== id);
		this.snap.sections = this.snap.sections.filter((s) => s.store_id !== id);
		this.#enqueue({ id: uuid(), kind: 'delete', table: 'stores', match: { id } });
	}

	/** Verplaats in een gesorteerde lijst en schrijf nieuwe posities weg */
	reorder(table: 'stores' | 'sections' | 'staple_sets', ordered: { id: string; position: number }[], index: number, dir: -1 | 1) {
		const target = index + dir;
		if (target < 0 || target >= ordered.length) return;
		const list = [...ordered];
		[list[index], list[target]] = [list[target], list[index]];
		list.forEach((row, i) => {
			if (row.position !== i) {
				row.position = i;
				this.#enqueue({ id: uuid(), kind: 'update', table, match: { id: row.id }, patch: { position: i } });
			}
		});
	}

	addSection(storeId: string, name: string) {
		const row = {
			id: uuid(),
			household_id: this.householdId!,
			store_id: storeId,
			name: name.trim(),
			position: this.snap.sections.filter((s) => s.store_id === storeId).length
		};
		this.snap.sections.push(row);
		this.#enqueue({ id: uuid(), kind: 'insert', table: 'sections', row });
	}

	renameSection(id: string, name: string) {
		const s = this.snap.sections.find((x) => x.id === id);
		if (!s) return;
		s.name = name;
		this.#enqueue({ id: uuid(), kind: 'update', table: 'sections', match: { id }, patch: { name } });
	}

	deleteSection(id: string) {
		this.snap.sections = this.snap.sections.filter((s) => s.id !== id);
		for (const ps of this.snap.productStores) if (ps.section_id === id) ps.section_id = null;
		this.#enqueue({ id: uuid(), kind: 'delete', table: 'sections', match: { id } });
	}

	// ------------------------------------------------------------------ favorieten

	addStapleSet(name: string) {
		const row = { id: uuid(), household_id: this.householdId!, name: name.trim(), position: this.snap.stapleSets.length };
		this.snap.stapleSets.push(row);
		this.#enqueue({ id: uuid(), kind: 'insert', table: 'staple_sets', row });
		return row;
	}

	renameStapleSet(id: string, name: string) {
		const s = this.snap.stapleSets.find((x) => x.id === id);
		if (!s) return;
		s.name = name;
		this.#enqueue({ id: uuid(), kind: 'update', table: 'staple_sets', match: { id }, patch: { name } });
	}

	deleteStapleSet(id: string) {
		this.snap.stapleSets = this.snap.stapleSets.filter((s) => s.id !== id);
		this.snap.stapleSetItems = this.snap.stapleSetItems.filter((s) => s.set_id !== id);
		this.#enqueue({ id: uuid(), kind: 'delete', table: 'staple_sets', match: { id } });
	}

	/** Product aan set toevoegen; bestaat het product nog niet, dan maken we het aan in de catalogus. */
	addToStapleSet(setId: string, name: string, quantity: number | null, unit: string | null) {
		const hh = this.householdId!;
		const key = nameKey(name);
		let product = this.snap.products.find((p) => p.name_key === key);
		if (!product) {
			product = { id: uuid(), household_id: hh, name: name.trim(), name_key: key, favorite: false, use_count: 0, last_used_at: null };
			this.snap.products.push(product);
			this.#enqueue({ id: uuid(), kind: 'insert', table: 'products', row: { ...product } });
		}
		if (this.snap.stapleSetItems.some((s) => s.set_id === setId && s.product_id === product!.id)) return;
		const row = { household_id: hh, set_id: setId, product_id: product.id, quantity, unit };
		this.snap.stapleSetItems.push(row);
		this.#enqueue({ id: uuid(), kind: 'insert', table: 'staple_set_items', row });
	}

	removeFromStapleSet(setId: string, productId: string) {
		this.snap.stapleSetItems = this.snap.stapleSetItems.filter((s) => !(s.set_id === setId && s.product_id === productId));
		this.#enqueue({ id: uuid(), kind: 'delete', table: 'staple_set_items', match: { set_id: setId, product_id: productId } });
	}

	addWholeSet(setId: string) {
		const rows = this.snap.stapleSetItems.filter((s) => s.set_id === setId);
		let n = 0;
		for (const r of rows) {
			const p = this.product(r.product_id);
			if (!p) continue;
			if (this.snap.items.some((i) => i.product_id === p.id && !i.checked_at)) continue;
			n++;
			const now = new Date().toISOString();
			this.snap.items.push({
				id: uuid(), household_id: p.household_id, product_id: p.id, quantity: r.quantity, unit: r.unit, note: null,
				source: 'favorites', added_by: this.userId, created_at: now, checked_at: null, checked_by: null, checked_store_id: null
			});
		}
		this.#enqueue({ id: uuid(), kind: 'rpc', fn: 'add_staple_set', args: { p_set_id: setId, p_op_id: uuid() } });
		this.showToast(n === 0 ? 'Alles uit deze set staat al op de lijst' : `${n} item${n === 1 ? '' : 's'} toegevoegd`);
	}

	// ------------------------------------------------------------------ winkelmodus

	#heartbeat: ReturnType<typeof setInterval> | null = null;

	enterStore(storeId: string) {
		const me = this.me;
		if (!me) return;
		const beat = () => {
			const now = new Date().toISOString();
			me.shopping_store_id = storeId;
			me.shopping_since = now;
			this.#enqueue({ id: uuid(), kind: 'update', table: 'profiles', match: { id: me.id }, patch: { shopping_store_id: storeId, shopping_since: now } });
		};
		beat();
		if (this.#heartbeat) clearInterval(this.#heartbeat);
		this.#heartbeat = setInterval(beat, 15 * 60 * 1000);
	}

	leaveStore() {
		if (this.#heartbeat) clearInterval(this.#heartbeat);
		this.#heartbeat = null;
		const me = this.me;
		if (!me || !me.shopping_store_id) return;
		me.shopping_store_id = null;
		me.shopping_since = null;
		this.#enqueue({ id: uuid(), kind: 'update', table: 'profiles', match: { id: me.id }, patch: { shopping_store_id: null, shopping_since: null } });
	}

	// ------------------------------------------------------------------ profiel

	setDisplayName(name: string) {
		const me = this.me;
		if (!me) return;
		me.display_name = name;
		this.#enqueue({ id: uuid(), kind: 'update', table: 'profiles', match: { id: me.id }, patch: { display_name: name } });
	}
}

export const app = new AppState();
