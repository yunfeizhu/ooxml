import { textSizeFormula } from './edit-text-size-formula';
import { isLocalBitmapShape } from './edit-foreign-bitmap';
import { children, attribute } from './sheet';
import { fail } from './package-common';
import { parseVisioFormula, analyzeVisioFormula, type VisioFormulaValue } from './formula';
import { executableCellFormula, inertDoubleClickFormula } from './cell-formula';
import { isNativeGlueCell } from './edit-connector-glue';

export interface VisioCellKey {
	pageId: string;
	shapeId: string;
	cell: string;
}
export interface VisioRecalculationOptions {
	pageContext?: ReadonlyMap<string, { pageNumber: number; pageCount: number }>;
	maxCells?: number;
	maxAffectedCells?: number;
	maxSteps?: number;
	maxDepth?: number;
	check?: () => void;
	/** Internal post-proof authorization of explicit local master move leaves only. */
	masterMovePins?: ReadonlySet<Element>;
	/** Internal authorization after proving an unglued local straight-line edit. */
	lineEditShapes?: ReadonlySet<Element>;
	/** Internal authorization of proven owned dynamic-glue connectors and their 2D targets. */
	glueShapes?: ReadonlySet<Element>;
	/** Internal authorization of the proven local parent-group Angle leaf only. */
	groupRotationCells?: ReadonlySet<Element>;
}
export interface IndexedCell extends VisioCellKey {
	node?: Element;
	formula?: ReturnType<typeof parseVisioFormula>;
	dependencies: string[];
	unsafe: boolean;
	unit: VisioFormulaValue['unit'];
}
export const key = (cell: VisioCellKey) =>
	JSON.stringify([cell.pageId, cell.shapeId, cell.cell.toLowerCase()]);
