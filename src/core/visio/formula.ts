/** Conservative numeric ShapeSheet interpreter. Values use Visio internal units. */
export type VisioFormulaUnit = 'scalar' | 'length' | 'area' | 'angle' | 'time';
export interface VisioFormulaValue {
	value: number;
	unit: VisioFormulaUnit;
}
export interface VisioFormulaReference {
	shapeId?: string;
	cell: string;
}
export interface VisioFormulaLimits {
	/** Explicit document context, required for numeric page functions. */
	pageNumber?: number;
	pageCount?: number;
	maxLength?: number;
	maxNodes?: number;
	maxDepth?: number;
	maxSteps?: number;
	onStep?: () => void;
	/**
	 * A bare number added to or subtracted from a length is inches, the unit ShapeSheet formulas
	 * are saved in (`Width*0.5+0.0015`). Off by default: callers judging units stay strict.
	 */
	bareLengths?: boolean;
	/**
	 * The extent of the shape's own text, in inches, for `TEXTWIDTH(TheText[, maximum])` and
	 * `TEXTHEIGHT(TheText, width)`. Without it, or when it returns `undefined`, those functions
	 * are unsupported.
	 */
	text?: {
		width(maximum?: number): number | undefined;
		height(width: number): number | undefined;
	};
}
export type VisioFormulaAst =
	| { kind: 'number'; value: number; unit: VisioFormulaUnit }
	| { kind: 'string'; value: string }
	| { kind: 'reference'; reference: VisioFormulaReference }
	| { kind: 'unary'; operator: string; operand: VisioFormulaAst }
	| { kind: 'binary'; operator: string; left: VisioFormulaAst; right: VisioFormulaAst }
	| { kind: 'call'; name: string; args: VisioFormulaAst[] };
