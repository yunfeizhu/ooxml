import { describe, expect, it } from 'vitest';
import { createCanvasTextMeasurer, type MeasureContext } from './text-measurer';

/** A canvas that knows "Known" (600 units per character) and falls back for everything else. */
function canvas(): MeasureContext & { kerning: string[] } {
	const kerning: string[] = [];
	const context = {
		font: '',
		kerning,
		set fontKerning(value: string) {
			kerning.push(value);
		},
		get fontKerning() {
			return 'auto';
		},
		measureText(text: string) {
			const size = Number(/(\d+)px/.exec(context.font)![1]);
			const families = context.font.slice(context.font.indexOf('px') + 3);
			const advance = families.startsWith('"Known"')
				? /bold/.test(context.font)
					? 0.66
					: 0.6
				: /monospace$/.test(families)
					? 0.5
					: 0.45;
			return { width: text.length * advance * size };
		},
	};
	return context;
}
const style = (fontFamily: string, extra = {}) => ({
	fontFamily,
	fontSize: 12 / 72,
	bold: false,
	italic: false,
	...extra,
});

describe('canvas text measurer', () => {
	it('measures an installed family without kerning, scaled from a large size', () => {
		const context = canvas();
		const measurer = createCanvasTextMeasurer(context);
		expect(measurer.width('abcd', style('Known'))! * 72).toBeCloseTo(4 * 0.6 * 12, 6);
		expect(measurer.width('abcd', style('Known', { bold: true }))! * 72).toBeCloseTo(
			4 * 0.66 * 12,
			6,
		);
		expect(measurer.width('ab', style('Known', { letterSpacing: 1 / 72 }))! * 72).toBeCloseTo(
			2 * 0.6 * 12 + 2,
			6,
		);
		expect(context.kerning.every((value) => value === 'none')).toBe(true);
		expect(measurer.tolerance).toBeGreaterThan(0);
	});

	it('does not measure a family the browser would replace, or styles it cannot reproduce', () => {
		const measurer = createCanvasTextMeasurer(canvas());
		expect(measurer.width('abcd', style('Missing Font'))).toBeUndefined();
		expect(measurer.width('abcd', style('Bad"Name'))).toBeUndefined();
		expect(measurer.width('abcd', style('Known', { position: 'superscript' }))).toBeUndefined();
		expect(measurer.width('abcd', style('Known', { textCase: 'small-caps' }))).toBeUndefined();
	});
});
