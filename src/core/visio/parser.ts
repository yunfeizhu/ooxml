import type { VisioMetafileTreeConverter } from './convert-metafile';
import { connections, indexedPart, related, validateBackgrounds, visioXml } from './parts';
import { prepareImages } from './prepare-images';
import type { VisioImageOptions } from './media';
import { createLayerBudget, indexLayers, pageLayers } from './layers';
import { loadVisioThemes } from './theme';
import { visioPageTheme } from './page-theme';
import type { Resources } from './style';
import { elements } from '../xml/index';
import type { VisioDocument, VisioPage } from './model';
import { diagnosticCollector } from './diagnostics';
import { readVisioAnnotations, readVisioComments, type VisioComment } from './comments';
import { metadata, metadataAttributes } from './metadata';
import { createMetadataBudget, type VisioMetadataOptions } from './shape-metadata';
import { readDataRecordsets, type VisioDataRecordset } from './data-recordsets';
import { VisioPackage, VisioPackageError, type VisioPackageLimits } from './package';
import { normalizeShapes, type ShapeContext } from './shapes';
import { normalizeVisioPageGeometry, visioPageGeometryScale } from './page-scale';
import { readVisioPageSetup } from './page-setup';
import { readVisioPageLayout } from './page-layout';
import { readVisioSnapGlue } from './snap-glue';
import { styleSheet, type StyleRecord } from './style-inheritance';
import {
	attribute,
	child,
	children,
	number,
	readShapes,
	readSheet,
	reportCachedErrors,
	yes,
	type RawShape,
	type Report,
} from './sheet';
import { listVisioMasters, type MasterRecord } from './master-list';
import { readVisioStencilWindows } from './stencil-windows';
import { readVisioFieldProperties } from './text-field-context';
import { visioWallClock } from './text-fields';

