/**
 * Slim invoeren: "2 melk", "melk x2", "500 g gehakt", "1,5 l melk", "brood (volkoren)".
 */
export type ParsedItem = {
	name: string;
	quantity: number | null;
	unit: string | null;
	note: string | null;
};

const UNITS: Record<string, string> = {
	g: 'g', gr: 'g', gram: 'g',
	kg: 'kg', kilo: 'kg',
	l: 'l', liter: 'l',
	ml: 'ml', cl: 'cl',
	st: 'st', stuk: 'st', stuks: 'st',
	pak: 'pak', pakken: 'pak', pakje: 'pak', pakjes: 'pak',
	fles: 'fles', flessen: 'fles',
	blik: 'blik', blikken: 'blik',
	doos: 'doos', dozen: 'doos',
	zak: 'zak', zakken: 'zak',
	bak: 'bak', bakjes: 'bak', bakje: 'bak',
	pot: 'pot', potten: 'pot', potje: 'pot',
	rol: 'rol', rollen: 'rol',
	bos: 'bos', bosje: 'bos'
};

const WORD_NUMBERS: Record<string, number> = {
	een: 1, één: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7, acht: 8, negen: 9, tien: 10,
	half: 0.5, halve: 0.5
};

function toNumber(s: string): number | null {
	const lower = s.toLowerCase();
	if (lower in WORD_NUMBERS) return WORD_NUMBERS[lower];
	const n = Number(lower.replace(',', '.'));
	return Number.isFinite(n) && n > 0 ? n : null;
}

const NUM = String.raw`(\d+(?:[.,]\d+)?|een|één|twee|drie|vier|vijf|zes|zeven|acht|negen|tien|half|halve)`;

export function parseItem(input: string): ParsedItem {
	let text = input.trim().replace(/\s+/g, ' ');
	let note: string | null = null;

	// notitie tussen haakjes: "melk (lactosevrij)"
	const noteMatch = text.match(/^(.*?)\s*\((.+)\)\s*$/);
	if (noteMatch) {
		text = noteMatch[1].trim();
		note = noteMatch[2].trim() || null;
	}

	let quantity: number | null = null;
	let unit: string | null = null;

	// "2 melk", "2x melk", "500 g gehakt", "500g gehakt", "twee pak melk"
	const lead = text.match(new RegExp(`^${NUM}\\s*(?:x\\s+|x(?=\\d)|\\*\\s*)?([a-zA-Z]+)?\\s+(.+)$`, 'i'));
	if (lead) {
		const q = toNumber(lead[1]);
		const maybeUnit = lead[2]?.toLowerCase();
		if (q !== null) {
			if (maybeUnit && maybeUnit in UNITS) {
				quantity = q;
				unit = UNITS[maybeUnit];
				text = lead[3];
			} else if (maybeUnit === 'x') {
				quantity = q;
				text = lead[3];
			} else {
				quantity = q;
				text = [lead[2], lead[3]].filter(Boolean).join(' ');
			}
		}
	} else {
		// "melk x2", "melk 2x", "melk 2", "appels 1 kg"
		const trail = text.match(new RegExp(`^(.+?)\\s+(?:x\\s*)?${NUM}\\s*(x|[a-zA-Z]+)?$`, 'i'));
		if (trail) {
			const q = toNumber(trail[2]);
			const maybeUnit = trail[3]?.toLowerCase();
			const isNumeric = /\d/.test(trail[2]);
			if (q !== null && isNumeric && (!maybeUnit || maybeUnit === 'x' || maybeUnit in UNITS)) {
				quantity = q;
				unit = maybeUnit && maybeUnit !== 'x' ? UNITS[maybeUnit] : null;
				text = trail[1];
			}
		}
	}

	const name = text.trim();
	return { name, quantity, unit, note };
}

/** "melk, brood en 2 eieren" -> drie items (handig voor Siri en Google Home) */
export function splitItems(input: string): string[] {
	return input
		.split(/\s*(?:,|;|\n|\s+en\s+|\s+and\s+|\s+plus\s+)\s*/i)
		.map((s) => s.trim())
		.filter(Boolean);
}

export function formatQuantity(quantity: number | null, unit: string | null): string {
	if (quantity === null && !unit) return '';
	const q = quantity === null ? '' : String(quantity).replace('.', ',');
	return [q, unit].filter(Boolean).join(unit && ['g', 'kg', 'l', 'ml', 'cl'].includes(unit) ? '' : ' ');
}
