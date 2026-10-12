import { rootThemeSheet } from './theme-root';
import { styleSheet, type StyleContext } from './style-inheritance';
import { metadata } from './metadata';
import { shapeMetadata, type VisioMetadataBudget } from './shape-metadata';
import { visioShapeStructure } from './shape-structure';
import { shapeLayers, type LayerBudget } from './layers';
import { layerPaintSheet } from './layer-paint';
import type { VisioLayer, VisioShape } from './model';
import { shapeTransformDetails, geometryPaths } from './geometry';
import { shapeConnections } from './shape-connections';
import { VisioPackageError } from './package';
import { shapeStyle, shapeText, type Resources } from './style';
import {
	emptySheet,
	mergeSheets,
	number,
	reportCachedErrors,
	type RawShape,
	type Report,
} from './sheet';

export interface ShapeContext extends StyleContext {
	metadataBudget: VisioMetadataBudget;
	layerBudget: LayerBudget;
	masters: Map<string, RawShape[]>;
	layers: ReadonlyMap<string, VisioLayer>;
	defaultStyles: Map<string, string>;
	resources: Resources;
	maxShapes: number;
	maxShapeDepth: number;
	shapeCount: number;
	consumeExpansion: () => void;
	consumeGeometry: () => void;
	consumeCurveWork: (units: number) => void;
	consumeText: (length: number) => void;
	consumeParagraph: () => void;
}
function mergeShape(base: RawShape, local: RawShape, context: ShapeContext): RawShape {
	context.consumeExpansion();
	const inherited: RawShape[] = [];
	const used = new Set<RawShape>();
	const replacements = new Map<string, RawShape>();
	for (const candidate of local.children) {
		const masterShape = candidate.attributes.get('MasterShape');
		if (
			!candidate.attributes.has('Master') &&
			masterShape !== undefined &&
			!replacements.has(masterShape)
		)
			replacements.set(masterShape, candidate);
	}
	for (const original of base.children) {
		const replacement = replacements.get(original.id);
		if (replacement) {
			used.add(replacement);
			if (!replacement.deleted) inherited.push(mergeShape(original, replacement, context));
		} else inherited.push(cloneInherited(original, local.id, context));
	}
	inherited.push(...local.children.filter((shape) => !used.has(shape) && !shape.deleted));
	const result: RawShape = {
		...base,
		...local,
		...mergeSheets(base, local),
		attributes: new Map([...base.attributes, ...local.attributes]),
		...((local.text ?? base.text) ? { text: local.text ?? base.text } : {}),
		children: inherited,
		foreign: local.foreign || base.foreign,
	};
	if (local.foreign && !local.image) delete result.image;
	if (local.foreign && !local.foreignVector) delete result.foreignVector;
	return result;
}
function cloneInherited(shape: RawShape, parentId: string, context: ShapeContext): RawShape {
	context.consumeExpansion();
	const id = metadata(`${parentId}:master:${shape.id}`, 1024, 'Inherited shape ID');
	return {
		...shape,
		id,
		children: shape.children.map((child) => cloneInherited(child, id, context)),
	};
}
export function normalizeShapes(
	raw: RawShape[],
	context: ShapeContext,
	depth = 0,
	masterStack: readonly string[] = [],
): VisioShape[] {
	if (depth > context.maxShapeDepth)
		throw new VisioPackageError('SHAPE_DEPTH_LIMIT', 'Shape nesting depth limit exceeded.');
	return raw
		.filter((shape) => !shape.deleted)
		.map((original) => {
			context.checkTime();
			if (++context.shapeCount > context.maxShapes)
				throw new VisioPackageError('SHAPE_LIMIT', 'Shape count limit exceeded.');
			const report: Report = (code, message, extra) =>
				context.report(code, message, { ...extra, shapeId: original.id });
			let shape = original;
			const masterId = original.attributes.get('Master');
			let stack = masterStack;
			if (masterId !== undefined) {
				const master = context.masters.get(masterId);
				if (masterStack.includes(masterId))
					report(
						'master-inheritance-cycle',
						`Master ${masterId} has cyclic inheritance; that inheritance was omitted.`,
					);
				else if (master) {
					stack = [...masterStack, masterId];
					const base = master[0];
					if (base && master.length === 1) {
						if (base.attributes.has('Master'))
							report(
								'unsupported-master-chain',
								'A master root inherits another master; only its locally saved properties are used.',
							);
						shape = mergeShape(base, original, context);
						if (
							['Width', 'Height'].some(
								(key) =>
									original.cells.has(key) &&
									number(original.cells, key, 0) !== number(base.cells, key, 0),
							) &&
							[...base.sections.values()].some(
								(section) =>
									section.name === 'Geometry' &&
									[...section.rows.values()].some((row) => !row.type.startsWith('Rel')),
							)
						)
							report(
								'master-resize-cached-values',
								'Resized master geometry uses inherited cached absolute values; formulas are not recalculated.',
							);
					} else
						shape = mergeShape(
							{
								...emptySheet(),
								id: original.id,
								attributes: new Map(),
								children: master,
								foreign: false,
								deleted: false,
							},
							original,
							context,
						);
				} else report('missing-master', `Master ${masterId} could not be resolved.`);
			}
			let sheet = emptySheet();
			for (const category of ['LineStyle', 'FillStyle', 'TextStyle']) {
				const id = shape.attributes.get(category) ?? context.defaultStyles.get(category);
				if (id !== undefined) sheet = mergeSheets(sheet, styleSheet(id, category, context));
			}
			sheet = mergeSheets(sheet, shape);
			reportCachedErrors(sheet, report);
			sheet = rootThemeSheet(sheet, context.resources, report);
			const oneD =
				number(sheet.cells, 'OneD', 0, report) !== 0 ||
				(sheet.cells.has('BeginX') && sheet.cells.has('EndX'));
			const beginX = number(sheet.cells, 'BeginX', 0, report),
				beginY = number(sheet.cells, 'BeginY', 0, report);
			const endX = number(sheet.cells, 'EndX', beginX + 1, report),
				endY = number(sheet.cells, 'EndY', beginY, report);
			const width = Math.max(
				0,
				number(sheet.cells, 'Width', oneD ? Math.hypot(endX - beginX, endY - beginY) : 1, report),
			);
			const height = Math.max(0, number(sheet.cells, 'Height', oneD ? 0 : 1, report));
			if (oneD && sheet.cells.has('BeginX') && !sheet.cells.has('PinX')) {
				sheet.cells.set('PinX', { value: String((beginX + endX) / 2) });
				sheet.cells.set('PinY', { value: String((beginY + endY) / 2) });
				if (!sheet.cells.has('Angle'))
					sheet.cells.set('Angle', { value: String(Math.atan2(endY - beginY, endX - beginX)) });
			}
			const type = shape.attributes.get('Type');
			const mode =
				(type === 'Group' || shape.children.length) && sheet.cells.has('DisplayMode')
					? number(sheet.cells, 'DisplayMode', NaN, report)
					: undefined;
			const groupDisplayMode = mode === 0 || mode === 1 || mode === 2 ? mode : undefined;
			if (mode !== undefined && groupDisplayMode === undefined)
				report('invalid-group-display-mode', 'Invalid cached group display mode was ignored.');
			if ((shape.foreign || type === 'Foreign') && !shape.image && !shape.foreignVector)
				report(
					'unsupported-foreign-object',
					'This foreign object is not a supported embedded image or bounded vector and is not rendered.',
				);
			const transformDetails = shapeTransformDetails(sheet.cells, width, height, report);
			if (type === 'Guide') report('hidden-guide', 'Guide shapes are retained but hidden.');
			if ((shape.image || shape.foreignVector) && sheet.cells.get('ClippingPath')?.value)
				report(
					'unsupported-image-clipping',
					'Arbitrary image clipping paths are not applied; only the shape frame is used.',
				);
			const membership = shapeLayers(sheet, context.layers, report, context.layerBudget);
			const paintSheet = layerPaintSheet(sheet, membership.layerIds, context.layers);
			if (paintSheet !== sheet && (shape.image || shape.foreignVector))
				report(
					'unverified-layer-foreign-paint',
					'Colored-layer rendering of embedded images and foreign vectors has not been verified against Visio.',
				);
			const textBackdrop = sheet.cells.get('TextBkgnd')?.value;
			if (
				paintSheet !== sheet &&
				(type === 'Group' ||
					shape.children.length ||
					(textBackdrop !== undefined && textBackdrop !== '0' && textBackdrop !== '255'))
			)
				report(
					'unverified-layer-group-text-paint',
					'Colored-layer group inheritance and text backgrounds have not been verified against Visio.',
				);
			const cachedNoShow = number(sheet.cells, 'NoShow', sheet.cells.has('NoShow') ? NaN : 0);
			const nonPrinting = number(sheet.cells, 'NonPrinting', NaN);
			const geometry = geometryPaths(
				sheet,
				width,
				height,
				report,
				context.consumeGeometry,
				context.consumeCurveWork,
			);
			if (
				!geometry.length &&
				oneD &&
				![...sheet.sections.values()].some((s) => s.name === 'Geometry')
			)
				geometry.push({ path: `M 0 0 L ${width} 0`, fill: false, stroke: true });
			const hasGeometry = [...sheet.sections.values()].some((s) => s.name === 'Geometry');
			if (
				!geometry.length &&
				!hasGeometry &&
				!shape.foreign &&
				!shape.text &&
				!shape.children.length &&
				!oneD &&
				type !== 'Guide'
			)
				report('missing-geometry', 'Shape has no supported cached geometry.');
			return {
				...shapeMetadata(sheet, report, context.metadataBudget),
				...structureOf(sheet),
				id: shape.id,
				name: shape.attributes.get('Name') ?? shape.attributes.get('NameU') ?? `Shape ${shape.id}`,
				kind:
					shape.foreign || type === 'Foreign'
						? 'foreign'
						: type === 'Group' || shape.children.length
							? 'group'
							: oneD
								? 'connector'
								: 'shape',
				width,
				height,
				...(groupDisplayMode === undefined ? {} : { groupDisplayMode }),
				...transformDetails,
				...shapeConnections(
					sheet,
					original,
					masterId !== undefined,
					transformDetails.transform,
					oneD,
					report,
				),
				geometry,
				style: shapeStyle(paintSheet, context.resources, report, width, height, geometry),
				text: shapeText(
					paintSheet,
					shape.text,
					width,
					height,
					context.resources,
					report,
					context.consumeText,
					context.consumeParagraph,
				),
				hidden:
					membership.hidden || type === 'Guide' || number(sheet.cells, 'NoShow', 0, report) !== 0,
				visibility: {
					layerHidden: membership.hidden,
					guide: type === 'Guide',
					...(Number.isNaN(cachedNoShow) ? {} : { noShow: cachedNoShow !== 0 }),
					layerPrintSummary: membership.printSummary,
					...(Number.isNaN(nonPrinting) ? {} : { nonPrinting: nonPrinting !== 0 }),
				},
				layerIds: membership.layerIds,
				children: normalizeShapes(shape.children, context, depth + 1, stack),
				...(masterId === undefined ? {} : { masterId }),
				...(shape.foreignVector
					? {
							foreignVector: {
								vector: shape.foreignVector,
								opacity: Math.max(
									0,
									Math.min(1, 1 - number(sheet.cells, 'Transparency', 0, report)),
								),
								x: number(sheet.cells, 'ImgOffsetX', 0, report),
								y: number(sheet.cells, 'ImgOffsetY', 0, report),
								width: Math.max(0, number(sheet.cells, 'ImgWidth', width, report)),
								height: Math.max(0, number(sheet.cells, 'ImgHeight', height, report)),
							},
						}
					: {}),
				...(shape.image
					? {
							image: {
								...shape.image,
								opacity: Math.max(
									0,
									Math.min(1, 1 - number(sheet.cells, 'Transparency', 0, report)),
								),
								x: number(sheet.cells, 'ImgOffsetX', 0, report),
								y: number(sheet.cells, 'ImgOffsetY', 0, report),
								width: Math.max(0, number(sheet.cells, 'ImgWidth', width, report)),
								height: Math.max(0, number(sheet.cells, 'ImgHeight', height, report)),
							},
						}
					: {}),
			};
		});
}

function structureOf(sheet: Parameters<typeof visioShapeStructure>[0]) {
	const structure = visioShapeStructure(sheet);
	return structure ? { structure } : {};
}
