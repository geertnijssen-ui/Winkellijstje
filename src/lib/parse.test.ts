import { describe, expect, it } from 'vitest';
import { formatQuantity, parseItem, splitItems } from './parse';

describe('parseItem', () => {
	const cases: [string, Partial<ReturnType<typeof parseItem>>][] = [
		['melk', { name: 'melk', quantity: null, unit: null }],
		['2 melk', { name: 'melk', quantity: 2 }],
		['2x melk', { name: 'melk', quantity: 2 }],
		['2 x melk', { name: 'melk', quantity: 2 }],
		['melk x2', { name: 'melk', quantity: 2 }],
		['melk 2x', { name: 'melk', quantity: 2 }],
		['melk 3', { name: 'melk', quantity: 3 }],
		['500 g gehakt', { name: 'gehakt', quantity: 500, unit: 'g' }],
		['500g gehakt', { name: 'gehakt', quantity: 500, unit: 'g' }],
		['1,5 l melk', { name: 'melk', quantity: 1.5, unit: 'l' }],
		['twee pak melk', { name: 'melk', quantity: 2, unit: 'pak' }],
		['appels 1 kg', { name: 'appels', quantity: 1, unit: 'kg' }],
		['3 rode paprika', { name: 'rode paprika', quantity: 3 }],
		['brood (volkoren)', { name: 'brood', note: 'volkoren' }],
		['2 melk (lactosevrij)', { name: 'melk', quantity: 2, note: 'lactosevrij' }],
		['7up', { name: '7up', quantity: null }],
		['zeven granen brood', { name: 'granen brood', quantity: 7 }],
		['coca cola zero', { name: 'coca cola zero', quantity: null }]
	];
	for (const [input, expected] of cases) {
		it(input, () => expect(parseItem(input)).toMatchObject(expected));
	}
});

describe('splitItems', () => {
	it('splitst op komma en "en"', () => {
		expect(splitItems('melk, brood en 2 eieren')).toEqual(['melk', 'brood', '2 eieren']);
	});
});

describe('formatQuantity', () => {
	it('formatteert', () => {
		expect(formatQuantity(2, null)).toBe('2');
		expect(formatQuantity(500, 'g')).toBe('500g');
		expect(formatQuantity(1.5, 'l')).toBe('1,5l');
		expect(formatQuantity(2, 'pak')).toBe('2 pak');
		expect(formatQuantity(null, null)).toBe('');
	});
});