export interface ParseVsdxOptions {
	/** Trusted converter package injection. Only supply inside a disposable, externally timed worker. */
	metafileConverter?: VisioMetafileTreeConverter;
	limits?: Partial<VisioPackageLimits>;
	images?: VisioImageOptions;
	metadata?: VisioMetadataOptions;
	maxShapes?: number;
	maxShapeDepth?: number;
	/** Aggregate weighted knot-refinement and curve subdivision work. */
	maxCurveWork?: number;
	maxGeometryCommands?: number;
	maxTextCharacters?: number;
	maxTextRuns?: number;
	maxParagraphs?: number;
	maxDiagnostics?: number;
}
function option(value: number | undefined, fallback: number): number {
	if (value === undefined) return fallback;
	if (!Number.isSafeInteger(value) || value <= 0)
		throw new VisioPackageError('INVALID_LIMIT', 'Parser limits must be positive safe integers.');
	return value;
}
/** Read-only VSDX import. This uses cached ShapeSheet values, not a formula engine. */
export async function parseVsdx(
	input: Uint8Array | ArrayBuffer,
	options: ParseVsdxOptions = {},
): Promise<VisioDocument> {
	const deadline = Date.now() + (options.limits?.maxRuntimeMs ?? 10_000);
	const checkTime = () => {
		if (Date.now() >= deadline)
			throw new VisioPackageError('LIMIT_RUNTIME', 'Visio parsing deadline exceeded.');
	};
	const maxShapes = option(options.maxShapes, 25_000),
		maxShapeDepth = option(options.maxShapeDepth, 64);
	const maxCurveWork = option(options.maxCurveWork, 20_000_000);
	let curveWork = 0;
	const maxGeometry = option(options.maxGeometryCommands, 500_000),
		maxText = option(options.maxTextCharacters, 5_000_000);
	const maxDiagnostics = option(options.maxDiagnostics, 2_000);
	const maxRuns = option(options.maxTextRuns, 100_000),
		maxParagraphs = option(options.maxParagraphs, 50_000);
	const diagnosticState = diagnosticCollector(maxDiagnostics);
	const report = diagnosticState.report;
	const pkg = await VisioPackage.open(input, options.limits);
	const types = await pkg.readXml('[Content_Types].xml', 'Types');
	if (types.namespaceURI !== 'http://schemas.openxmlformats.org/package/2006/content-types')
		throw new VisioPackageError('INVALID_CONTENT_TYPES', 'Invalid content type namespace.');
	const documentPart = await related(pkg, '', 'document');
	if (!documentPart)
		throw new VisioPackageError('INVALID_DOCUMENT', 'Missing Visio document part.');
	const documentType = elements(types)
		.find(
			(node) => node.localName === 'Override' && attribute(node, 'PartName') === `/${documentPart}`,
		)
		?.getAttribute('ContentType');
	if (documentType !== 'application/vnd.ms-visio.drawing.main+xml')
		throw new VisioPackageError(
			'UNSUPPORTED_FORMAT',
			'Only VSDX drawing packages are supported; VSD, VDX, VSDM and templates are not supported.',
		);
	// Validate every relationship part, including unused ones; never dereference external URLs.
	for (const path of pkg.paths()) {
		if (path !== '_rels/.rels' && !/(^|\/)_rels\/[^/]+\.rels$/.test(path)) continue;
		const source =
			path === '_rels/.rels' ? '' : path.replace(/(^|\/)\_rels\/([^/]+)\.rels$/, '$1$2');
		for (const rel of (await pkg.relationships(source)).values()) {
			if (rel.mode === 'External')
				report(
					'external-resource-ignored',
					'External relationships are retained only as metadata and are never loaded.',
					{ part: path },
				);
		}
	}
	const documentRoot = await visioXml(pkg, documentPart, 'VisioDocument');
	const resources: Resources = {
		colors: new Map<string, string>(),
		fonts: new Map<string, string>(),
		themes: await loadVisioThemes(pkg, documentPart, report),
	};
	for (const color of children(child(documentRoot, 'Colors'), 'ColorEntry'))
		resources.colors.set(attribute(color, 'IX') ?? '', attribute(color, 'RGB') ?? '');
	const faceNames = children(child(documentRoot, 'FaceNames'), 'FaceName');
	if (faceNames.length > 10000)
		throw new VisioPackageError(
			'METADATA_LIMIT',
			'Document font count exceeds its metadata limit.',
		);
	let fontCharacters = 0;
	faceNames.forEach((font, index) => {
		checkTime();
		fontCharacters += (attribute(font, 'Name') ?? attribute(font, 'NameU') ?? 'Arial').length;
		if (fontCharacters > 1_000_000)
			throw new VisioPackageError(
				'METADATA_LIMIT',
				'Document fonts exceed aggregate metadata limits.',
			);
		resources.fonts.set(
			metadata(attribute(font, 'ID') ?? String(index), 256, 'Font ID'),
			metadata(attribute(font, 'Name') ?? attribute(font, 'NameU') ?? 'Arial', 1024, 'Font name'),
		);
	});
	const styles = new Map<string, StyleRecord>();
	for (const style of children(child(documentRoot, 'StyleSheets'), 'StyleSheet'))
		styles.set(metadata(attribute(style, 'ID') ?? '', 256, 'Style ID'), {
			sheet: readSheet(style),
			attributes: metadataAttributes(style),
		});
	const rootStyle = styles.get('0');
	if (rootStyle?.attributes.get('NameU') === 'No Style') resources.rootSheet = rootStyle.sheet;
	const masters = new Map<string, RawShape[]>();
	const masterRecords: MasterRecord[] = [];
	const mastersPart = await related(pkg, documentPart, 'masters', false);
	if (mastersPart) {
		for (const master of children(await visioXml(pkg, mastersPart, 'Masters'), 'Master')) {
			const part = await indexedPart(pkg, mastersPart, master, 'master');
			const id = metadata(attribute(master, 'ID') ?? '', 256, 'Master ID');
			if (!id || masters.has(id))
				throw new VisioPackageError('INVALID_MASTER_ID', 'Master IDs must be present and unique.');
			const masterShapes = readShapes(await visioXml(pkg, part, 'MasterContents'));
			await prepareImages(
				masterShapes,
				pkg,
				part,
				report,
				options.images,
				options.metafileConverter,
			);
			masters.set(id, masterShapes);
			masterRecords.push({ id, node: master, shapes: masterShapes });
		}
	}
	let geometryCount = 0,
		textCount = 0,
		expansionCount = 0,
		textRuns = 0,
		paragraphCount = 0;
	const context: ShapeContext = {
		metadataBudget: createMetadataBudget(options.metadata),
		layerBudget: createLayerBudget(),
		masters,
		layers: new Map(),
		styles,
		styleCache: new Map(),
		defaultStyles: new Map(
			['LineStyle', 'FillStyle', 'TextStyle'].flatMap((category) => {
				const id =
					attribute(child(documentRoot, 'DocumentSheet'), category) ??
					(styles.has('0') ? '0' : undefined);
				return id === undefined ? [] : [[category, id]];
			}),
		),
		resources,
		report,
		maxShapes,
		maxShapeDepth,
		shapeCount: 0,
		checkTime,
		consumeExpansion: () => {
			checkTime();
			if (++expansionCount > maxShapes)
				throw new VisioPackageError('SHAPE_LIMIT', 'Inherited shape expansion limit exceeded.');
		},
		consumeCurveWork: (units) => {
			checkTime();
			curveWork += units;
			if (curveWork > maxCurveWork)
				throw new VisioPackageError(
					'CURVE_WORK_LIMIT',
					'Curve refinement/subdivision work limit exceeded.',
				);
		},
		consumeGeometry: () => {
			checkTime();
			if (++geometryCount > maxGeometry)
				throw new VisioPackageError('GEOMETRY_LIMIT', 'Geometry command limit exceeded.');
		},
		consumeParagraph: () => {
			checkTime();
			if (++paragraphCount > maxParagraphs)
				throw new VisioPackageError('PARAGRAPH_LIMIT', 'Paragraph count limit exceeded.');
		},
		consumeText: (length) => {
			checkTime();
			if (++textRuns > maxRuns)
				throw new VisioPackageError('TEXT_RUN_LIMIT', 'Text run count limit exceeded.');
			textCount += length;
			if (textCount > maxText)
				throw new VisioPackageError('TEXT_LIMIT', 'Text character limit exceeded.');
		},
	};
	const documentMasters = listVisioMasters(masterRecords, context, {
		metadataBudget: createMetadataBudget(options.metadata),
		layerBudget: createLayerBudget(),
	});
	const pagesPart = await related(pkg, documentPart, 'pages');
	if (!pagesPart) throw new VisioPackageError('INVALID_DOCUMENT', 'Missing Visio pages part.');
	const pages: VisioPage[] = [],
		pageIds = new Set<string>();
	const comments: VisioComment[] = [];
	const pageNodes = children(await visioXml(pkg, pagesPart, 'Pages'), 'Page');
	const foreground = pageNodes.filter((page) => !yes(attribute(page, 'Background')));
	const fieldProperties = await readVisioFieldProperties(pkg);
	const now = visioWallClock(new Date());
	for (const page of pageNodes) {
		const id = metadata(attribute(page, 'ID') ?? '', 256, 'Page ID');
		if (!id || pageIds.has(id))
			throw new VisioPackageError('INVALID_PAGE_ID', 'Page IDs must be present and unique.');
		pageIds.add(id);
		const part = await indexedPart(pkg, pagesPart, page, 'page');
		const root = await visioXml(pkg, part, 'PageContents');
		const localReport: Report = (code, message, extra) =>
			report(code, message, { part, pageId: id, ...extra });
		context.report = localReport;
		const sheet = readSheet(child(page, 'PageSheet'));
		reportCachedErrors(sheet, localReport);
		// PageSheet theme selectors also inherit its explicitly referenced styles.
		const pageCells = new Map<string, { value?: string; formula?: string }>();
		for (const category of ['LineStyle', 'FillStyle', 'TextStyle']) {
			const styleId = attribute(child(page, 'PageSheet'), category);
			if (styleId === undefined) continue;
			for (const [name, cell] of styleSheet(styleId, category, context).cells)
				if (
					/^(ColorSchemeIndex|EffectSchemeIndex|ConnectorSchemeIndex|FontSchemeIndex|VariationColorIndex|VariationStyleIndex)$/.test(
						name,
					)
				)
					pageCells.set(name, cell);
		}
		resources.pageCells = new Map([...pageCells, ...sheet.cells]);
		const theme = visioPageTheme(resources.themes, resources.pageCells);
		comments.push(...readVisioAnnotations(sheet, id));
		const pageNumber = foreground.indexOf(page) + 1;
		resources.fieldContext = {
			pageName: attribute(page, 'Name') ?? attribute(page, 'NameU') ?? `Page ${id}`,
			...(pageNumber ? { pageNumber } : {}),
			pageCount: foreground.length,
			properties: fieldProperties,
			now,
		};
		const layers = pageLayers(sheet, resources, localReport);
		context.layers = indexLayers(layers);
		const drawingToPageScale = visioPageGeometryScale(sheet.cells, localReport);
		const width = number(sheet.cells, 'PageWidth', 8.5, localReport) * drawingToPageScale,
			height = number(sheet.cells, 'PageHeight', 11, localReport) * drawingToPageScale;
		if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
			throw new VisioPackageError('INVALID_PAGE_SIZE', 'Page dimensions must be positive.');
		const backgroundPageId = attribute(page, 'BackPage');
		if (backgroundPageId !== undefined) metadata(backgroundPageId, 256, 'Background page ID');
		const rawShapes = readShapes(root);
		await prepareImages(
			rawShapes,
			pkg,
			part,
			localReport,
			options.images,
			options.metafileConverter,
		);
		const shapes = normalizeShapes(rawShapes, context);
		normalizeVisioPageGeometry(shapes, drawingToPageScale, checkTime);
		const seen = new Set<string>();
		const visit = (items: typeof shapes): void => {
			for (const shape of items) {
				if (!shape.id || seen.has(shape.id))
					throw new VisioPackageError(
						'INVALID_SHAPE_ID',
						'Shape IDs must be present and unique on a page.',
					);
				seen.add(shape.id);
				visit(shape.children);
			}
		};
		visit(shapes);
		const connectors = connections(root, localReport);
		const pageModes: Pick<VisioPage, 'drawingSizeType' | 'drawingResizeType'> = {};
		for (const [name, key] of [
			['DrawingSizeType', 'drawingSizeType'],
			['DrawingResizeType', 'drawingResizeType'],
		] as const) {
			const source = sheet.cells.get(name);
			if (
				!source ||
				source.error !== undefined ||
				source.formula === 'Inh' ||
				(source.unit !== undefined && !['NUM', 'BOOL'].includes(source.unit))
			)
				continue;
			const value = number(sheet.cells, name, Number.NaN, localReport);
			if (Number.isSafeInteger(value) && value >= 0 && value <= 255) pageModes[key] = value;
		}
		const pageSetup = readVisioPageSetup(sheet.cells);
		const layout = readVisioPageLayout(sheet.cells);
		for (const connection of connectors)
			if (!seen.has(connection.fromShapeId) || !seen.has(connection.toShapeId))
				localReport('dangling-connection', 'A connection references a missing shape.');
		pages.push({
			id,
			...pageModes,
			...(drawingToPageScale === 1 ? {} : { drawingToPageScale }),
			...(pageSetup ? { pageSetup } : {}),
			...(layout ? { layout } : {}),
			name: metadata(
				attribute(page, 'Name') ?? attribute(page, 'NameU') ?? `Page ${id}`,
				4096,
				'Page name',
			),
			width,
			height,
			isBackground: yes(attribute(page, 'Background')),
			...(backgroundPageId && backgroundPageId !== '-1' ? { backgroundPageId } : {}),
			shapes,
			connectors,
			layers,
			...(theme ? { theme } : {}),
		});
	}
	checkTime();
	validateBackgrounds(pages, report);
	try {
		comments.push(...(await readVisioComments(pkg, documentPart, report)));
	} catch (error) {
		if (!(error instanceof VisioPackageError) || error.code === 'LIMIT_RUNTIME') throw error;
		report('invalid-comments', 'The comments part could not be read; comments are not shown.');
	}
	let dataRecordsets: VisioDataRecordset[] = [];
	try {
		dataRecordsets = await readDataRecordsets(pkg, documentPart, checkTime);
	} catch (error) {
		if (error instanceof VisioPackageError && error.code === 'LIMIT_RUNTIME') throw error;
		report(
			'unsupported-data-recordsets',
			`Saved external data could not be read and is preserved unchanged: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	const stencils = await readVisioStencilWindows(pkg, documentPart);
	report(
		'cached-values-only',
		'ShapeSheet formulas, automatic connector routing, and external data are not evaluated; saved cached values and supported theme records are used.',
		{ severity: 'info' },
	);
	const snapGlue = readVisioSnapGlue(documentRoot);
	return {
		format: 'vsdx',
		...(snapGlue ? { snapGlue } : {}),
		pages,
		...(documentMasters.length ? { masters: documentMasters } : {}),
		...(stencils.length ? { stencils } : {}),
		diagnostics: diagnosticState.finish(),
		...(dataRecordsets.length ? { dataRecordsets } : {}),
		fontFamilies: [...new Set(resources.fonts.values())],
		...(comments.length ? { comments } : {}),
	};
}

/** Backgrounds first, selected page last. Missing pages and cycles are safe. */
export function getVisioPageLayers(document: VisioDocument, pageId: string): VisioPage[] {
	const result: VisioPage[] = [],
		seen = new Set<string>();
	const pages = new Map(document.pages.map((page) => [page.id, page]));
	let current = pages.get(pageId);
	while (current && !seen.has(current.id)) {
		seen.add(current.id);
		result.push(current);
		current =
			current.backgroundPageId === undefined ? undefined : pages.get(current.backgroundPageId);
	}
	return result.reverse();
}
