import { buildContentTypesXml } from '../opc/content-types';
import { buildRelationshipsXml } from '../opc/relationships';
import { buildXml, parseXml, NS } from '../xml/index';
import { VISIO_NS } from './sheet';
import { setCell } from './edit-geometry-cells';
import { DEFAULTS, fail } from './package-common';
import { writeEditedPackage } from './edit-package';
import { VISIO_STENCIL_FILES, type VisioBuiltInStencilId } from './stencil-windows';

export interface CreateVsdxOptions {
	/** Physical page inches. The initial drawing scale is 1:1. */
	width?: number;
	height?: number;
	/**
	 * Built-in stencils docked in the drawing window, in order, as Visio records the stencils a
	 * template opens. They are written as Stencil windows naming Visio's own stencil files.
	 */
	stencils?: readonly VisioBuiltInStencilId[];
}

function element(parent: Element, name: string, attributes: Record<string, string> = {}): Element {
	const child = parent.ownerDocument!.createElementNS(VISIO_NS, name);
	for (const [key, value] of Object.entries(attributes)) child.setAttribute(key, value);
	parent.appendChild(child);
	return child;
}
function root(name: string): Element {
	const result = parseXml(`<${name} xmlns="${VISIO_NS}"/>`).documentElement;
	result.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
	return result;
}
function cells(parent: Element, values: Record<string, number>): void {
	for (const [name, value] of Object.entries(values)) setCell(parent, name, value);
}

/** Explicit basic drawing defaults, independent of installed templates and themes. */
function documentPart(): Element {
	const document = root('VisioDocument');
	element(document, 'DocumentSettings', {
		TopPage: '0',
		DefaultTextStyle: '0',
		DefaultLineStyle: '0',
		DefaultFillStyle: '0',
	});
	element(element(document, 'FaceNames'), 'FaceName', {
		ID: '0',
		Name: 'Calibri',
		NameU: 'Calibri',
	});
	const style = element(element(document, 'StyleSheets'), 'StyleSheet', {
		ID: '0',
		Name: 'Normal',
		NameU: 'Normal',
		IsCustomName: '1',
		IsCustomNameU: '1',
	});
	cells(style, {
		EnableLineProps: 1,
		EnableFillProps: 1,
		EnableTextProps: 1,
		LineWeight: 0.75 / 72,
		LineColor: 0,
		LinePattern: 1,
		LineCap: 0,
		LineColorTrans: 0,
		BeginArrow: 0,
		EndArrow: 0,
		FillForegnd: 1,
		FillBkgnd: 0,
		FillPattern: 1,
		FillForegndTrans: 0,
		FillBkgndTrans: 0,
		ShdwPattern: 0,
		LeftMargin: 4 / 72,
		RightMargin: 4 / 72,
		TopMargin: 4 / 72,
		BottomMargin: 4 / 72,
		VerticalAlign: 1,
		TextBkgnd: 0,
		TextBkgndTrans: 0,
		DefaultTabStop: 0.5,
	});
	const character = element(element(style, 'Section', { N: 'Character' }), 'Row', { IX: '0' });
	cells(character, { Font: 0, Color: 0, Style: 0, Size: 12 / 72, ColorTrans: 0 });
	const paragraph = element(element(style, 'Section', { N: 'Paragraph' }), 'Row', { IX: '0' });
	cells(paragraph, {
		IndFirst: 0,
		IndLeft: 0,
		IndRight: 0,
		SpLine: -1.2,
		SpBefore: 0,
		SpAfter: 0,
		HorzAlign: 1,
		Bullet: 0,
	});
	element(document, 'DocumentSheet', {
		Name: 'TheDoc',
		NameU: 'TheDoc',
		LineStyle: '0',
		FillStyle: '0',
		TextStyle: '0',
	});
	return document;
}

