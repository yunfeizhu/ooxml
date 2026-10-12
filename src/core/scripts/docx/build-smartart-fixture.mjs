// Builds src/core/docx/__fixtures__/smartart.docx: a Word package carrying two SmartArt diagrams.
//
// Provenance: the five parts of each diagram (data, layout, quickStyle, colors, drawing) are
// copied byte for byte from src/core/pptx/__tests__/fixtures/corpus/smartart-orgchart-assistants.pptx
// (slides 1 and 2; org charts produced by PowerPoint, committed with the pptx tests) with ONE
// change: the `relId` of `dsp:dataModelExt` in each data part, which names the cached drawing's
// relationship in the host part, is rewritten to the relationship id used in document.xml.rels
// here. The theme is ppt/theme/theme1.xml of the same deck. Everything else (document.xml, rels,
// content types) is hand-built to look like what Word writes: diagram 1 is a `wp:inline`, diagram 2
// a floating `wp:anchor` with an alt text. Word itself did not produce this package; open it in
// Word before treating it as evidence of Word compatibility.
//
// Run: node scripts/docx/build-smartart-fixture.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = path.join(root, 'pptx/__tests__/fixtures/corpus/smartart-orgchart-assistants.pptx');
const output = path.join(root, 'docx/__fixtures__/smartart.docx');

const pptx = await JSZip.loadAsync(await readFile(source));
const text = async (name) => {
	const file = pptx.file(name);
	if (!file) throw new Error(`${name} is not in the source deck`);
	return file.async('string');
};

const BASE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CT = 'application/vnd.openxmlformats-officedocument.drawingml';
const kinds = [
	['data', 'data', `${BASE}/diagramData`, `${CT}.diagramData+xml`],
	['layout', 'layout', `${BASE}/diagramLayout`, `${CT}.diagramLayout+xml`],
	['quickStyle', 'quickStyle', `${BASE}/diagramQuickStyle`, `${CT}.diagramStyle+xml`],
	['colors', 'colors', `${BASE}/diagramColors`, `${CT}.diagramColors+xml`],
	[
		'drawing',
		'drawing',
		'http://schemas.microsoft.com/office/2007/relationships/diagramDrawing',
		'application/vnd.ms-office.drawingml.diagramDrawing+xml',
	],
];

const zip = new JSZip();
const relationships = [];
const overrides = [
	'<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
	'<Override PartName="/word/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>',
];
relationships.push(`<Relationship Id="rId1" Type="${BASE}/theme" Target="theme/theme1.xml"/>`);

// Relationship ids per diagram: rId2..rId6 and rId7..rId11 (data, layout, quickStyle, colors, drawing).
const DATE = new Date('2026-10-02T00:00:00Z'); // fixed, so the archive is reproducible
const put = (name, content) => zip.file(name, content, { date: DATE });
put('word/theme/theme1.xml', await text('ppt/theme/theme1.xml'));
const ids = [];
let next = 2;
for (const index of [1, 2]) {
	const set = {};
	for (const [key] of kinds) set[`${key}Id`] = `rId${next++}`;
	for (const [key, stem, type, contentType] of kinds) {
		const partName = `diagrams/${stem}${index}.xml`;
		let content = await text(`ppt/diagrams/${stem}${index}.xml`);
		if (key === 'data') {
			// The only change to a copied part: point dsp:dataModelExt at this package's drawing relationship.
			const patched = content.replace(
				/(dataModelExt[^>]*\brelId=")[^"]*(")/u,
				`$1${set.drawingId}$2`,
			);
			if (!patched.includes(`relId="${set.drawingId}"`))
				throw new Error('the data part has no dsp:dataModelExt relId');
			content = patched;
		}
		put(`word/${partName}`, content);
		relationships.push(
			`<Relationship Id="${set[`${key}Id`]}" Type="${type}" Target="${partName}"/>`,
		);
		overrides.push(`<Override PartName="/word/${partName}" ContentType="${contentType}"/>`);
	}
	ids.push(set);
}

const NS =
	'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"';
const graphic = (set) =>
	`<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram"><dgm:relIds r:dm="${set.dataId}" r:lo="${set.layoutId}" r:qs="${set.quickStyleId}" r:cs="${set.colorsId}"/></a:graphicData></a:graphic>`;
const EXTENT = '<wp:extent cx="8255000" cy="5080000"/>';
const inline = `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">${EXTENT}<wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="1" name="Diagram 1" descr="Organisation chart with assistants"/><wp:cNvGraphicFramePr/>${graphic(ids[0])}</wp:inline></w:drawing>`;
const anchor = `<w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251659264" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:align>center</wp:align></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>${EXTENT}<wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapTopAndBottom/><wp:docPr id="2" name="Diagram 2" descr="Second organisation chart" title="Floating diagram"/><wp:cNvGraphicFramePr/>${graphic(ids[1])}</wp:anchor></w:drawing>`;
const paragraph = (inner) => `<w:p><w:r>${inner}</w:r></w:p>`;
const body = [
	paragraph('<w:t>SmartArt fixture. The first diagram is inline:</w:t>'),
	paragraph(`<w:rPr><w:noProof/></w:rPr>${inline}`),
	paragraph('<w:t>The second diagram below is floating:</w:t>'),
	paragraph(`<w:rPr><w:noProof/></w:rPr>${anchor}`),
	paragraph('<w:t>End of document.</w:t>'),
].join('');
put(
	'word/document.xml',
	`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`,
);
put(
	'word/_rels/document.xml.rels',
	`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.join('')}</Relationships>`,
);
put(
	'[Content_Types].xml',
	`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrides.join('')}</Types>`,
);
put(
	'_rels/.rels',
	`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${BASE}/officeDocument" Target="word/document.xml"/></Relationships>`,
);

await mkdir(path.dirname(output), { recursive: true });
await writeFile(
	output,
	await zip.generateAsync({
		type: 'nodebuffer',
		compression: 'DEFLATE',
		platform: 'UNIX',
	}),
);
console.log(`wrote ${path.relative(root, output)}`);
