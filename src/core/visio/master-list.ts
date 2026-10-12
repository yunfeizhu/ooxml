import type { VisioMaster } from './model';
import { metadata } from './metadata';
import { VisioPackageError } from './package';
import { normalizeShapes, type ShapeContext } from './shapes';
import { attribute, child, number, readSheet, yes, type Cells, type RawShape } from './sheet';

/** What the parser keeps of one `<Master>` element until the shape context exists. */
export interface MasterRecord {
	id: string;
	node: Element;
	shapes: RawShape[];
}

/** Masters listed in the document stencil; more are still usable by the shapes that inherit them. */
export const MAX_LISTED_MASTERS = 500;
/** Preview work for the whole list, apart from the page budgets. */
const PREVIEW_SHAPES = 5_000;
const PREVIEW_GEOMETRY = 50_000;

class PreviewLimit extends Error {}

/**
 * The document stencil: each visible master with its name, its master page size and its shapes
 * drawn alone, for a preview. Previews are best effort and never fail the drawing: a master whose
 * preview is too large or cannot be resolved is listed without shapes. They are resolved without a
 * page, so page theme selections do not apply, and they do not count toward the page limits or
 * the drawing's diagnostics.
 */
export function listVisioMasters(
	records: readonly MasterRecord[],
	context: ShapeContext,
	budgets: Pick<ShapeContext, 'metadataBudget' | 'layerBudget'>,
): VisioMaster[] {
	let shapes = 0,
		geometry = 0;
	const preview: ShapeContext = {
		...context,
		...budgets,
		layers: new Map(),
		report: () => undefined,
		shapeCount: 0,
		maxShapes: PREVIEW_SHAPES,
		consumeExpansion: () => {
			if (++shapes > PREVIEW_SHAPES) throw new PreviewLimit();
		},
		consumeGeometry: () => {
			if (++geometry > PREVIEW_GEOMETRY) throw new PreviewLimit();
		},
		consumeCurveWork: (units) => {
			geometry += units;
			if (geometry > PREVIEW_GEOMETRY) throw new PreviewLimit();
		},
		consumeText: () => undefined,
		consumeParagraph: () => undefined,
	};
	// The transform of Visio's Dynamic connector; the edit proves the rest of the master's form.
	const followsItsEnds = (sheet: Cells) =>
		(
			[
				['PinX', 'guard((beginx+endx)/2)'],
				['PinY', 'guard((beginy+endy)/2)'],
				['Width', 'guard(endx-beginx)'],
				['Height', 'guard(endy-beginy)'],
			] as const
		).every(([name, form]) => sheet.get(name)?.formula?.replace(/\s+/g, '').toLowerCase() === form);
	const result: VisioMaster[] = [];
	for (const record of records) {
		context.checkTime();
		if (result.length >= MAX_LISTED_MASTERS) break;
		if (yes(attribute(record.node, 'Hidden'))) continue;
		const roots = record.shapes.filter((shape) => !shape.deleted);
		const root = roots[0];
		const cells = readSheet(child(record.node, 'PageSheet')).cells;
		let resolved: VisioMaster['shapes'] = [];
		try {
			resolved = normalizeShapes(record.shapes, preview);
		} catch (error) {
			// A runtime limit is the caller's; anything else only costs this master its preview.
			if (error instanceof VisioPackageError && error.code === 'LIMIT_RUNTIME') throw error;
			resolved = [];
		}
		const size = (name: string, fallback: number) => {
			const value = number(cells, name, fallback);
			return Number.isFinite(value) && value > 0 ? value : fallback;
		};
		const name = attribute(record.node, 'Name') ?? attribute(record.node, 'NameU');
		const nameU = attribute(record.node, 'NameU');
		result.push({
			id: record.id,
			name: metadata(name || `Master ${record.id}`, 4096, 'Master name'),
			...(nameU ? { nameU: metadata(nameU, 4096, 'Master name') } : {}),
			width: size('PageWidth', resolved[0]?.width || 1),
			height: size('PageHeight', resolved[0]?.height || 1),
			rootCount: roots.length,
			oneDimensional: !!root && root.cells.has('BeginX') && root.cells.has('EndX'),
			...(root && roots.length === 1 && followsItsEnds(root.cells)
				? { dynamicConnector: true }
				: {}),
			shapes: resolved,
		});
	}
	return result;
}