export function bound(value: number | undefined, fallback: number): number {
	const result = value ?? fallback;
	if (!Number.isSafeInteger(result) || result < 1)
		fail('INVALID_LIMITS', 'Invalid recalculation limit.');
	return result;
}
function cellUnit(name: string, relative: boolean): VisioFormulaValue['unit'] {
	if (/^(Angle|TxtAngle)$/i.test(name)) return 'angle';
	if (
		/^(Width|Height|PinX|PinY|LocPinX|LocPinY|BeginX|BeginY|EndX|EndY|TxtPinX|TxtPinY|TxtWidth|TxtHeight|TxtLocPinX|TxtLocPinY|LineWeight|Rounding|ImgOffsetX|ImgOffsetY|ImgWidth|ImgHeight)$/i.test(
			name,
		)
	)
		return 'length';
	return !relative && /\.[XY]\d+$/i.test(name) ? 'length' : 'scalar';
}
/** All local sheets participate, including sections, named rows, and static Sheet.ID references. */
export function indexCells(
	roots: ReadonlyMap<string, Element>,
	options: VisioRecalculationOptions,
) {
	const cells = new Map<string, IndexedCell>();
	const maxCells = bound(options.maxCells, 100_000);
	const add = (item: IndexedCell) => {
		const id = key(item);
		if (cells.has(id)) fail('EDIT_AMBIGUOUS_CELL', 'Duplicate local ShapeSheet cell.');
		cells.set(id, item);
		if (cells.size > maxCells) fail('LIMIT_FORMULA_CELLS', 'ShapeSheet cell limit exceeded.');
	};
	for (const [pageId, root] of roots) {
		if (root.hasAttribute('F'))
			fail('EDIT_UNKNOWN_DEPENDENCY', 'Page root formula has unknown dependency scope.');
		const indexedNodes = new Set<Element>();
		const connected = new Set<string>(),
			connectors = new Set<string>();
		for (const container of children(root, 'Connects'))
			for (const connection of children(container, 'Connect')) {
				for (const attr of ['FromSheet', 'ToSheet']) {
					const id = attribute(connection, attr);
					if (id) connected.add(id);
				}
				const from = attribute(connection, 'FromSheet');
				if (from) connectors.add(from);
			}
		const sheets: { node: Element; shapeId: string; unsafe: boolean }[] = [];
		const ids = new Set<string>();
		const visit = (parent: Element, inherited: boolean, nested: boolean) => {
			for (const container of children(parent, 'Shapes'))
				for (const node of children(container, 'Shape')) {
					options.check?.();
					const shapeId = attribute(node, 'ID');
					if (!shapeId || ids.has(shapeId)) fail('INVALID_SHAPE_ID', 'Shape IDs must be unique.');
					ids.add(shapeId);
					const unsafe =
						inherited ||
						nested ||
						node.hasAttribute('Master') ||
						node.hasAttribute('MasterShape') ||
						attribute(node, 'Type') === 'Group' ||
						(!isLocalBitmapShape(node) &&
							((attribute(node, 'Type') !== undefined && attribute(node, 'Type') !== 'Shape') ||
								children(node, 'ForeignData').length > 0 ||
								children(node, 'Rel').length > 0)) ||
						(connected.has(shapeId) && !options.glueShapes?.has(node)) ||
						(!options.lineEditShapes?.has(node) &&
							children(node, 'Cell').some(
								(cell) =>
									/^(BeginX|BeginY|EndX|EndY)$/i.test(attribute(cell, 'N') ?? '') ||
									(attribute(cell, 'N')?.toLowerCase() === 'oned' &&
										(attribute(cell, 'V') !== '0' ||
											!!executableCellFormula(attribute(cell, 'F')) ||
											attribute(cell, 'F') === 'Inh')),
							)) ||
						children(node, 'Shapes').length > 0 ||
						['1', 'true'].includes(attribute(node, 'Del') ?? '');
					sheets.push({ node, shapeId, unsafe });
					visit(node, unsafe, true);
				}
		};
		visit(root, false, false);
		for (const node of children(root, 'PageSheet'))
			sheets.push({ node, shapeId: '', unsafe: false });
		for (const sheet of sheets) {
			const addNode = (
				node: Element,
				cell: string,
				relative = false,
				deleted = false,
				glue = false,
			) => {
				indexedNodes.add(node);
				const item: IndexedCell = {
					pageId,
					shapeId: sheet.shapeId,
					cell,
					node,
					unsafe: sheet.unsafe || deleted,
					dependencies: [],
					unit: cellUnit(cell, relative),
				};
				const source = attribute(node, 'F');
				// Native dynamic glue is re-evaluated by Visio; the editor reads and writes its caches.
				if (
					executableCellFormula(source) &&
					!inertDoubleClickFormula(cell, source!) &&
					!(glue && isNativeGlueCell(cell, source!)) &&
					// A trigger only counts events of the sheet it names; an unglued connector keeps one
					// (Visio's freshly dropped connector names its own sheet).
					!(/^(BegTrigger|EndTrigger)$/.test(cell) && isNativeGlueCell(cell, source!))
				) {
					try {
						item.formula = parseVisioFormula(source!);
						// A size measured from the shape's own text reads only the cells it names; the
						// text itself is followed after text edits (edit-text-size.ts).
						const plain = analyzeVisioFormula(item.formula);
						const analysis = (plain.dynamic && textSizeFormula(item.formula)) || plain;
						if (analysis.dynamic)
							fail(
								'EDIT_DYNAMIC_DEPENDENCY',
								'Dynamic ShapeSheet dependencies cannot be safely edited.',
							);
						item.dependencies = analysis.references.map((ref) =>
							key({ pageId, shapeId: ref.shapeId ?? sheet.shapeId, cell: ref.cell }),
						);
					} catch (error) {
						fail(
							'EDIT_UNKNOWN_DEPENDENCY',
							`Cannot prove ShapeSheet dependency closure: ${error instanceof Error ? error.message : 'invalid formula'}`,
						);
					}
				}
				if (source === 'Inh') item.unsafe = true;
				add(item);
			};
			const glue = connectors.has(sheet.shapeId);
			for (const node of children(sheet.node, 'Cell'))
				addNode(node, attribute(node, 'N') ?? '', false, false, glue);
			for (const section of children(sheet.node, 'Section')) {
				const name = attribute(section, 'N') ?? '';
				const prefix =
					name === 'Geometry' ? `Geometry${Number(attribute(section, 'IX') ?? '0') + 1}` : name;
				const deleted = ['1', 'true'].includes(attribute(section, 'Del') ?? '');
				for (const node of children(section, 'Cell'))
					addNode(node, `${prefix}.${attribute(node, 'N') ?? ''}`, false, deleted);
				for (const row of children(section, 'Row')) {
					const rowName = attribute(row, 'N');
					const ix = attribute(row, 'IX') ?? '0';
					for (const node of children(row, 'Cell')) {
						const n = attribute(node, 'N') ?? '';
						const rowCell =
							name === 'Geometry' || ['Controls', 'Scratch', 'Connection'].includes(name)
								? `${prefix}.${n}${ix}`
								: n === 'Value' && ['User', 'Prop'].includes(name)
									? `${prefix}.${rowName ?? ix}`
									: `${prefix}.${rowName ?? ix}.${n}`;
						addNode(
							node,
							rowCell,
							(attribute(row, 'T') ?? '').startsWith('Rel'),
							deleted || ['1', 'true'].includes(attribute(row, 'Del') ?? ''),
						);
					}
				}
			}
			if (sheet.shapeId)
				for (const [cell, dimension, scale] of [
					['LocPinX', 'Width', 0.5],
					['LocPinY', 'Height', 0.5],
					['TxtWidth', 'Width', 1],
					['TxtHeight', 'Height', 1],
					['TxtPinX', 'Width', 0.5],
					['TxtPinY', 'Height', 0.5],
					['TxtLocPinX', 'TxtWidth', 0.5],
					['TxtLocPinY', 'TxtHeight', 0.5],
				] as const) {
					const ref = { pageId, shapeId: sheet.shapeId, cell };
					if (!cells.has(key(ref)))
						add({
							...ref,
							unsafe: sheet.unsafe,
							unit: 'length',
							dependencies: [key({ ...ref, cell: dimension })],
							formula: parseVisioFormula(`${dimension}*${scale}`),
						});
				}
		}
		// Formula-bearing markup outside admitted sheet cells has no proven dependency scope.
		for (const node of Array.from(root.getElementsByTagName('*'))) {
			options.check?.();
			if (node.hasAttribute('F') && !indexedNodes.has(node))
				fail(
					'EDIT_UNKNOWN_DEPENDENCY',
					'Formula outside admitted ShapeSheet cells has unknown dependencies.',
				);
		}
	}
	return cells;
}