/** Create an editable single-page VSDX using shared XML/OPC writers and bounded ZIP output. */
export async function createVsdx(options: CreateVsdxOptions = {}): Promise<Uint8Array> {
	const width = options.width ?? 8.5,
		height = options.height ?? 11;
	if (
		![width, height].every(
			(value) => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1e6,
		)
	)
		fail(
			'INVALID_PAGE_SIZE',
			'New drawing dimensions require positive finite inches within limits.',
		);
	const deadline = Date.now() + DEFAULTS.maxRuntimeMs;
	const check = () => {
		if (Date.now() >= deadline) fail('LIMIT_RUNTIME', 'Drawing creation deadline exceeded.');
	};
	const parts = new Map<string, Uint8Array>();
	const put = (path: string, xml: string) => parts.set(path, new TextEncoder().encode(xml));
	const relationships = (entries: readonly (readonly [string, string])[]) =>
		buildRelationshipsXml(
			new Map(
				entries.map(([type, target], index) => [
					`rId${index + 1}`,
					{
						type: `http://schemas.microsoft.com/visio/2010/relationships/${type}`,
						target,
						mode: 'Internal' as const,
					},
				]),
			),
		);
	put(
		'[Content_Types].xml',
		buildContentTypesXml({
			defaults: new Map([
				['rels', 'application/vnd.openxmlformats-package.relationships+xml'],
				['xml', 'application/xml'],
			]),
			overrides: new Map([
				['/visio/document.xml', 'application/vnd.ms-visio.drawing.main+xml'],
				['/visio/pages/pages.xml', 'application/vnd.ms-visio.pages+xml'],
				['/visio/pages/page1.xml', 'application/vnd.ms-visio.page+xml'],
				['/visio/windows.xml', 'application/vnd.ms-visio.windows+xml'],
			]),
		}),
	);
	put('_rels/.rels', relationships([['document', 'visio/document.xml']]));
	put(
		'visio/_rels/document.xml.rels',
		relationships([
			['pages', 'pages/pages.xml'],
			['windows', 'windows.xml'],
		]),
	);
	put('visio/pages/_rels/pages.xml.rels', relationships([['page', 'page1.xml']]));
	put('visio/document.xml', buildXml(documentPart()));
	const pages = root('Pages');
	const page = element(pages, 'Page', { ID: '0', Name: 'Page-1', NameU: 'Page-1' });
	const sheet = element(page, 'PageSheet', { LineStyle: '0', FillStyle: '0', TextStyle: '0' });
	cells(sheet, {
		PageWidth: width,
		PageHeight: height,
		PageScale: 1,
		DrawingScale: 1,
		DrawingScaleType: 0,
		DrawingSizeType: 0,
	});
	element(page, 'Rel').setAttributeNS(NS.r, 'r:id', 'rId1');
	put('visio/pages/pages.xml', buildXml(pages));
	put('visio/pages/page1.xml', buildXml(root('PageContents')));
	// Native Visio requires its windows part even when the page has no shapes.
	const windows = root('Windows');
	element(windows, 'Window', {
		ID: '0',
		WindowType: 'Drawing',
		ContainerType: 'Page',
		Page: '0',
		ViewScale: '-1',
	});
	const stencils = [...new Set(options.stencils ?? [])];
	if (stencils.some((id) => !Object.hasOwn(VISIO_STENCIL_FILES, id)))
		fail('INVALID_EDIT', 'Unknown built-in stencil.');
	stencils.forEach((id, index) => {
		const window = element(windows, 'Window', {
			ID: String(index + 1),
			WindowType: 'Stencil',
			// Docked in the Shapes window; the first one is the stencil that is showing.
			WindowState: index ? '1025' : '67109889',
			Document: VISIO_STENCIL_FILES[id],
			ParentWindow: '0',
		});
		element(window, 'StencilGroup').textContent = '10';
		element(window, 'StencilGroupPos').textContent = String(index + 1);
	});
	put('visio/windows.xml', buildXml(windows));
	return writeEditedPackage(parts, DEFAULTS.maxInputBytes, deadline, check);
}
