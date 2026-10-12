import { describe, expect, it } from 'vitest';
import { designTextWidthEm, hasDesignAdvances } from './advance-width';

describe('design advance widths', () => {
	it('adds the fonts own advances, regular and bold', () => {
		// Calibri "P" is 1058 of 2048 units; bold is wider.
		expect(designTextWidthEm('P', 'Calibri')).toBeCloseTo(1058 / 2048, 4);
		expect(designTextWidthEm('P', 'calibri', true)).toBeCloseTo(1090 / 2048, 4);
		expect(designTextWidthEm('', 'Arial')).toBe(0);
		// "Process" at 12 pt: Visio's TEXTWIDTH less the paragraph mark (one space).
		expect(designTextWidthEm('Process ', 'Calibri')! * 12).toBeCloseTo(39.859, 2);
	});

	it('does not guess', () => {
		expect(hasDesignAdvances('Segoe UI')).toBe(true);
		expect(hasDesignAdvances('Wingdings')).toBe(false);
		expect(designTextWidthEm('P', 'Wingdings')).toBeUndefined();
		expect(designTextWidthEm('é', 'Calibri')).toBeUndefined();
		expect(designTextWidthEm('a\nb', 'Calibri')).toBeUndefined();
		expect(designTextWidthEm('P', 'constructor')).toBeUndefined();
	});
});
