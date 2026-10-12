import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isOpenableHyperlinkHref, isStorableHyperlinkHref } from './safe-href';

const SCRIPT_SCHEMES = ['javascript', 'vbscript', 'data', 'mhtml'];

// What a URL parser skips inside a scheme (tab, newline) plus the invisible characters the policy
// strips. U+2028 is left out: browsers keep it, so it cannot turn a path into a script URL.
// Built from code points so no invisible character sits in this source file.
const filler = fc.constantFrom(
	...[0x09, 0x0a, 0x0d, 0x00, 0x200b, 0x00ad, 0xfeff].map((point) => String.fromCodePoint(point)),
	'',
	' ',
);

/** A script scheme with case changes and invisible characters spliced between its letters. */
const obfuscated = fc
	.tuple(
		fc.constantFrom(...SCRIPT_SCHEMES),
		fc.array(fc.boolean(), { minLength: 12, maxLength: 12 }),
		fc.array(filler, { minLength: 12, maxLength: 12 }),
		fc.string({ maxLength: 20 }),
	)
	.map(([scheme, upper, gaps, rest]) => {
		const letters = [...scheme].map((letter, index) => {
			const cased = upper[index] ? letter.toUpperCase() : letter;
			return `${cased}${gaps[index] ?? ''}`;
		});
		return `${gaps[0] ?? ''}${letters.join('')}:${rest}`;
	});

describe('hyperlink policy properties', () => {
	it('never stores or opens a script scheme, however it is obfuscated', () => {
		fc.assert(
			fc.property(obfuscated, (href) => {
				expect(isStorableHyperlinkHref(href)).toBe(false);
				expect(isOpenableHyperlinkHref(href)).toBe(false);
			}),
			{ numRuns: 1000 },
		);
	});

	it('never opens something it would not store', () => {
		fc.assert(
			fc.property(fc.string({ maxLength: 60 }), (href) => {
				if (isOpenableHyperlinkHref(href)) expect(isStorableHyperlinkHref(href)).toBe(true);
			}),
			{ numRuns: 1000 },
		);
	});
});
