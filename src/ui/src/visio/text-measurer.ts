import { setVisioTextMeasurer, type VisioTextMeasurer } from 'ooxml-core/visio';

/** The part of a 2D canvas context that measuring needs; a worker's OffscreenCanvas has it too. */
export interface MeasureContext {
	font: string;
	fontKerning?: string;
	measureText(text: string): { width: number };
}

/** Large enough that hinting and rounding to device pixels no longer show in the advances. */
const PROBE_PX = 1000;
const PROBE = 'mmmmmmmmmmlliWW@#0123456789';
const GENERIC = ['monospace', 'serif'] as const;

/**
 * Measures text with the browser's fonts for what the core's own tables do not cover (other
 * families, italics, non-ASCII text). Visio's TEXTWIDTH adds up unkerned, unhinted advances, so
 * kerning is turned off and the text is measured at 1000 px and scaled.
 *
 * A canvas silently draws a missing font with a fallback, which would measure a wrong size: a
 * family counts as installed only when it measures differently from both generic fallbacks, and
 * anything else is reported as not measurable. Superscript, subscript and small caps are not
 * measured either.
 */
export function createCanvasTextMeasurer(context: MeasureContext): VisioTextMeasurer {
	const installed = new Map<string, boolean>();
	const face = (family: string, bold: boolean, italic: boolean, fallback?: string) =>
		`${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${PROBE_PX}px ${JSON.stringify(family)}${fallback ? `, ${fallback}` : ''}`;
	const width = (font: string, text: string) => {
		context.font = font;
		if ('fontKerning' in context) context.fontKerning = 'none';
		return context.measureText(text).width;
	};
	const available = (family: string): boolean => {
		const key = family.toLowerCase();
		const known = installed.get(key);
		if (known !== undefined) return known;
		const result =
			!/["\\]/.test(family) &&
			GENERIC.some(
				(generic) =>
					width(face(family, false, false, generic), PROBE) !==
					width(`${PROBE_PX}px ${generic}`, PROBE),
			) &&
			// Measuring the same in front of both fallbacks: the family itself drew the text.
			width(face(family, false, false, 'monospace'), PROBE) ===
				width(face(family, false, false, 'serif'), PROBE);
		installed.set(key, result);
		return result;
	};
	return {
		tolerance: 0.01,
		width(text, style) {
			if (style.position || style.textCase || !available(style.fontFamily)) return undefined;
			const measured = width(face(style.fontFamily, style.bold, style.italic), text);
			if (!Number.isFinite(measured)) return undefined;
			return (
				(measured / PROBE_PX) * style.fontSize +
				(style.letterSpacing ?? 0) * Array.from(text).length
			);
		},
	};
}

/**
 * Give the core a browser measurer where a canvas exists (the page, or a worker with
 * OffscreenCanvas). Without one the core measures only what its own tables cover.
 */
export function installBrowserTextMeasurer(): boolean {
	let context: MeasureContext | null = null;
	try {
		if (typeof OffscreenCanvas !== 'undefined')
			context = new OffscreenCanvas(1, 1).getContext('2d') as MeasureContext | null;
		else if (typeof document !== 'undefined')
			context = document.createElement('canvas').getContext('2d');
	} catch {
		context = null;
	}
	if (!context) return false;
	setVisioTextMeasurer(createCanvasTextMeasurer(context));
	return true;
}
