import { singleScope, type InstanceScope } from './edit-instance-scope';
import {
	effectiveFormula,
	effectiveNode,
	type InstanceCell,
	type InstanceSheet,
} from './edit-instance-sheet';
import {
	analyzeVisioFormula,
	evaluateVisioFormula,
	parseVisioFormula,
	visioFormulaCachedValue,
	type VisioFormulaAst,
	type VisioFormulaLimits,
	type VisioFormulaUnit,
	type VisioFormulaValue,
} from './formula';
import { textSizeFormula } from './edit-text-size-formula';
import { fail } from './package-common';
import { attribute } from './sheet';

/** A dependent cell this editor cannot compute; the caller decides whether that is fatal. */
class Unevaluable extends Error {}

/**
 * Sections whose cells are data, menus and scratch values: nothing is drawn from them directly.
 * A cache there that cannot be recomputed is left for Visio, which recalculates it on open; a
 * drawn cell that depends on one still fails, because its own value cannot be computed.
 */
const PASSIVE = new Set([
	'User',
	'Property',
	'Actions',
	'ActionTag',
	'Hyperlink',
	'Scratch',
	'Reviewer',
	'Annotation',
]);
const LENGTHS =
	/^(width|height|pinx|piny|locpinx|locpiny|txtpinx|txtpiny|txtwidth|txtheight|txtlocpinx|txtlocpiny|beginx|beginy|endx|endy)$/;

/** `undefined`: an untagged data cell (User, Scratch, Prop) takes whatever its formula yields. */
function expectedUnit(cell: InstanceCell): VisioFormulaUnit | undefined {
	const unit = attribute(cell.local, 'U') ?? attribute(cell.inherited, 'U');
	if (unit === undefined && cell.section && PASSIVE.has(cell.section.name)) return undefined;
	if (unit !== undefined) {
		try {
			return visioFormulaCachedValue('0', unit).unit;
		} catch {
			throw new Unevaluable();
		}
	}
	const name = cell.names[0]!;
	if (/^(angle|txtangle)$/.test(name)) return 'angle';
	if (LENGTHS.test(name)) return 'length';
	// Named rows (`Controls.Row_1`) carry no index for the pattern below to recognise.
	if (
		cell.section &&
		['Control', 'Connection'].includes(cell.section.name) &&
		/^(X|Y|XDyn|YDyn)$/.test(cell.name)
	)
		return 'length';
	return !cell.relative && /^(geometry\d+|connections|controls)\.[xy]\d+$/.test(name)
		? 'length'
		: 'scalar';
}

interface Dependencies {
	ast?: VisioFormulaAst;
	/** The formula was written on the page: its `Sheet.N!` names are page shape IDs. */
	local: boolean;
	references: InstanceCell[];
	/** The formula measures the shape's text (TEXTWIDTH, TEXTHEIGHT). */
	text?: boolean;
}

export interface InstanceCacheWrite {
	/** The sheet the cell belongs to: the instance, or a sub-shape of a group instance. */
	sheet: InstanceSheet;
	cell: InstanceCell;
	value: number;
	/** The value is a length in inches. */
	length: boolean;
}

/**
 * The inherited caches that change when `overrides` become local values of the instance. Only
 * what master geometry normally uses is evaluated: arithmetic, comparisons, IF, MIN, MAX and the
 * like over cells of the same shape and, in a group instance, of its other sub-shapes
 * (`Sheet.5!Width`). A drawn cell (transform, text block, geometry, connection
 * point, formatting) that depends on anything else refuses the edit.
 */
