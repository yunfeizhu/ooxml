import { themeInputs } from './formula-theme';
import {
	finiteFormulaValue as finite,
	compatibleFormulaUnits as compatible,
	formulaProductUnit,
	formulaQuotientUnit,
	formulaExponentUnit,
	formulaSquareRootUnit,
} from './formula-arithmetic';
import {
	numericFormulaFunctions,
	evaluateNumericFormulaFunction,
} from './formula-numeric-functions';
import { formulaFailure, formulaLimit, parseVisioFormula } from './formula';
import type {
	VisioFormulaAst,
	VisioFormulaLimits,
	VisioFormulaReference,
	VisioFormulaValue,
} from './formula';

const supported = new Set([
	'GUARD',
	'IF',
	'ABS',
	'MIN',
	'MAX',
	'BOUND',
	'SQRT',
	'SIN',
	'COS',
	'TAN',
	'ATAN2',
	'SIGN',
	'PI',
	'PAGENUMBER',
	'PAGECOUNT',
	...numericFormulaFunctions,
]);
// Known pure functions may be independent of an edit even when evaluation is unsupported.
const staticUnsupported = new Set([
	// FONT reads the font table by name, not a hidden ShapeSheet reference.
	// Keep evaluation unsupported: identifiers depend on the document/system.
	// https://learn.microsoft.com/en-us/office/client-developer/visio/font-function
	'FONT',
	// Page-name lookup has explicit arguments but returns a string, outside numeric evaluation.
	'PAGENAME',
	// Text-field functions read document properties or the clock, never ShapeSheet cells.
	// https://learn.microsoft.com/en-us/office/client-developer/visio/now-function
	'NOW',
	'DOCCREATION',
	'DOCLASTSAVE',
	'DOCLASTEDIT',
	'DOCLASTPRINT',
	'TITLE',
	'SUBJECT',
	'CREATOR',
	'KEYWORDS',
	'DESCRIPTION',
	'CATEGORY',
	'COMPANY',
	'MANAGER',
	// POLYLINE encodes explicitly supplied geometry data; affected expressions
	// still require the geometry evaluator and are rejected by numeric recalculation.
	// https://learn.microsoft.com/en-us/office/client-developer/visio/polyline-function
	'POLYLINE',
	// NURBS likewise carries explicit control points (curved connectors write literal ones).
	// https://learn.microsoft.com/en-us/office/client-developer/visio/nurbs-function
	'NURBS',
	'ROUND',
	'INT',
	'MOD',
	'POW',
	'EXP',
	'LN',
	'LOG',
	'LOG10',
	'ASIN',
	'ACOS',
	'ATAN',
	'TRUNC',
	'AND',
	'OR',
	'NOT',
	'SUM',
	'RGB',
	'HSL',
	'THEMEGUARD',
	'THEMEVAL',
	'THEME',
	'ISTHEMED',
	'BITAND',
	'BITOR',
	'BITXOR',
	'TINT',
	'MSOTINT',
	'SHADE',
	'LUMDIFF',
	'MODULUS',
]);
// These functions can introduce references that cannot be identified from argument ASTs.
const dynamic = new Set([
	'INDIRECT',
	'EVALCELL',
	'EVALTEXT',
	'DEPENDSON',
	'SETATREF',
	'SETATREFEXPR',
	'SETATREFEVAL',
	'GETREF',
	'REF',
	'SHAPETEXT',
	'CALLOUTTARGET',
	'CONTAINERSHEETREF',
	'MEMBERSHEETREF',
	'PARENT',
	'PAR',
]);
/** A function the analyser classifies by name, whether or not it can evaluate it. */
export const isClassifiedVisioFunction = (name: string): boolean =>
	supported.has(name) || staticUnsupported.has(name) || dynamic.has(name);
