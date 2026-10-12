import { designTextWidthEm } from '../text/font-metrics/advance-width';
import type { VisioParagraph, VisioText, VisioTextRun } from './model';

/** What a measurer is told about a run. Sizes are inches, as in the model. */
export type VisioTextMeasureStyle = Pick<
	VisioTextRun,
	'fontFamily' | 'fontSize' | 'bold' | 'italic' | 'letterSpacing' | 'position' | 'textCase'
>;

/**
 * Measures one piece of text in one style. `width` returns inches, or `undefined` when it cannot
 * measure that style or those characters reliably. `tolerance` is the relative error to expect:
 * a line that fits or overflows by less than that is not decided, and the caller keeps the size
 * the drawing was saved with instead of writing a doubtful one.
 */
export interface VisioTextMeasurer {
	width(text: string, style: VisioTextMeasureStyle): number | undefined;
	tolerance: number;
}

/**
 * The DOM-free default: the fonts' own advance widths, which is what Visio's TEXTWIDTH adds up
 * (no hinting, no kerning). It measures printable ASCII in the upright regular and bold faces of
 * the recorded families (Calibri, Calibri Light, Arial, Segoe UI, Times New Roman) and nothing else.
 */
export const designTextMeasurer: VisioTextMeasurer = {
	tolerance: 0.0005,
	width(text, style) {
		if (style.italic || style.position || style.textCase) return undefined;
		const em = designTextWidthEm(text, style.fontFamily, style.bold);
		return em === undefined
			? undefined
			: em * style.fontSize + (style.letterSpacing ?? 0) * text.length;
	},
};

let installed: VisioTextMeasurer | undefined;
/**
 * A measurer for what the default cannot measure (other fonts, italics, non-ASCII text): a UI
 * installs one that asks the browser. The default is always tried first because it is exact.
 */
export function setVisioTextMeasurer(measurer: VisioTextMeasurer | undefined): void {
	installed = measurer;
}

interface Measured {
	width: number;
	tolerance: number;
}
function measure(text: string, style: VisioTextMeasureStyle): Measured | undefined {
	for (const measurer of installed ? [designTextMeasurer, installed] : [designTextMeasurer]) {
		const width = measurer.width(text, style);
		if (width !== undefined && Number.isFinite(width) && width >= 0)
			return { width, tolerance: measurer.tolerance };
	}
	return undefined;
}

/** Visio's default line pitch: 120% of the largest font size on the line. */
const LINE = 1.2;
const MAX_CHARACTERS = 20_000;
/** Tabs, soft hyphens and line separators need rules this layout does not have. */
const UNSUPPORTED = new RegExp('[\\t\\u00ad\\u2028]');

interface Piece {
	text: string;
	run: VisioTextRun;
}
interface Line {
	width: number;
	height: number;
}

/** The runs of one paragraph, cut at `[start, end)` of the plain text. */
function piecesOf(text: VisioText, start: number, end: number): Piece[] {
	const pieces: Piece[] = [];
	let offset = 0;
	for (const run of text.runs) {
		const from = Math.max(start, offset),
			to = Math.min(end, offset + run.text.length);
		if (to > from) pieces.push({ text: run.text.slice(from - offset, to - offset), run });
		offset += run.text.length;
	}
	return pieces;
}

const defaultRun = (text: VisioText): VisioTextRun => ({
	text: '',
	fontFamily: text.fontFamily,
	fontSize: text.fontSize,
	color: text.color,
	bold: !!text.bold,
	italic: !!text.italic,
	underline: !!text.underline,
});

/**
 * Lays one paragraph out greedily at `available` inches (`Infinity` for no wrapping). Returns
 * `undefined` when a piece cannot be measured or a break is too close to call.
 */
