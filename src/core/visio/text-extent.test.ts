import { afterEach, describe, expect, it } from 'vitest';
import { evaluateVisioFormula } from './formula';
import type { VisioParagraph, VisioText } from './model';
import { setVisioTextMeasurer, visioTextExtents } from './text-extent';

afterEach(() => setVisioTextMeasurer(undefined));

const pt = (points: number) => points / 72;
function text(
	plainText: string,
	options: { font?: string; size?: number; bold?: boolean; italic?: boolean; margin?: number } = {},
	paragraphs?: VisioParagraph[],
): VisioText {
	const margin = pt(options.margin ?? 0);
	const run = {
		text: plainText,
		fontFamily: options.font ?? 'Calibri',
		fontSize: pt(options.size ?? 12),
		color: '#000000',
		bold: !!options.bold,
		italic: !!options.italic,
		underline: false,
	};
	return {
		plainText,
		runs: plainText ? [run] : [],
		...(paragraphs ? { paragraphs } : {}),
		fontFamily: run.fontFamily,
		fontSize: run.fontSize,
		bold: run.bold,
		italic: run.italic,
		color: '#000000',
		horizontalAlign: 'center',
		verticalAlign: 'middle',
		transform: [1, 0, 0, 1, 0, 0],
		width: 2,
		height: 1,
		margins: { left: margin, right: margin, top: margin, bottom: margin },
	};
}
const FOX = 'The quick brown fox jumps over the lazy dog';

/** Every expected number is Visio 16's own (`scripts/record-visio-text-extent.ps1`), in points. */
describe('TEXTWIDTH and TEXTHEIGHT', () => {
	it.each([
		['Calibri', 'Process', 12, false, 39.859],
		['Calibri', 'Process', 24, false, 79.714],
		['Calibri', FOX, 12, false, 220.235],
		['Calibri', FOX, 12, true, 225.222],
		['Arial', 'WAVE To AV, Yo. (kerning)', 12, false, 150.721],
		['Segoe UI', 'Process', 8, false, 28.812],
	] as const)('measures %s "%s" at %d pt as Visio does', (font, value, size, bold, expected) => {
		expect(visioTextExtents(text(value, { font, size, bold })).width()! * 72).toBeCloseTo(
			expected,
			1,
		);
	});

	it('adds the margins, takes the widest line and wraps at the text block width', () => {
		expect(visioTextExtents(text('Process', { margin: 4 })).width()! * 72).toBeCloseTo(47.859, 1);
		expect(visioTextExtents(text('Two\nlines')).width()! * 72).toBeCloseTo(25.193, 1);
		const fox = visioTextExtents(text(FOX));
		expect([0.5, 1, 1.5, 2.5, 100].map((width) => fox.height(width)! * 72)).toEqual(
			[129.6, 57.6, 43.2, 28.8, 14.4].map((value) => expect.closeTo(value, 2)),
		);
		// With 4 pt margins the same text has less room and four more lines' worth of margin.
		expect(visioTextExtents(text(FOX, { margin: 4 })).height(1)! * 72).toBeCloseTo(65.6, 2);
		expect(visioTextExtents(text('Two\nlines')).height(100)! * 72).toBeCloseTo(28.8, 2);
		// A word wider than the line is cut between characters.
		expect(visioTextExtents(text('Hamburgefonstiv 0123456789')).height(0.5)! * 72).toBeCloseTo(
			72,
			2,
		);
	});

	it('does not answer for what it cannot measure', () => {
		expect(visioTextExtents(text('Process', { font: 'Wingdings' })).width()).toBeUndefined();
		expect(visioTextExtents(text('Zażółć')).height(1)).toBeUndefined();
		expect(visioTextExtents(text('Process', { italic: true })).width()).toBeUndefined();
		expect(visioTextExtents(text('a\tb')).height(1)).toBeUndefined();
		const bullet: VisioParagraph = {
			start: 0,
			end: 7,
			horizontalAlign: 'left',
			indentLeft: 0,
			indentRight: 0,
			indentFirst: 0,
			spaceBefore: 0,
			spaceAfter: 0,
			lineSpacing: { kind: 'multiple', value: 1.2 },
			direction: 'ltr',
			bullet: { text: '•', fontFamily: 'Calibri', fontSize: pt(12), offset: 0 },
		};
		expect(visioTextExtents(text('Process', {}, [bullet])).height(1)).toBeUndefined();
	});

	it('leaves a line that only just fits undecided', () => {
		const process = visioTextExtents(text('Process and'));
		const exact = (process.width()! * 72 - 2.713) / 72; // the text without the paragraph mark
		expect(process.height(exact + 0.01)! * 72).toBeCloseTo(14.4, 2);
		expect(process.height(exact - 0.01)! * 72).toBeCloseTo(28.8, 2);
		expect(process.height(exact)).toBeUndefined();
	});

	it('asks an installed measurer only for what the tables do not cover', () => {
		const asked: string[] = [];
		setVisioTextMeasurer({
			tolerance: 0.01,
			width(value, style) {
				asked.push(`${style.fontFamily}:${value}`);
				return value.length * style.fontSize * 0.5;
			},
		});
		expect(visioTextExtents(text('Process')).width()! * 72).toBeCloseTo(39.859, 1);
		expect(asked).toEqual([]);
		expect(visioTextExtents(text('Process', { font: 'Other' })).width()! * 72).toBeCloseTo(
			8 * 6,
			6,
		);
		expect(asked).toContain('Other:Process');
	});
});