export interface VisioFormulaAnalysis {
	references: VisioFormulaReference[];
	unsupportedFunctions: string[];
	dynamic: boolean;
	guarded: boolean;
}
function traverse(
	ast: VisioFormulaAst,
	limits: VisioFormulaLimits,
	visit: (node: VisioFormulaAst) => void,
): void {
	const maxNodes = formulaLimit(limits.maxNodes, 1024),
		maxDepth = formulaLimit(limits.maxDepth, 64);
	const queue: [VisioFormulaAst, number][] = [[ast, 0]];
	let count = 0;
	while (queue.length) {
		const [node, depth] = queue.pop()!;
		if (++count > maxNodes || depth > maxDepth)
			return formulaFailure('limit', 'Formula analysis limit');
		visit(node);
		if (node.kind === 'unary') queue.push([node.operand, depth + 1]);
		if (node.kind === 'binary') queue.push([node.left, depth + 1], [node.right, depth + 1]);
		if (node.kind === 'call') for (const arg of node.args) queue.push([arg, depth + 1]);
	}
}
export function analyzeVisioFormula(
	source: string | VisioFormulaAst,
	limits: VisioFormulaLimits = {},
): VisioFormulaAnalysis {
	const ast = typeof source === 'string' ? parseVisioFormula(source, limits) : source;
	const references = new Map<string, VisioFormulaReference>(),
		unsupportedFunctions = new Set<string>();
	let unsafe = false,
		guarded = false;
	traverse(ast, limits, (node) => {
		if (node.kind === 'reference')
			references.set(
				`${node.reference.shapeId ?? ''}!${node.reference.cell.toLowerCase()}`,
				node.reference,
			);
		if (node.kind === 'call') {
			const inputs =
				node.name === 'ISTHEMED'
					? ['ColorSchemeIndex']
					: ['THEMEVAL', 'THEME'].includes(node.name)
						? themeInputs
						: [];
			for (const cell of inputs) references.set(`!${cell.toLowerCase()}`, { cell });
			if (!supported.has(node.name)) unsupportedFunctions.add(node.name);
			if (
				dynamic.has(node.name) ||
				(!supported.has(node.name) && !staticUnsupported.has(node.name))
			)
				unsafe = true;
			if (node.name === 'GUARD') guarded = true;
		}
	});
	return {
		references: [...references.values()],
		unsupportedFunctions: [...unsupportedFunctions],
		dynamic: unsafe,
		guarded,
	};
}
function binary(operator: string, a: VisioFormulaValue, b: VisioFormulaValue): VisioFormulaValue {
	let unit: VisioFormulaValue['unit'];
	if (operator === '+' || operator === '-') {
		unit = compatible(a, b);
		return finite({ value: operator === '+' ? a.value + b.value : a.value - b.value, unit });
	}
	if (operator === '*') {
		return finite({ value: a.value * b.value, unit: formulaProductUnit(a.unit, b.unit) });
	}
	if (operator === '/') {
		if (b.value === 0) return formulaFailure('value', 'Division by zero');
		return finite({ value: a.value / b.value, unit: formulaQuotientUnit(a.unit, b.unit) });
	}
	if (operator === '^') {
		return finite({ value: a.value ** b.value, unit: formulaExponentUnit(a.unit, b) });
	}
	compatible(a, b);
	const comparisons: Record<string, boolean> = {
		'=': a.value === b.value,
		'<>': a.value !== b.value,
		'!=': a.value !== b.value,
		'<': a.value < b.value,
		'>': a.value > b.value,
		'<=': a.value <= b.value,
		'>=': a.value >= b.value,
	};
	if (!(operator in comparisons))
		return formulaFailure('syntax', `Unsupported operator ${operator}`);
	return { value: comparisons[operator] ? 1 : 0, unit: 'scalar' };
}
export function evaluateVisioFormula(
	source: string | VisioFormulaAst,
	resolve: (reference: VisioFormulaReference) => VisioFormulaValue,
	limits: VisioFormulaLimits = {},
): VisioFormulaValue {
	const ast = typeof source === 'string' ? parseVisioFormula(source, limits) : source;
	const maxSteps = formulaLimit(limits.maxSteps, 8192),
		maxDepth = formulaLimit(limits.maxDepth, 64);
	// Validate caller-supplied ASTs as well as parsed ones before recursive evaluation.
	traverse(ast, limits, () => {});
	let steps = 0;
	const evaluate = (node: VisioFormulaAst, depth = 0): VisioFormulaValue => {
		if (++steps > maxSteps || depth > maxDepth)
			return formulaFailure('limit', 'Formula evaluation limit');
		limits.onStep?.();
		if (node.kind === 'number') return finite({ value: node.value, unit: node.unit });
		if (node.kind === 'string')
			return formulaFailure('value', 'String results are outside the numeric formula subset');
		if (node.kind === 'reference') return finite(resolve(node.reference));
		if (node.kind === 'unary') {
			const result = evaluate(node.operand, depth + 1);
			return finite({
				value: node.operator === '-' ? -result.value : result.value,
				unit: result.unit,
			});
		}
		if (node.kind === 'binary') {
			let left = evaluate(node.left, depth + 1),
				right = evaluate(node.right, depth + 1);
			if (limits.bareLengths && (node.operator === '+' || node.operator === '-')) {
				if (left.unit === 'length' && right.unit === 'scalar' && node.right.kind === 'number')
					right = { ...right, unit: 'length' };
				else if (right.unit === 'length' && left.unit === 'scalar' && node.left.kind === 'number')
					left = { ...left, unit: 'length' };
			}
			return binary(node.operator, left, right);
		}
		const name = node.name;
		if ((name === 'TEXTWIDTH' || name === 'TEXTHEIGHT') && limits.text) {
			const text = node.args[0];
			const count = node.args.length;
			if (
				text?.kind !== 'reference' ||
				text.reference.shapeId !== undefined ||
				text.reference.cell.toLowerCase() !== 'thetext' ||
				count > 2 ||
				(name === 'TEXTHEIGHT' && count !== 2)
			)
				return formulaFailure('unsupported', `Unsupported ${name} arguments`);
			const limit = count === 2 ? evaluate(node.args[1]!, depth + 1) : undefined;
			if (limit && limit.unit !== 'length' && limit.unit !== 'scalar')
				return formulaFailure('unit', `${name} requires a length`);
			const value =
				name === 'TEXTWIDTH' ? limits.text.width(limit?.value) : limits.text.height(limit!.value);
			if (value === undefined)
				return formulaFailure('unsupported', 'The text cannot be measured reliably');
			return finite({ value, unit: 'length' });
		}
		if (!supported.has(name)) return formulaFailure('unsupported', `Unsupported function ${name}`);
		const arity = (min: number, max = min) => {
			if (node.args.length < min || node.args.length > max)
				return formulaFailure('arity', `Invalid ${name} argument count`);
		};
		const arg = (index: number) => evaluate(node.args[index]!, depth + 1);
		if (name === 'PAGENUMBER' || name === 'PAGECOUNT') {
			arity(0);
			const value = name === 'PAGENUMBER' ? limits.pageNumber : limits.pageCount;
			if (value === undefined || !Number.isSafeInteger(value) || value < 0)
				return formulaFailure('context', `${name} requires a valid document context`);
			return { value, unit: 'scalar' };
		}
		if (numericFormulaFunctions.has(name))
			return evaluateNumericFormulaFunction(
				name,
				node.args.map((_, index) => arg(index)),
			);
		if (name === 'PI') {
			arity(0);
			return { value: Math.PI, unit: 'scalar' };
		}
		if (name === 'GUARD') {
			arity(1);
			return arg(0);
		}
		if (name === 'IF') {
			arity(3);
			const condition = arg(0);
			if (condition.unit !== 'scalar') return formulaFailure('unit', 'IF condition must be scalar');
			return arg(condition.value === 0 ? 2 : 1);
		}
		if (name === 'MIN' || name === 'MAX') {
			arity(1, 1024);
			const args = node.args.map((_, i) => arg(i));
			let result = args[0]!;
			for (const item of args.slice(1)) {
				const unit = compatible(result, item);
				result = {
					value:
						name === 'MIN'
							? Math.min(result.value, item.value)
							: Math.max(result.value, item.value),
					unit,
				};
			}
			return finite(result);
		}
		if (name === 'BOUND') {
			// BOUND(value, type, ignore1, min1, max1, ...): control handles of stencil shapes use it.
			// https://learn.microsoft.com/en-us/office/client-developer/visio/bound-function
			if (node.args.length < 5 || (node.args.length - 2) % 3 !== 0 || node.args.length > 302)
				return formulaFailure('arity', 'Invalid BOUND argument count');
			const value = arg(0),
				type = arg(1);
			if (type.unit !== 'scalar' || (type.value !== 0 && type.value !== 2))
				return formulaFailure('unsupported', 'Exclusive BOUND ranges are not evaluated');
			if (type.value === 2) return value;
			let nearest: number | undefined;
			let unit = value.unit;
			for (let index = 2; index < node.args.length; index += 3) {
				if (arg(index).value !== 0) continue;
				const a = arg(index + 1),
					b = arg(index + 2);
				unit = compatible({ value: value.value, unit }, a);
				unit = compatible({ value: value.value, unit }, b);
				const low = Math.min(a.value, b.value),
					high = Math.max(a.value, b.value);
				if (value.value >= low && value.value <= high) return finite({ value: value.value, unit });
				const edge = value.value < low ? low : high;
				if (nearest === undefined || Math.abs(edge - value.value) < Math.abs(nearest - value.value))
					nearest = edge;
			}
			return finite({ value: nearest ?? value.value, unit });
		}
		if (name === 'ATAN2') {
			arity(2);
			const y = arg(0),
				x = arg(1);
			compatible(y, x);
			return { value: Math.atan2(y.value, x.value), unit: 'angle' };
		}
		if (name === 'SIGN') {
			arity(1, 2);
			const value = arg(0);
			const fuzz = node.args.length === 2 ? arg(1) : { value: 1e-9, unit: 'scalar' as const };
			if (fuzz.value < 0 || (fuzz.unit !== 'scalar' && fuzz.unit !== value.unit))
				return formulaFailure('unit', 'Invalid SIGN fuzz');
			return {
				value: Math.abs(value.value) <= fuzz.value ? 0 : Math.sign(value.value),
				unit: 'scalar',
			};
		}
		arity(1);
		const value = arg(0);
		if (name === 'ABS') return { value: Math.abs(value.value), unit: value.unit };
		if (name === 'SQRT') {
			return finite({ value: Math.sqrt(value.value), unit: formulaSquareRootUnit(value.unit) });
		}
		if (value.unit !== 'angle' && value.unit !== 'scalar')
			return formulaFailure('unit', `${name} requires radians`);
		return finite({
			value:
				name === 'SIN'
					? Math.sin(value.value)
					: name === 'COS'
						? Math.cos(value.value)
						: Math.tan(value.value),
			unit: 'scalar',
		});
	};
	return evaluate(ast);
}
