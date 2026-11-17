import type { Item, Product, Section, Snapshot, Store } from './types';

export type Row = { item: Item; product: Product; sectionId: string | null };
export type Group = { store: Store | null; rows: Row[] };

const byName = (a: Row, b: Row) => a.product.name.localeCompare(b.product.name, 'nl');

export function productIndex(snap: Snapshot) {
	return new Map(snap.products.map((p) => [p.id, p]));
}

export function storeIdsFor(snap: Snapshot, productId: string): string[] {
	return snap.productStores.filter((ps) => ps.product_id === productId).map((ps) => ps.store_id);
}

export function sortedStores(snap: Snapshot): Store[] {
	return [...snap.stores].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'nl'));
}

export function sortedSections(snap: Snapshot, storeId: string): Section[] {
	return snap.sections
		.filter((s) => s.store_id === storeId)
		.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'nl'));
}

function sectionSorter(snap: Snapshot, storeId: string) {
	const order = new Map(sortedSections(snap, storeId).map((s, i) => [s.id, i]));
	return (a: Row, b: Row) => {
		const oa = a.sectionId ? (order.get(a.sectionId) ?? 999) : 999;
		const ob = b.sectionId ? (order.get(b.sectionId) ?? 999) : 999;
		return oa - ob || byName(a, b);
	};
}

/** Overzicht: eerst "Algemeen" (nog geen winkel), dan elke winkel. Een item met meerdere winkels staat bij elk. */
export function overview(snap: Snapshot): Group[] {
	const products = productIndex(snap);
	const open = snap.items.filter((i) => !i.checked_at);
	const general: Row[] = [];
	const perStore = new Map<string, Row[]>();

	for (const item of open) {
		const product = products.get(item.product_id);
		if (!product) continue;
		const links = snap.productStores.filter((ps) => ps.product_id === item.product_id);
		if (links.length === 0) general.push({ item, product, sectionId: null });
		for (const link of links) {
			const rows = perStore.get(link.store_id) ?? [];
			rows.push({ item, product, sectionId: link.section_id });
			perStore.set(link.store_id, rows);
		}
	}

	const groups: Group[] = [{ store: null, rows: general.sort(byName) }];
	for (const store of sortedStores(snap)) {
		groups.push({ store, rows: (perStore.get(store.id) ?? []).sort(sectionSorter(snap, store.id)) });
	}
	return groups;
}

export type SectionGroup = { section: Section | null; rows: Row[] };

/** Winkelmodus: open items per afdeling (in looprichting), afgevinkte onderaan. */
export function storeView(snap: Snapshot, storeId: string, checkedSince: number) {
	const products = productIndex(snap);
	const links = new Map(
		snap.productStores.filter((ps) => ps.store_id === storeId).map((ps) => [ps.product_id, ps])
	);
	const open: Row[] = [];
	const checked: Row[] = [];
	const unassigned: Row[] = [];
	const linkedAnywhere = new Set(snap.productStores.map((ps) => ps.product_id));

	for (const item of snap.items) {
		const product = products.get(item.product_id);
		if (!product) continue;
		const link = links.get(item.product_id);
		if (item.checked_at) {
			const recent = new Date(item.checked_at).getTime() >= checkedSince;
			if (recent && (link || item.checked_store_id === storeId)) {
				checked.push({ item, product, sectionId: link?.section_id ?? null });
			}
			continue;
		}
		if (link) open.push({ item, product, sectionId: link.section_id });
		else if (!linkedAnywhere.has(item.product_id)) unassigned.push({ item, product, sectionId: null });
	}

	const sections = sortedSections(snap, storeId);
	const groups: SectionGroup[] = sections.map((section) => ({
		section,
		rows: open.filter((r) => r.sectionId === section.id).sort(byName)
	}));
	const known = new Set(sections.map((s) => s.id));
	groups.push({ section: null, rows: open.filter((r) => !r.sectionId || !known.has(r.sectionId)).sort(byName) });

	checked.sort((a, b) => (b.item.checked_at ?? '').localeCompare(a.item.checked_at ?? ''));
	return { groups: groups.filter((g) => g.rows.length > 0), checked, unassigned: unassigned.sort(byName), openCount: open.length };
}

/** Autocomplete: eerst wat begint met de invoer, dan wat het bevat; vaak gekocht eerst. */
export function suggest(snap: Snapshot, query: string, limit = 6): Product[] {
	const q = query.trim().toLowerCase();
	if (!q) return [];
	const scored = snap.products
		.map((p) => {
			const k = p.name_key;
			const score = k === q ? 3 : k.startsWith(q) ? 2 : k.split(' ').some((w) => w.startsWith(q)) ? 1.5 : k.includes(q) ? 1 : 0;
			return { p, score };
		})
		.filter((x) => x.score > 0);
	scored.sort((a, b) => b.score - a.score || b.p.use_count - a.p.use_count);
	return scored.slice(0, limit).map((x) => x.p);
}

/** "Vaak gekocht" en nu niet op de lijst */
export function frequent(snap: Snapshot, limit = 10): Product[] {
	const onList = new Set(snap.items.filter((i) => !i.checked_at).map((i) => i.product_id));
	return snap.products
		.filter((p) => !onList.has(p.id) && p.use_count >= 2)
		.sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.use_count - a.use_count)
		.slice(0, limit);
}