export class VisioFormulaError extends Error {
	constructor(
		public readonly code: string,
		message: string,
	) {
		super(message);
		this.name = 'VisioFormulaError';
	}
}
export const formulaFailure = (code: string, message: string): never => {
	throw new VisioFormulaError(code, message);
};
export function formulaLimit(value: number | undefined, fallback: number): number {
	if (value === undefined) return fallback;
	if (!Number.isSafeInteger(value) || value < 1 || value > fallback)
		return formulaFailure('limit', 'Invalid or excessive formula limit');
	return value;
}
const units: Record<string, [VisioFormulaUnit, number]> = {
	NUM: ['scalar', 1],
	BOOL: ['scalar', 1],
	DL: ['length', 1],
	DP: ['length', 1],
	DA: ['angle', 1],
	DT: ['length', 1],
	IN: ['length', 1],
	INCH: ['length', 1],
	MM: ['length', 1 / 25.4],
	CM: ['length', 1 / 2.54],
	PT: ['length', 1 / 72],
	FT: ['length', 12],
	DEG: ['angle', Math.PI / 180],
	RAD: ['angle', 1],
	SEC: ['time', 1],
	MIN: ['time', 60],
	HR: ['time', 3600],
};
/** Cached V attributes already contain internal values, so U is a dimension tag only. */
export function visioFormulaCachedValue(value: string, unit?: string): VisioFormulaValue {
	if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))
		return formulaFailure('value', 'Non-numeric cell cache');
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) return formulaFailure('value', 'Non-finite cell cache');
	if (!unit || unit === 'NUM' || unit === 'BOOL') return { value: numeric, unit: 'scalar' };
	const definition = Object.hasOwn(units, unit.toUpperCase())
		? units[unit.toUpperCase()]
		: undefined;
	if (!definition) return formulaFailure('unit', `Unsupported unit ${unit}`);
	return { value: numeric, unit: definition[0] };
}
export function parseVisioFormula(
	source: string,
	limits: VisioFormulaLimits = {},
): VisioFormulaAst {
	if (source.length > formulaLimit(limits.maxLength, 8192))
		return formulaFailure('limit', 'Formula length limit');
	const maxNodes = formulaLimit(limits.maxNodes, 1024),
		maxDepth = formulaLimit(limits.maxDepth, 64);
	let offset = 0,
		count = 0;
	const whitespace = () => {
		while (/\s/.test(source[offset] ?? '') && offset < source.length) offset++;
	};
	const node = (ast: VisioFormulaAst): VisioFormulaAst => {
		if (++count > maxNodes) return formulaFailure('limit', 'Formula AST limit');
		return ast;
	};
	const expression = (precedence = 0, depth = 0): VisioFormulaAst => {
		if (depth > maxDepth) return formulaFailure('limit', 'Formula depth limit');
		whitespace();
		let left: VisioFormulaAst;
		const char = source[offset];
		if (char === '+' || char === '-') {
			offset++;
			left = node({ kind: 'unary', operator: char, operand: expression(3, depth + 1) });
		} else if (char === '(') {
			offset++;
			left = expression(0, depth + 1);
			whitespace();
			if (source[offset++] !== ')') return formulaFailure('syntax', 'Expected closing parenthesis');
		} else if (char === '"') {
			offset++;
			let value = '',
				closed = false;
			while (offset < source.length) {
				const item = source[offset++]!;
				if (item === '"') {
					if (source[offset] === '"') {
						value += '"';
						offset++;
					} else {
						closed = true;
						break;
					}
				} else value += item;
			}
			if (!closed) return formulaFailure('syntax', 'Unterminated formula string');
			left = node({ kind: 'string', value });
		} else {
			const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(source.slice(offset));
			if (number) {
				offset += number[0].length;
				whitespace();
				const suffix = /^[A-Za-z]+\b/.exec(source.slice(offset));
				let unit: VisioFormulaUnit = 'scalar',
					scale = 1;
				if (suffix) {
					const definition = Object.hasOwn(units, suffix[0].toUpperCase())
						? units[suffix[0].toUpperCase()]
						: undefined;
					if (!definition) return formulaFailure('unit', `Unsupported unit ${suffix[0]}`);
					[unit, scale] = definition;
					offset += suffix[0].length;
				} else if (source[offset] === '%') {
					// A percentage literal, as stencil style sheets write transparency: `0%`.
					scale = 0.01;
					offset++;
				}
				const value = Number(number[0]) * scale;
				if (!Number.isFinite(value)) return formulaFailure('value', 'Non-finite literal');
				left = node({ kind: 'number', value, unit });
			} else {
				const identifier = /^(?:Sheet\.\d+!)?[A-Za-z_][A-Za-z_0-9]*(?:\.[A-Za-z_0-9]+)*/i.exec(
					source.slice(offset),
				);
				if (!identifier) return formulaFailure('syntax', `Unsupported formula token at ${offset}`);
				offset += identifier[0].length;
				whitespace();
				if (source[offset] === '(') {
					if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(identifier[0]))
						return formulaFailure('syntax', 'Qualified function names are unsupported');
					offset++;
					const args: VisioFormulaAst[] = [];
					whitespace();
					if (source[offset] !== ')') {
						for (;;) {
							args.push(expression(0, depth + 1));
							whitespace();
							if (source[offset] !== ',') break;
							offset++;
						}
					}
					if (source[offset++] !== ')')
						return formulaFailure('syntax', 'Expected function closing parenthesis');
					left = node({ kind: 'call', name: identifier[0].toUpperCase(), args });
				} else {
					const ref = /^Sheet\.(\d+)!(.+)$/i.exec(identifier[0]);
					left = node({
						kind: 'reference',
						reference: ref ? { shapeId: ref[1]!, cell: ref[2]! } : { cell: identifier[0] },
					});
				}
			}
		}
		for (;;) {
			whitespace();
			const operator = /^(?:<=|>=|<>|!=|=|<|>|\+|-|\*|\/|\^)/.exec(source.slice(offset))?.[0];
			if (!operator) break;
			const rank = ['=', '<>', '!=', '<', '>', '<=', '>='].includes(operator)
				? 1
				: ['+', '-'].includes(operator)
					? 2
					: ['*', '/'].includes(operator)
						? 3
						: 4;
			if (rank <= precedence) break;
			offset += operator.length;
			left = node({
				kind: 'binary',
				operator,
				left,
				right: expression(operator === '^' ? rank - 1 : rank, depth + 1),
			});
		}
		return left;
	};
	whitespace();
	if (source[offset] === '=') offset++;
	const ast = expression();
	whitespace();
	if (offset !== source.length)
		return formulaFailure('syntax', `Trailing formula content at ${offset}`);
	return ast;
}

export { analyzeVisioFormula, evaluateVisioFormula } from './formula-evaluate';