export function recalculateInstanceCaches(
	target: InstanceSheet | InstanceScope,
	changed: ReadonlyMap<InstanceCell, number>,
	check: () => void,
	/** Cells that become local values too when they would otherwise follow a changed cell. */
	pins: ReadonlyMap<InstanceCell, number> = new Map(),
	/**
	 * The shape's text was edited: cells that measure it are computed again with these extents,
	 * and so is everything that follows from them.
	 */
	text?: NonNullable<VisioFormulaLimits['text']>,
): { writes: InstanceCacheWrite[]; pinned: ReadonlyMap<InstanceCell, number> } {
	const scope = 'sheets' in target ? target : singleScope(target);
	const overrides = new Map(changed);
	const pinned = new Map<InstanceCell, number>();
	const dependencies = new Map<InstanceCell, Dependencies | undefined>();
	const dependenciesOf = (cell: InstanceCell): Dependencies | undefined => {
		if (dependencies.has(cell)) return dependencies.get(cell);
		const source = effectiveFormula(cell);
		let result: Dependencies | undefined;
		if (source) {
			const own = attribute(cell.local, 'F');
			const local = !!cell.local && own !== undefined && own !== 'Inh';
			const found = (name: string, shapeId?: string) => {
				const item = scope.resolve(cell, name, shapeId, local);
				return item ? [item] : [];
			};
			// Every name the text mentions, also inside strings: INDIRECT("Width") reads Width.
			const mentioned = () =>
				[...source.matchAll(/(?:\bSheet\.(\d+)!)?([A-Za-z_][A-Za-z_0-9.]*)/g)].flatMap((match) =>
					found(match[2]!, match[1]),
				);
			try {
				const ast = parseVisioFormula(source);
				const analysis = analyzeVisioFormula(ast);
				const sized = text && analysis.dynamic ? textSizeFormula(ast) : undefined;
				// A formula with functions this editor cannot follow is never evaluated.
				result = sized
					? {
							ast,
							local,
							text: true,
							references: sized.references.flatMap((ref) => found(ref.cell, ref.shapeId)),
						}
					: analysis.dynamic
						? { local, references: mentioned() }
						: {
								ast,
								local,
								references: analysis.references.flatMap((ref) => found(ref.cell, ref.shapeId)),
							};
			} catch {
				result = { local, references: mentioned() };
			}
		}
		dependencies.set(cell, result);
		return result;
	};
	const affected = new Map<InstanceCell, boolean>();
	const isAffected = (cell: InstanceCell, active: Set<InstanceCell>): boolean => {
		check();
		if (overrides.has(cell)) return true;
		const known = affected.get(cell);
		if (known !== undefined) return known;
		// A cycle cannot be recomputed; treating it as unaffected keeps its saved cache.
		if (active.has(cell)) return false;
		active.add(cell);
		const own = dependenciesOf(cell);
		const result = !!own?.text || !!own?.references.some((item) => isAffected(item, active));
		active.delete(cell);
		affected.set(cell, result);
		return result;
	};
	for (let again = true; again;) {
		again = false;
		for (const [cell, value] of pins)
			if (!overrides.has(cell) && isAffected(cell, new Set())) {
				overrides.set(cell, value);
				pinned.set(cell, value);
				affected.clear();
				again = true;
			}
	}
	const values = new Map<InstanceCell, VisioFormulaValue>();
	const evaluating = new Set<InstanceCell>();
	let steps = 200_000;
	const cached = (cell: InstanceCell): VisioFormulaValue => {
		const node = effectiveNode(cell);
		if (!node || node.hasAttribute('E')) throw new Unevaluable();
		try {
			const value = visioFormulaCachedValue(attribute(node, 'V') ?? '', attribute(node, 'U'));
			const unit = expectedUnit(cell);
			return value.unit === 'scalar' && unit && unit !== 'scalar' ? { ...value, unit } : value;
		} catch {
			throw new Unevaluable();
		}
	};
	const evaluate = (cell: InstanceCell): VisioFormulaValue => {
		check();
		if (--steps < 0)
			fail('LIMIT_FORMULA_STEPS', 'ShapeSheet dependency evaluation limit exceeded.');
		const override = overrides.get(cell);
		if (override !== undefined) return { value: override, unit: expectedUnit(cell) ?? 'scalar' };
		const known = values.get(cell);
		if (known) return known;
		if (!isAffected(cell, new Set())) return cached(cell);
		const own = dependenciesOf(cell);
		const ast = own?.ast;
		if (!ast || evaluating.has(cell)) throw new Unevaluable();
		evaluating.add(cell);
		let result: VisioFormulaValue;
		try {
			result = evaluateVisioFormula(
				ast,
				(reference) => {
					const name = reference.cell.toLowerCase();
					if (reference.shapeId === undefined && (name === 'true' || name === 'false'))
						return { value: Number(name === 'true'), unit: 'scalar' };
					// A sheet outside the instance (the page, another shape) is never evaluated.
					const read = scope.resolve(cell, name, reference.shapeId, own!.local);
					if (!read) throw new Unevaluable();
					return evaluate(read);
				},
				{
					bareLengths: true,
					onStep: () => {
						if (--steps < 0)
							fail('LIMIT_FORMULA_STEPS', 'ShapeSheet dependency evaluation limit exceeded.');
					},
					...(text ? { text } : {}),
				},
			);
		} catch (error) {
			if (error instanceof Error && error.name === 'VisioFormulaError') throw new Unevaluable();
			throw error;
		} finally {
			evaluating.delete(cell);
		}
		const unit = expectedUnit(cell);
		if (unit && result.unit === 'scalar' && unit !== 'scalar') result = { ...result, unit };
		if (
			(unit && result.unit !== unit) ||
			!Number.isFinite(result.value) ||
			Math.abs(result.value) > 1e9
		)
			throw new Unevaluable();
		values.set(cell, result);
		return result;
	};
	const writes: InstanceCacheWrite[] = [];
	for (const cell of scope.cells) {
		if (overrides.has(cell) || !isAffected(cell, new Set())) continue;
		let value: number;
		let length: boolean;
		try {
			const result = evaluate(cell);
			value = result.value;
			length = result.unit === 'length';
		} catch (error) {
			if (!(error instanceof Unevaluable)) throw error;
			if (cell.section && PASSIVE.has(cell.section.name)) continue;
			fail(
				'EDIT_UNSUPPORTED_DEPENDENCY',
				`The stencil shape computes ${cell.names[0]} with a formula this editor cannot evaluate.`,
			);
		}
		let previous: number | undefined;
		try {
			previous = cached(cell).value;
		} catch {
			previous = undefined;
		}
		if (
			previous === undefined ||
			Math.abs(previous - value) > 1e-12 * Math.max(1, Math.abs(previous), Math.abs(value))
		)
			writes.push({ sheet: scope.owner(cell), cell, value, length });
	}
	return { writes, pinned };
}

/** Whether a cell's effective formula is one this editor may replace with a local value. */
export function assertOverridable(cell: InstanceCell | undefined, what: string): void {
	if (!cell) return;
	const node = effectiveNode(cell);
	if (node?.hasAttribute('E')) fail('UNSUPPORTED_INSTANCE_EDIT', `${what} has an error value.`);
	const source = effectiveFormula(cell);
	if (!source) return;
	let guarded: boolean;
	try {
		guarded = analyzeVisioFormula(source).guarded;
	} catch {
		guarded = /\bGUARD\s*\(/i.test(source);
	}
	if (guarded) fail('EDIT_PROTECTED_CELL', `${what} is protected by the stencil shape.`);
}
