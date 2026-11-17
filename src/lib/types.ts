export type Household = { id: string; name: string; invite_code: string };
export type Profile = {
	id: string;
	household_id: string | null;
	display_name: string;
	shopping_store_id: string | null;
	shopping_since: string | null;
};
export type Store = { id: string; household_id: string; name: string; color: string; position: number };
export type Section = { id: string; household_id: string; store_id: string; name: string; position: number };
export type Product = {
	id: string;
	household_id: string;
	name: string;
	name_key: string;
	favorite: boolean;
	use_count: number;
	last_used_at: string | null;
};
export type ProductStore = { household_id: string; product_id: string; store_id: string; section_id: string | null };
export type Item = {
	id: string;
	household_id: string;
	product_id: string;
	quantity: number | null;
	unit: string | null;
	note: string | null;
	source: 'app' | 'siri' | 'keep' | 'favorites';
	added_by: string | null;
	created_at: string;
	checked_at: string | null;
	checked_by: string | null;
	checked_store_id: string | null;
};
export type StapleSet = { id: string; household_id: string; name: string; position: number };
export type StapleSetItem = {
	household_id: string;
	set_id: string;
	product_id: string;
	quantity: number | null;
	unit: string | null;
};
export type ApiToken = { id: string; name: string; user_id: string; created_at: string; last_used_at: string | null };

export type Snapshot = {
	household: Household | null;
	profiles: Profile[];
	stores: Store[];
	sections: Section[];
	products: Product[];
	productStores: ProductStore[];
	items: Item[];
	stapleSets: StapleSet[];
	stapleSetItems: StapleSetItem[];
};

export const emptySnapshot = (): Snapshot => ({
	household: null,
	profiles: [],
	stores: [],
	sections: [],
	products: [],
	productStores: [],
	items: [],
	stapleSets: [],
	stapleSetItems: []
});

export function nameKey(s: string) {
	return s.trim().replace(/\s+/g, ' ').toLowerCase();
}
