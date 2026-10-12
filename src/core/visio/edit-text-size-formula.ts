import { analyzeVisioFormula, parseVisioFormula, type VisioFormulaAst } from './formula';

const MEASURES = new Set(['TEXTWIDTH', 'TEXTHEIGHT']);

/**
 * The analysis of a formula whose only step beyond plain arithmetic is measuring the shape's own
 * text: `TEXTWIDTH(TheText[, maximum])` or `TEXTHEIGHT(TheText, width)`. Such a formula reads the
 * text and the cells it names and nothing else, so it can be computed again after a text edit.
 * `undefined` for every other formula, including one that cannot be parsed.
 */
export function textSizeFormula(
	source: string | VisioFormulaAst,
): ReturnType<typeof analyzeVisioFormula> | undefined {
	try {
		const ast = typeof source === 'string' ? parseVisioFormula(source) : source;
		const analysis = analyzeVisioFormula(ast);
		if (
			!analysis.unsupportedFunctions.length ||
			!analysis.unsupportedFunctions.every((name) => MEASURES.has(name))
		)
			return undefined;
		// analyzeVisioFormula has bounded the tree; every measuring call must name this shape's text.
		const queue: VisioFormulaAst[] = [ast];
		while (queue.length) {
			const node = queue.pop()!;
			if (node.kind === 'unary') queue.push(node.operand);
			if (node.kind === 'binary') queue.push(node.left, node.right);
			if (node.kind !== 'call') continue;
			if (MEASURES.has(node.name)) {
				const [text, ...rest] = node.args;
				if (
					text?.kind !== 'reference' ||
					text.reference.shapeId !== undefined ||
					text.reference.cell.toLowerCase() !== 'thetext' ||
					rest.length !== (node.name === 'TEXTHEIGHT' ? 1 : Math.min(rest.length, 1))
				)
					return undefined;
				queue.push(...rest);
			} else queue.push(...node.args);
		}
		return {
			...analysis,
			dynamic: false,
			references: analysis.references.filter((ref) => ref.cell.toLowerCase() !== 'thetext'),
		};
	} catch {
		return undefined;
	}
}

const deferred = new WeakMap<Element, Set<string>>();
/**
 * Geometry recalculation met a cell of `shapeId` that measures the shape's text. It keeps the
 * cached value for now; the page remembers the shape so its size is measured after the edit.
 * Keyed by the transaction's own copy of the page, so transactions never see each other's.
 */
export function deferTextSize(cell: Element, shapeId: string): void {
	const root = cell.ownerDocument?.documentElement;
	if (!root) return;
	const shapes = deferred.get(root) ?? new Set<string>();
	shapes.add(shapeId);
	deferred.set(root, shapes);
}
/** The shapes remembered for this page copy, forgotten once taken. */
export function takeDeferredTextSizes(root: Element): string[] {
	const shapes = [...(deferred.get(root) ?? [])];
	deferred.delete(root);
	return shapes;
}
