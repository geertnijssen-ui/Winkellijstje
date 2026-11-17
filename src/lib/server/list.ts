import type { SupabaseClient } from '@supabase/supabase-js';
import { overview } from '$lib/grouping';
import { formatQuantity } from '$lib/parse';
import { emptySnapshot, type Snapshot } from '$lib/types';

export async function loadSnapshot(db: SupabaseClient, householdId: string): Promise<Snapshot> {
	const [stores, sections, products, productStores, items] = await Promise.all([
		db.from('stores').select('*').eq('household_id', householdId),
		db.from('sections').select('*').eq('household_id', householdId),
		db.from('products').select('*').eq('household_id', householdId).limit(5000),
		db.from('product_stores').select('*').eq('household_id', householdId),
		db.from('items').select('*').eq('household_id', householdId).is('checked_at', null)
	]);
	return {
		...emptySnapshot(),
		stores: stores.data ?? [],
		sections: sections.data ?? [],
		products: products.data ?? [],
		productStores: productStores.data ?? [],
		items: (items.data ?? []).map((i) => ({ ...i, quantity: i.quantity === null ? null : Number(i.quantity) }))
	};
}

export type ListEntry = { id: string; name: string; quantity: string; note: string | null; label: string };
export type ListGroup = { store: string; entries: ListEntry[] };

export function groupedList(snap: Snapshot, storeFilter?: string | null): ListGroup[] {
	const groups = overview(snap)
		.filter((g) => g.rows.length > 0)
		.map((g) => ({
			store: g.store?.name ?? 'Algemeen',
			entries: g.rows.map((r) => {
				const q = formatQuantity(r.item.quantity, r.item.unit);
				return {
					id: r.item.id,
					name: r.product.name,
					quantity: q,
					note: r.item.note,
					label: [q, r.product.name].filter(Boolean).join(' ')
				};
			})
		}));
	if (!storeFilter) return groups;
	const f = storeFilter.trim().toLowerCase();
	return groups.filter((g) => g.store.toLowerCase() === f || g.store.toLowerCase().startsWith(f));
}
