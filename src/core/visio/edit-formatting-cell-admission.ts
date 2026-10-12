import { attribute } from './sheet';
import { fail } from './package-common';
import { editableCell } from './edit-geometry-admission';
import { executableCellFormula } from './cell-formula';
import {
	evaluateVisioFormula,
	visioFormulaCachedValue,
	parseVisioFormula,
	type VisioFormulaAst,
} from './formula';

function themeLiteral(node: VisioFormulaAst): boolean {
	if (node.kind === 'string' || node.kind === 'number') return true;
	// MSOTINT darkens with a negative percent.
	if (node.kind === 'unary' && node.operator === '-') return node.operand.kind === 'number';
	if (node.kind !== 'call' || !node.args.every(themeLiteral)) return false;
	// A literal colour as the fallback of a lookup: THEMEVAL("LineColor",RGB(0,0,0)).
	if (node.name === 'RGB')
		return node.args.length === 3 && node.args.every((arg) => arg.kind === 'number');
	if (node.name === 'THEMEGUARD') return node.args.length <= 1;
	// A lighter or darker Theme Colors swatch: MSOTINT(THEMEVAL("AccentColor"),80).
	if (node.name === 'MSOTINT') return node.args.length === 2;
	if (node.name === 'THEME')
		return node.args.length === 0 || (node.args.length === 1 && node.args[0]?.kind === 'string');
	if (node.name !== 'THEMEVAL' || node.args.length > 2) return false;
	const selector = node.args[0];
	return (
		!selector ||
		selector.kind === 'string' ||
		(selector.kind === 'number' &&
			selector.unit === 'scalar' &&
			Number.isInteger(selector.value) &&
			selector.value >= 1 &&
			selector.value <= 8)
	);
}
/** A literal THEMEVAL/THEME/THEMEGUARD lookup, resolved from the theme by readers. */
export function isThemeLookupFormula(source: string | undefined): boolean {
	const ast = source ? parseVisioFormula(source) : undefined;
	return (
		ast?.kind === 'call' &&
		['THEMEVAL', 'THEME', 'THEMEGUARD'].includes(ast.name) &&
		themeLiteral(ast)
	);
}

/** Literal native font/color lookups are safe to replace after GUARD and reference analysis. */
export function assertEditableFormattingCell(cell: Element | undefined): void {
	const source = executableCellFormula(attribute(cell, 'F'));
	const parsed = source ? parseVisioFormula(source) : undefined;
	if (parsed && proportionalTextBlockFormula(attribute(cell, 'N'), parsed)) {
		if (cell?.hasAttribute('E'))
			fail('EDIT_PROTECTED_CELL', 'Cannot overwrite an error formatting cell.');
		return;
	}
	// A saved RGB text background carries Visio's +1 palette offset.
	const ast =
		parsed?.kind === 'binary' &&
		parsed.operator === '+' &&
		parsed.right.kind === 'number' &&
		parsed.right.value === 1 &&
		attribute(cell, 'N') === 'TextBkgnd'
			? parsed.left
			: parsed;
	// THEMEGUARD is explicitly overridable by manual formatting; GUARD and
	// SETATREF remain prohibited. Only literal theme lookups are admitted here.
	// https://learn.microsoft.com/en-us/office/client-developer/visio/themeguard-function
	if (
		ast?.kind === 'call' &&
		((ast.name === 'FONT' && ast.args.length === 1 && ast.args[0]?.kind === 'string') ||
			(ast.name === 'RGB' &&
				ast.args.length === 3 &&
				ast.args.every(
					(arg) =>
						arg.kind === 'number' &&
						arg.unit === 'scalar' &&
						Number.isInteger(arg.value) &&
						arg.value >= 0 &&
						arg.value <= 255,
				)) ||
			(['THEMEVAL', 'THEME', 'THEMEGUARD'].includes(ast.name) && themeLiteral(ast)))
	) {
		if (cell?.hasAttribute('E'))
			fail('EDIT_PROTECTED_CELL', 'Cannot overwrite an error formatting cell.');
		return;
	}
	editableCell(cell);
	if (source && cell) {
		const actual = evaluateVisioFormula(source, () =>
			fail('EDIT_PROTECTED_CELL', 'Formatting dependencies cannot be overwritten.'),
		);
		const cache = visioFormulaCachedValue(attribute(cell, 'V') ?? '', attribute(cell, 'U'));
		if (
			actual.value !== cache.value ||
			(actual.unit !== cache.unit &&
				!(cache.unit === 'scalar' && actual.unit === 'length' && !cell.hasAttribute('U')))
		)
			fail('EDIT_PROTECTED_CELL', 'Formatting formula cache is stale or has incompatible units.');
	}
}

/** Text Block tool formulas (`Width*k`, `TxtHeight*0.5`): own-shape proportions it rewrites. */
function proportionalTextBlockFormula(name: string | undefined, ast: VisioFormulaAst): boolean {
	const bases: Record<string, string[]> = {
		TxtPinX: ['Width'],
		TxtWidth: ['Width'],
		TxtPinY: ['Height'],
		TxtHeight: ['Height'],
		TxtLocPinX: ['TxtWidth'],
		TxtLocPinY: ['TxtHeight'],
	};
	const allowed = name ? bases[name] : undefined;
	if (!allowed || ast.kind !== 'binary' || ast.operator !== '*') return false;
	const [reference, factor] =
		ast.left.kind === 'reference' ? [ast.left, ast.right] : [ast.right, ast.left];
	return (
		reference.kind === 'reference' &&
		reference.reference.shapeId === undefined &&
		allowed.includes(reference.reference.cell) &&
		((factor.kind === 'number' && factor.unit === 'scalar') ||
			(factor.kind === 'unary' &&
				factor.operand.kind === 'number' &&
				factor.operand.unit === 'scalar'))
	);
}
