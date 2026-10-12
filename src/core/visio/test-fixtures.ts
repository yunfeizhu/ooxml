import JSZip from 'jszip';

export const ns = 'http://schemas.microsoft.com/office/visio/2012/main';
export const relationshipNamespace = 'http://schemas.openxmlformats.org/package/2006/relationships';
export const relationshipType = 'http://schemas.microsoft.com/visio/2010/relationships/';
export const cell = (name: string, value: string | number, formula = '') =>
	`<Cell N="${name}" V="${value}"${formula ? ` F="${formula}"` : ''}/>`;
export const row = (index: number, type: string, cells: string) =>
	`<Row IX="${index}" T="${type}">${cells}</Row>`;
export const section = (name: string, contents: string, index = 0) =>
	`<Section N="${name}" IX="${index}">${contents}</Section>`;
export const rectangle = section(
	'Geometry',
	row(1, 'RelMoveTo', cell('X', 0) + cell('Y', 0)) +
		row(2, 'RelLineTo', cell('X', 1) + cell('Y', 0)) +
		row(3, 'RelLineTo', cell('X', 1) + cell('Y', 1)) +
		row(4, 'RelLineTo', cell('X', 0) + cell('Y', 1)) +
		row(5, 'RelLineTo', cell('X', 0) + cell('Y', 0)),
);
export const shape = (id: string, contents = rectangle, attributes = '') =>
	`<Shape ID="${id}" ${attributes}>${contents}</Shape>`;
export const relation = (id: string, type: string, target: string, mode = '') =>
	`<Relationship Id="${id}" Type="${relationshipType}${type}" Target="${target}"${mode ? ` TargetMode="${mode}"` : ''}/>`;
export const relations = (contents: string) =>
	`<Relationships xmlns="${relationshipNamespace}">${contents}</Relationships>`;
export const xml = (root: string, contents: string) =>
	`<${root} xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${contents}</${root}>`;
export interface FixturePage {
	id: string;
	contents: string;
	attributes?: string;
	width?: number;
	height?: number;
	pageCells?: string;
}
export async function fixture(
	options: {
		pages?: FixturePage[];
		document?: string;
		/** `attributes` go on the Master element (Name, NameU, Hidden); `sheet` is its PageSheet cells. */
		masters?: { id: string; shapes: string; attributes?: string; sheet?: string }[];
		edit?: (zip: JSZip) => void;
	} = {},
): Promise<Uint8Array> {
	const zip = new JSZip();
	zip.file(
		'[Content_Types].xml',
		'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/></Types>',
	);
	zip.file('_rels/.rels', relations(relation('rId1', 'document', 'visio/document.xml')));
	zip.file('visio/document.xml', xml('VisioDocument', options.document ?? ''));
	zip.file(
		'visio/_rels/document.xml.rels',
		relations(
			relation('rId1', 'pages', 'pages/pages.xml') +
				(options.masters ? relation('rId2', 'masters', 'masters/masters.xml') : ''),
		),
	);
	const pages = options.pages ?? [{ id: '0', contents: `<Shapes>${shape('1')}</Shapes>` }];
	zip.file(
		'visio/pages/pages.xml',
		xml(
			'Pages',
			pages
				.map(
					(page, i) =>
						`<Page ID="${page.id}" Name="Page ${i + 1}" ${page.attributes ?? ''}><PageSheet>${cell('PageWidth', page.width ?? 8.5)}${cell('PageHeight', page.height ?? 11)}${page.pageCells ?? ''}</PageSheet><Rel r:id="rId${i + 1}"/></Page>`,
				)
				.join(''),
		),
	);
	zip.file(
		'visio/pages/_rels/pages.xml.rels',
		relations(pages.map((_, i) => relation(`rId${i + 1}`, 'page', `page${i + 1}.xml`)).join('')),
	);
	pages.forEach((page, i) =>
		zip.file(`visio/pages/page${i + 1}.xml`, xml('PageContents', page.contents)),
	);
	if (options.masters) {
		zip.file(
			'visio/masters/masters.xml',
			xml(
				'Masters',
				options.masters
					.map(
						(master, i) =>
							`<Master ID="${master.id}" ${master.attributes ?? ''}>${master.sheet === undefined ? '' : `<PageSheet>${master.sheet}</PageSheet>`}<Rel r:id="rId${i + 1}"/></Master>`,
					)
					.join(''),
			),
		);
		zip.file(
			'visio/masters/_rels/masters.xml.rels',
			relations(
				options.masters
					.map((_, i) => relation(`rId${i + 1}`, 'master', `master${i + 1}.xml`))
					.join(''),
			),
		);
		options.masters.forEach((master, i) =>
			zip.file(
				`visio/masters/master${i + 1}.xml`,
				xml('MasterContents', `<Shapes>${master.shapes}</Shapes>`),
			),
		);
	}
	options.edit?.(zip);
	return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