describe('text functions in formulas', () => {
	const none = () => ({ value: 0, unit: 'length' as const });
	const extents = {
		width: (maximum?: number) => maximum ?? 2,
		height: (width: number) => width / 4,
	};

	it('evaluates TEXTWIDTH and TEXTHEIGHT of the shape text when extents are given', () => {
		const resolve = (reference: { cell: string }) =>
			reference.cell === 'Width' ? { value: 3, unit: 'length' as const } : none();
		expect(evaluateVisioFormula('TEXTWIDTH(TheText)', none, { text: extents })).toEqual({
			value: 2,
			unit: 'length',
		});
		expect(
			evaluateVisioFormula('GUARD(TEXTHEIGHT(TheText,Width))', resolve, { text: extents }).value,
		).toBe(0.75);
		expect(
			evaluateVisioFormula('MAX(0.75 in,CEILING(TEXTHEIGHT(TheText,Width),0.25))', resolve, {
				text: { ...extents, height: () => 0.98 },
			}).value,
		).toBe(1);
	});

	it('stays unsupported without extents, for other shapes and when the text is not measurable', () => {
		expect(() => evaluateVisioFormula('TEXTWIDTH(TheText)', none)).toThrow(/Unsupported/);
		expect(() =>
			evaluateVisioFormula('TEXTWIDTH(Sheet.2!TheText)', none, { text: extents }),
		).toThrow(/Unsupported/);
		expect(() => evaluateVisioFormula('TEXTHEIGHT(TheText)', none, { text: extents })).toThrow(
			/Unsupported/,
		);
		expect(() =>
			evaluateVisioFormula('TEXTWIDTH(TheText)', none, {
				text: { width: () => undefined, height: () => undefined },
			}),
		).toThrow(/measured/);
	});

	it('rounds with CEILING and FLOOR as Visio does', () => {
		const value = (formula: string) => evaluateVisioFormula(formula, none).value;
		expect(value('CEILING(0.75,0.25)')).toBe(0.75);
		expect(value('CEILING(0.76,0.25)')).toBe(1);
		expect(value('CEILING(1.2)')).toBe(2);
		expect(value('FLOOR(0.99,0.25)')).toBe(0.75);
		expect(value('CEILING(-1.2,-1)')).toBe(-2);
		expect(value('CEILING(0,0.25)')).toBe(0);
		expect(() => value('CEILING(1,-1)')).toThrow();
		expect(evaluateVisioFormula('CEILING(1.1 in,0.25)', none)).toEqual({
			value: 1.25,
			unit: 'length',
		});
	});
});
