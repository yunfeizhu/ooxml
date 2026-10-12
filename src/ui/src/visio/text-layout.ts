import type { VisioTextRun } from 'ooxml-core/visio';
import { runDisplaySize, runDisplayText, sameRunExtras } from './text-run-style';
export interface TextLine {
	runs: VisioTextRun[];
	width: number;
	height: number;
}
export type MeasureText = (text: string, run: VisioTextRun) => number;
export interface TextLayoutLimits {
	maxCharacters: number;
	maxMeasurements: number;
	maxLines: number;
	maxFragments: number;
	maxShapeCharacters: number;
	maxShapeMeasurements: number;
	maxShapeLines: number;
	maxShapeFragments: number;
	maxCacheEntries: number;
}
const DEFAULT_LIMITS: TextLayoutLimits = {
	maxCharacters: 250_000,
	maxMeasurements: 50_000,
	maxLines: 20_000,
	maxFragments: 30_000,
	maxShapeCharacters: 50_000,
	maxShapeMeasurements: 10_000,
	maxShapeLines: 5000,
	maxShapeFragments: 10_000,
	maxCacheEntries: 4096,
};
export class TextLayoutBudgetError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'TextLayoutBudgetError';
	}
}
interface MeasurementCache {
	byMeasure: WeakMap<MeasureText, Map<string, number>>;
	entries: number;
}
/** One bounded measurement cache and work budget per render; shape scopes share both. */
export class TextLayoutBudget {
	#characters = 0;
	#measurements = 0;
	#lines = 0;
	#fragments = 0;
	private constructor(
		readonly limits: Readonly<TextLayoutLimits>,
		private readonly cache: MeasurementCache,
		private readonly parent?: TextLayoutBudget,
	) {}
	static create(options: Partial<TextLayoutLimits> = {}): TextLayoutBudget {
		const limits = { ...DEFAULT_LIMITS, ...options };
		if (Object.values(limits).some((value) => !Number.isSafeInteger(value) || value <= 0))
			throw new TextLayoutBudgetError('Text layout limits must be positive safe integers.');
		return new TextLayoutBudget(Object.freeze(limits), { byMeasure: new WeakMap(), entries: 0 });
	}
	get characters(): number {
		return this.#characters;
	}
	get measurements(): number {
		return this.#measurements;
	}
	get lines(): number {
		return this.#lines;
	}
	get fragments(): number {
		return this.#fragments;
	}
	/** A shape may be omitted without consuming the rest of the page's budget. */
	forShape(): TextLayoutBudget {
		return new TextLayoutBudget(
			Object.freeze({
				...this.limits,
				maxCharacters: Math.min(this.limits.maxCharacters, this.limits.maxShapeCharacters),
				maxMeasurements: Math.min(this.limits.maxMeasurements, this.limits.maxShapeMeasurements),
				maxLines: Math.min(this.limits.maxLines, this.limits.maxShapeLines),
				maxFragments: Math.min(this.limits.maxFragments, this.limits.maxShapeFragments),
			}),
			this.cache,
			this,
		);
	}
	reserveCharacters(count: number): void {
		if (
			!Number.isSafeInteger(count) ||
			count < 0 ||
			this.#characters + count > this.limits.maxCharacters
		)
			throw new TextLayoutBudgetError('Text layout exceeds its character budget.');
		this.parent?.reserveCharacters(count);
		this.#characters += count;
	}
	reserveLine(): void {
		if (this.#lines >= this.limits.maxLines)
			throw new TextLayoutBudgetError('Text layout exceeds its line budget.');
		this.parent?.reserveLine();
		++this.#lines;
	}
	reserveFragment(): void {
		if (this.#fragments >= this.limits.maxFragments)
			throw new TextLayoutBudgetError('Text layout exceeds its styled-fragment budget.');
		this.parent?.reserveFragment();
		++this.#fragments;
	}
	private reserveMeasurement(): void {
		if (this.#measurements >= this.limits.maxMeasurements)
			throw new TextLayoutBudgetError('Text layout exceeds its measurement budget.');
		this.parent?.reserveMeasurement();
		++this.#measurements;
	}
	measure(text: string, run: VisioTextRun, measure: MeasureText): number {
		if (
			run.fontFamily.length > 1024 ||
			!Number.isFinite(run.fontSize) ||
			run.fontSize < 0 ||
			run.fontSize > 100
		)
			throw new TextLayoutBudgetError('Text layout has an invalid font specification.');
		// Long tokens are measured once but not retained in cache. Style and function are part of the key.
		const key =
			text.length <= 256
				? JSON.stringify([
						run.fontFamily,
						run.fontSize,
						run.bold,
						run.italic,
						run.letterSpacing,
						run.position,
						run.textCase,
						text,
					])
				: undefined;
		const cache = this.cache.byMeasure.get(measure);
		const cached = key === undefined ? undefined : cache?.get(key);
		if (cached !== undefined) return cached;
		this.reserveMeasurement();
		const width = measure(text, run);
		if (!Number.isFinite(width) || width < 0)
			throw new TextLayoutBudgetError('Text measurement returned an invalid width.');
		if (key !== undefined && this.cache.entries < this.limits.maxCacheEntries) {
			const entries = cache ?? new Map<string, number>();
			if (!cache) this.cache.byMeasure.set(measure, entries);
			entries.set(key, width);
			++this.cache.entries;
		}
		return width;
	}
}
export const createTextLayoutBudget = (options: Partial<TextLayoutLimits> = {}): TextLayoutBudget =>
	TextLayoutBudget.create(options);

let canvas: CanvasRenderingContext2D | null | undefined;
export const measureBrowserText: MeasureText = (text, run) => {
	if (canvas === undefined)
		canvas =
			typeof CanvasRenderingContext2D === 'undefined'
				? null
				: document.createElement('canvas').getContext('2d');
	const count = Array.from(text).length;
	const spacing = (run.letterSpacing ?? 0) * count;
	const size = runDisplaySize(run);
	if (!canvas) return Math.max(0, count * size * 0.55 + spacing);
	canvas.font = `${run.italic ? 'italic ' : ''}${run.textCase === 'small-caps' ? 'small-caps ' : ''}${run.bold ? 'bold ' : ''}${size * 96}px ${JSON.stringify(run.fontFamily)}`;
	return Math.max(0, canvas.measureText(runDisplayText(text, run)).width / 96 + spacing);
};

/** Rendering-only greedy wrapping. Inject one budget across shapes to bound total UI-thread work. */
export function wrapText(
	runs: VisioTextRun[],
	width: number,
	measure: MeasureText = measureBrowserText,
	firstLineIndent = 0,
	budget: TextLayoutBudget = createTextLayoutBudget(),
): TextLine[] {
	if (!Number.isFinite(width) || !Number.isFinite(firstLineIndent) || runs.length > 10_000)
		throw new TextLayoutBudgetError('Text layout has invalid dimensions or too many runs.');
	const scope = budget.forShape();
	// Reserve before tokenization or expensive browser shaping, not after work is already done.
	scope.reserveCharacters(runs.reduce((count, run) => count + run.text.length, 0));
	const boundedMeasure = (value: string, run: VisioTextRun) => scope.measure(value, run, measure);
	const lines: TextLine[] = [];
	const available = () => Math.max(0.001, width - (lines.length === 0 ? firstLineIndent : 0));
	let line: TextLine = { runs: [], width: 0, height: 0 };
	const finish = () => {
		if (lines.length >= 5000)
			throw new TextLayoutBudgetError('Text layout exceeds the safe line limit.');
		scope.reserveLine();
		lines.push(line);
		line = { runs: [], width: 0, height: 0 };
	};
	const append = (text: string, run: VisioTextRun) => {
		if (!text) return;
		const size = boundedMeasure(text, run);
		const last = line.runs.at(-1);
		if (
			last &&
			last.fontFamily === run.fontFamily &&
			last.fontSize === run.fontSize &&
			last.color === run.color &&
			last.bold === run.bold &&
			last.italic === run.italic &&
			last.underline === run.underline &&
			!!last.strikethrough === !!run.strikethrough &&
			sameRunExtras(last, run)
		)
			last.text += text;
		else {
			scope.reserveFragment();
			line.runs.push({ ...run, text });
		}
		line.width += size;
		line.height = Math.max(line.height, run.fontSize * 1.2);
	};
	for (const run of runs) {
		const tokens = run.text.replace(/\r\n?/g, '\n').match(/\n|[^\S\n]+|[^\s]+/gu) ?? [];
		for (const token of tokens) {
			if (token === '\n') {
				line.height = Math.max(line.height, run.fontSize * 1.2);
				finish();
				continue;
			}
			const whitespace = /^\s+$/u.test(token);
			const size = boundedMeasure(token, run);
			if (line.runs.length && line.width + size > available()) {
				finish();
				if (whitespace) continue;
			}
			if (size <= available() || width <= 0) {
				append(token, run);
				continue;
			}
			// Bound characters before this loop, and reuse glyph widths without splitting surrogate pairs.
			let fragment = '',
				fragmentWidth = 0;
			for (const point of token) {
				const pointWidth = boundedMeasure(point, run);
				if (fragment && fragmentWidth + pointWidth > available()) {
					append(fragment, run);
					finish();
					fragment = '';
					fragmentWidth = 0;
				}
				fragment += point;
				fragmentWidth += pointWidth;
			}
			append(fragment, run);
		}
	}
	if (line.runs.length || !lines.length) finish();
	return lines;
}