function layoutParagraph(
	pieces: readonly Piece[],
	fallback: VisioTextRun,
	paragraph: VisioParagraph | undefined,
	available: number,
): Line[] | undefined {
	const pitch = (size: number) =>
		!paragraph || paragraph.lineSpacing.kind === 'multiple'
			? size * (paragraph?.lineSpacing.value ?? LINE)
			: paragraph.lineSpacing.value;
	const lines: Line[] = [];
	let width = 0,
		size = 0,
		pending = 0;
	const room = () => available - (lines.length === 0 ? (paragraph?.indentFirst ?? 0) : 0);
	const finish = () => {
		lines.push({ width, height: pitch(size || fallback.fontSize) });
		width = 0;
		size = 0;
		pending = 0;
	};
	for (const piece of pieces) {
		for (const token of piece.text.match(/ +|[^ ]+/g) ?? []) {
			if (UNSUPPORTED.test(token)) return undefined;
			const measured = measure(token, piece.run);
			if (!measured) return undefined;
			if (token.startsWith(' ')) {
				// Spaces never start a line and hang past the edge at its end.
				if (width > 0) pending += measured.width;
				continue;
			}
			const limit = room();
			const next = width + pending + measured.width;
			if (width > 0 && Number.isFinite(limit)) {
				if (Math.abs(next - limit) <= measured.tolerance * limit) return undefined;
				if (next > limit) finish();
			}
			const start = width > 0 ? width + pending : 0;
			pending = 0;
			if (start === 0 && Number.isFinite(room()) && measured.width > room()) {
				// A word wider than the line is cut between characters.
				for (const character of token) {
					const one = measure(character, piece.run);
					if (!one) return undefined;
					const edge = room();
					if (width > 0) {
						if (Math.abs(width + one.width - edge) <= one.tolerance * edge) return undefined;
						if (width + one.width > edge) finish();
					}
					width += one.width;
					size = Math.max(size, piece.run.fontSize);
				}
				continue;
			}
			width = start + measured.width;
			size = Math.max(size, piece.run.fontSize);
		}
	}
	finish();
	return lines;
}

export interface VisioTextExtents {
	/** `TEXTWIDTH(TheText)`, or the widest line when wrapped at `maximum`. */
	width(maximum?: number): number | undefined;
	/** `TEXTHEIGHT(TheText, width)`. */
	height(width: number): number | undefined;
}

/**
 * What Visio's TEXTWIDTH and TEXTHEIGHT return for a shape's text, in inches, as recorded from
 * Visio 16 (`scripts/record-visio-text-extent.ps1`): lines are 120% of their font size unless the
 * paragraph says otherwise, both results include the text block margins, and TEXTWIDTH adds the
 * advance of one space (the paragraph mark) to the widest line. Either result is `undefined`
 * when the text has something this layout does not reproduce (bullets, tabs, unmeasured fonts)
 * or when a line break is too close to call.
 */
export function visioTextExtents(text: VisioText): VisioTextExtents {
	const fallback = defaultRun(text);
	const plain = text.plainText;
	const layout = (wrap: number): Line[][] | undefined => {
		if (plain.length > MAX_CHARACTERS) return undefined;
		const paragraphs: (VisioParagraph | undefined)[] = text.paragraphs?.length
			? text.paragraphs
			: [undefined];
		const result: Line[][] = [];
		for (const paragraph of paragraphs) {
			if (paragraph?.bullet || paragraph?.direction === 'rtl') return undefined;
			const start = paragraph?.start ?? 0,
				end = paragraph?.end ?? plain.length;
			const inner = wrap - (paragraph?.indentLeft ?? 0) - (paragraph?.indentRight ?? 0);
			// A paragraph may hold line breaks of its own (Shift+Enter, or text without markers).
			let from = start;
			const lines: Line[] = [];
			for (const part of plain.slice(start, end).split('\n')) {
				const laid = layoutParagraph(
					piecesOf(text, from, from + part.length),
					fallback,
					paragraph,
					inner,
				);
				if (!laid) return undefined;
				lines.push(...laid);
				from += part.length + 1;
			}
			result.push(lines);
		}
		return result;
	};
	const paragraphAt = (index: number) => text.paragraphs?.[index];
	return {
		width(maximum) {
			const inner =
				maximum === undefined ? Infinity : maximum - text.margins.left - text.margins.right;
			const laid = layout(inner);
			const mark = measure(' ', text.runs.at(-1) ?? fallback);
			if (!laid || !mark) return undefined;
			let widest = 0;
			laid.forEach((lines, index) => {
				const indent =
					(paragraphAt(index)?.indentLeft ?? 0) + (paragraphAt(index)?.indentRight ?? 0);
				lines.forEach((line, row) => {
					const first = row === 0 ? (paragraphAt(index)?.indentFirst ?? 0) : 0;
					widest = Math.max(widest, line.width + indent + first);
				});
			});
			return widest + mark.width + text.margins.left + text.margins.right;
		},
		height(width) {
			if (!Number.isFinite(width)) return undefined;
			const inner = width - text.margins.left - text.margins.right;
			if (inner <= 0) return undefined;
			const laid = layout(inner);
			if (!laid) return undefined;
			let total = text.margins.top + text.margins.bottom;
			laid.forEach((lines, index) => {
				const paragraph = paragraphAt(index);
				// Space before the first paragraph and after the last one is not drawn.
				if (index > 0) total += paragraph?.spaceBefore ?? 0;
				if (index < laid.length - 1) total += paragraph?.spaceAfter ?? 0;
				for (const line of lines) total += line.height;
			});
			return total;
		},
	};
}
