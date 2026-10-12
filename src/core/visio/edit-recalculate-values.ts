import { attribute } from './sheet';
import { fail } from './package-common';
import { deferTextSize, textSizeFormula } from './edit-text-size-formula';
import {
	analyzeVisioFormula,
	evaluateVisioFormula,
	visioFormulaCachedValue,
	type VisioFormulaValue,
} from './formula';
import {
	key,
	bound,
	type IndexedCell,
	type VisioRecalculationOptions,
} from './edit-recalculate-index';

/** Read-only bounded evaluation reused by cache recalculation and transform-source admission. */
export function createVisioCellEvaluator(
	cells: ReadonlyMap<string, IndexedCell>,
	options: VisioRecalculationOptions = {},
	verifyCaches = false,
): (id: string) => VisioFormulaValue {
	const active = new Set<string>(),
		values = new Map<string, VisioFormulaValue>();
	let steps = bound(options.maxSteps, 100_000);
	const maxDepth = bound(options.maxDepth, 64);
	const evaluate = (id: string): VisioFormulaValue => {
		options.check?.();
		if (--steps < 0)
			fail('LIMIT_FORMULA_STEPS', 'ShapeSheet dependency evaluation limit exceeded.');
		const cached = values.get(id);
		if (cached) return cached;
		if (active.has(id)) fail('EDIT_FORMULA_CYCLE', 'Affected ShapeSheet dependency cycle.');
		if (active.size >= maxDepth)
			fail('LIMIT_FORMULA_DEPTH', 'ShapeSheet dependency depth limit exceeded.');
		const item = cells.get(id);
		if (
			!item ||
			(item.unsafe &&
				(!item.node ||
					(!options.masterMovePins?.has(item.node) && !options.groupRotationCells?.has(item.node))))
		)
			fail(
				'EDIT_UNSUPPORTED_DEPENDENCY',
				'Affected formula references missing, inherited or grouped cells.',
			);
		if (item.node?.hasAttribute('E'))
			fail('EDIT_FORMULA_ERROR', 'Affected ShapeSheet cell has an error cache.');
		active.add(id);
		let result: VisioFormulaValue;
		const analysis = item.formula ? analyzeVisioFormula(item.formula) : undefined;
		if (item.formula && item.node && analysis!.unsupportedFunctions.length) {
			if (!textSizeFormula(item.formula))
				fail('EDIT_UNSUPPORTED_FORMULA', 'Affected formula uses unsupported functions.');
			// A size measured from the shape's text: the cached value stands in until the text is
			// measured after the edit (edit-text-size.ts), which also refreshes what follows from it.
			deferTextSize(item.node, item.shapeId);
			result = visioFormulaCachedValue(attribute(item.node, 'V') ?? '', attribute(item.node, 'U'));
		} else if (item.formula) {
			if (analysis!.unsupportedFunctions.length)
				fail('EDIT_UNSUPPORTED_FORMULA', 'Affected formula uses unsupported functions.');
			result = evaluateVisioFormula(
				item.formula,
				(ref) =>
					evaluate(
						key({ pageId: item.pageId, shapeId: ref.shapeId ?? item.shapeId, cell: ref.cell }),
					),
				{
					...options.pageContext?.get(item.pageId),
					onStep: () => {
						if (--steps < 0)
							fail('LIMIT_FORMULA_STEPS', 'ShapeSheet dependency evaluation limit exceeded.');
					},
				},
			);
		} else
			result = visioFormulaCachedValue(
				attribute(item.node, 'V') ?? '',
				attribute(item.node, 'U') ??
					(item.unit === 'length' ? 'DL' : item.unit === 'angle' ? 'DA' : undefined),
			);
		if (result.unit === 'scalar' && item.unit !== 'scalar') result = { ...result, unit: item.unit };
		const declared = attribute(item.node, 'U');
		const expected = declared ? visioFormulaCachedValue('0', declared).unit : item.unit;
		if (result.unit !== expected)
			fail('EDIT_FORMULA_UNIT', 'Affected formula cache has incompatible units.');
		if (!Number.isFinite(result.value) || Math.abs(result.value) > 1e9)
			fail('EDIT_FORMULA_VALUE', 'Affected formula cache exceeds supported magnitude.');
		if (verifyCaches && item.node) {
			const cachedValue = visioFormulaCachedValue(attribute(item.node, 'V') ?? '', declared);
			if (Math.abs(cachedValue.value - result.value) > 1e-10 * Math.max(1, Math.abs(result.value)))
				fail('EDIT_FORMULA_CACHE', 'Source formula and numeric cache disagree.');
		}
		active.delete(id);
		values.set(id, result);
		return result;
	};
	return evaluate;
}
