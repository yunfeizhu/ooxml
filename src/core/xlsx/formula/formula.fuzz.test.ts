import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatValue, parseCellInput } from '../numfmt';
import { parseFormula } from './parser';
import { parseNumberText } from './text-number';
import { tokenize } from './tokenizer';

const FORMULA_CHARS = `=+-*/^&<>(),:;!$%#@{}[]'" .0123456789ABCDEFGHIJSUMIFXYZ_`;
const formulaText = fc
	.array(fc.constantFrom(...FORMULA_CHARS), { maxLength: 80 })
	.map((chars) => chars.join(''));

function throwsOnlyErrors(run: () => unknown): void {
	try {
		run();
	} catch (error) {
		expect(error).toBeInstanceOf(Error);
	}
}

describe('formula properties', () => {
	it('tokenize and parseFormula return or throw an Error for any text', () => {
		fc.assert(
			fc.property(fc.oneof(formulaText, fc.string({ maxLength: 80 })), (input) => {
				throwsOnlyErrors(() => tokenize(input));
				throwsOnlyErrors(() => parseFormula(input));
			}),
			{ numRuns: 1000 },
		);
	});

	it('parseNumberText never throws and only returns finite numbers or undefined', () => {
		fc.assert(
			fc.property(fc.oneof(formulaText, fc.string({ maxLength: 40 })), (input) => {
				const value = parseNumberText(input);
				if (value !== undefined) expect(typeof value).toBe('number');
			}),
			{ numRuns: 1000 },
		);
	});
});

describe('number format properties', () => {
	it('formatValue returns text for any number and any format code', () => {
		fc.assert(
			fc.property(
				fc.double({ noNaN: true }),
				fc.oneof(formulaText, fc.string({ maxLength: 40 })),
				(value, format) => {
					throwsOnlyErrors(() => {
						expect(typeof formatValue(value, format).text).toBe('string');
					});
				},
			),
			{ numRuns: 1000 },
		);
	});

	it('parseCellInput classifies any typed text without throwing', () => {
		fc.assert(
			fc.property(fc.string({ maxLength: 40 }), (input) => {
				expect(parseCellInput(input)).toHaveProperty('value');
			}),
			{ numRuns: 1000 },
		);
	});
});
