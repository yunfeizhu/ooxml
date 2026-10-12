import { expect, test, type Locator } from '@playwright/test';
import JSZip from 'jszip';
import type { VisioViewerElement } from 'ooxml-ui/visio';
import { createVsdxFixture } from './fixture.mjs';
import { openDemo } from './demo-page';

const NS = 'http://schemas.microsoft.com/office/visio/2012/main';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const VISIO = 'http://schemas.microsoft.com/visio/2010/relationships/';
const c = (name: string, value: string | number, formula = '') =>
	`<Cell N="${name}" V="${value}"${formula ? ` F="${formula}"` : ''}/>`;
const row = (index: number, type: string, cells: string) =>
	`<Row T="${type}" IX="${index}">${cells}</Row>`;
const WALK = '_WALKGLUE(BegTrigger,EndTrigger,WalkPreference)';
const WALK_END = '_WALKGLUE(EndTrigger,BegTrigger,WalkPreference)';

/**
 * Two stencil shapes joined by a stencil connector built like Visio's Dynamic connector (its own
 * masters, written here): the drawing Visio makes when two flowchart shapes are connected.
 */
async function connectedDrawing() {
	const zip = await JSZip.loadAsync(await createVsdxFixture('unused'));
	zip.file(
		'visio/_rels/document.xml.rels',
		`<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${VISIO}pages" Target="pages/pages.xml"/><Relationship Id="rId2" Type="${VISIO}masters" Target="masters/masters.xml"/></Relationships>`,
	);
	zip.file(
		'visio/document.xml',
		`<VisioDocument xmlns="${NS}"><StyleSheets><StyleSheet ID="0">${['LockMoveX', 'LockMoveY', 'LockWidth', 'LockHeight', 'LockAspect', 'LockDelete', 'LockBegin', 'LockEnd'].map((name) => c(name, 0)).join('')}${c('LineWeight', 0.02)}${c('LineColor', '#333333')}${c('LinePattern', 1)}</StyleSheet></StyleSheets></VisioDocument>`,
	);
	zip.file(
		'visio/masters/masters.xml',
		`<Masters xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><Master ID="2" NameU="Process"><Rel r:id="rId1"/></Master><Master ID="4" NameU="Dynamic connector"><Rel r:id="rId2"/></Master></Masters>`,
	);
	zip.file(
		'visio/masters/_rels/masters.xml.rels',
		`<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${VISIO}master" Target="master1.xml"/><Relationship Id="rId2" Type="${VISIO}master" Target="master2.xml"/></Relationships>`,
	);
	zip.file(
		'visio/masters/master1.xml',
		`<MasterContents xmlns="${NS}"><Shapes><Shape ID="5" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">${c('PinX', 2)}${c('PinY', 2)}${c('Width', 1)}${c('Height', 0.75)}${c('LocPinX', 0.5, 'Width*0.5')}${c('LocPinY', 0.375, 'Height*0.5')}${c('Angle', 0)}${c('FlipX', 0)}${c('FlipY', 0)}${c('ObjType', 1)}${c('EventXFMod', 0)}${c('FillForegnd', '#DAEFE6')}<Section N="Geometry" IX="0">${row(1, 'MoveTo', c('X', 0, 'Width*0') + c('Y', 0, 'Height*0'))}${row(2, 'LineTo', c('X', 1, 'Width*1') + c('Y', 0, 'Height*0'))}${row(3, 'LineTo', c('X', 1, 'Width*1') + c('Y', 0.75, 'Height*1'))}${row(4, 'LineTo', c('X', 0, 'Width*0') + c('Y', 0.75, 'Height*1'))}${row(5, 'LineTo', c('X', 0, 'Geometry1.X1') + c('Y', 0, 'Geometry1.Y1'))}</Section></Shape></Shapes></MasterContents>`,
	);
	zip.file(
		'visio/masters/master2.xml',
		`<MasterContents xmlns="${NS}"><Shapes><Shape ID="5" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">${c('PinX', 1.5, 'GUARD((BeginX+EndX)/2)')}${c('PinY', 1.5, 'GUARD((BeginY+EndY)/2)')}${c('Width', 1, 'GUARD(EndX-BeginX)')}${c('Height', -1, 'GUARD(EndY-BeginY)')}${c('LocPinX', 0.5, 'GUARD(Width*0.5)')}${c('LocPinY', -0.5, 'GUARD(Height*0.5)')}${c('Angle', 0, 'GUARD(0DA)')}${c('FlipX', 0, 'GUARD(FALSE)')}${c('FlipY', 0, 'GUARD(FALSE)')}${c('BeginX', 1)}${c('BeginY', 2)}${c('EndX', 2)}${c('EndY', 1)}${c('TxtPinX', 0, 'SETATREF(Controls.TextPosition)')}${c('TxtPinY', -1, 'SETATREF(Controls.TextPosition.Y)')}${c('ObjType', 2)}<Section N="Control"><Row N="TextPosition">${c('X', 0)}${c('Y', -1)}${c('XDyn', 0, 'Controls.TextPosition')}${c('YDyn', -1, 'Controls.TextPosition.Y')}</Row></Section><Section N="Geometry" IX="0">${c('NoFill', 1)}${row(1, 'MoveTo', c('X', 0) + c('Y', 0))}${row(2, 'LineTo', c('X', 0) + c('Y', -1))}${row(3, 'LineTo', c('X', 1) + c('Y', -1))}</Section></Shape></Shapes></MasterContents>`,
	);
	const level =
		c('PinX', 4, 'Inh') +
		c('PinY', 6, 'Inh') +
		c('Width', 3, 'GUARD(EndX-BeginX)') +
		c('Height', 0.25, 'GUARD(0.25DL)') +
		c('LocPinX', 1.5, 'Inh') +
		c('LocPinY', 0.125, 'Inh') +
		c('BeginX', 2.5, WALK) +
		c('BeginY', 6, WALK) +
		c('EndX', 5.5, WALK_END) +
		c('EndY', 6, WALK_END) +
		c('BegTrigger', 2, '_XFTRIGGER(Sheet.1!EventXFMod)') +
		c('EndTrigger', 2, '_XFTRIGGER(Sheet.2!EventXFMod)') +
		c('TxtPinX', 1.5, 'Inh') +
		c('TxtPinY', 0.125, 'Inh') +
		`<Section N="Control"><Row N="TextPosition">${c('X', 1.5)}${c('Y', 0.125)}${c('XDyn', 1.5, 'Inh')}${c('YDyn', 0.125, 'Inh')}</Row></Section>` +
		`<Section N="Geometry" IX="0">${row(1, 'MoveTo', c('Y', 0.125))}${row(2, 'LineTo', c('X', 3) + c('Y', 0.125))}<Row T="LineTo" IX="3" Del="1"/></Section>`;
	const box = (id: string, x: number) =>
		`<Shape ID="${id}" Type="Shape" Master="2">${c('PinX', x)}${c('PinY', 6)}</Shape>`;
	zip.file(
		'visio/pages/page1.xml',
		`<PageContents xmlns="${NS}"><Shapes>${box('1', 2)}${box('2', 6)}<Shape ID="3" Type="Shape" Master="4">${level}</Shape></Shapes><Connects><Connect FromSheet="3" FromCell="EndX" FromPart="12" ToSheet="2" ToCell="PinX" ToPart="3"/><Connect FromSheet="3" FromCell="BeginX" FromPart="9" ToSheet="1" ToCell="PinX" ToPart="3"/></Connects></PageContents>`,
	);
	return zip.generateAsync({ type: 'nodebuffer' });
}

const idle = (viewer: Locator) =>
	expect
		.poll(() =>
			viewer.evaluate((node) => {
				const state = (node as VisioViewerElement).controller.state;
				return state.loading || state.edit.busy;
			}),
		)
		.toBe(false);
/** The connector's page XML in the drawing as it would be saved now. */
const saved = async (viewer: Locator) => {
	await idle(viewer);
	const bytes = await viewer.evaluate((node) =>
		Array.from((node as VisioViewerElement).exportVsdx().bytes),
	);
	const page = await (
		await JSZip.loadAsync(new Uint8Array(bytes))
	)
		.file('visio/pages/page1.xml')!
		.async('string');
	return page.replace(/'/g, '"');
};

test('a shape glued to a stencil connector moves, and the connector follows as Visio saves it', async ({
	page,
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.setViewportSize({ width: 1600, height: 1000 });
	await openDemo(page);
	const viewer = page.locator('visio-viewer');
	await page.locator('#file').setInputFiles({
		name: 'connected.vsdx',
		mimeType: 'application/vnd.ms-visio.drawing',
		buffer: await connectedDrawing(),
	});
	await expect(page.locator('#file-name')).toHaveText('connected.vsdx');
	await idle(viewer);

	// Drag the second shape three inches down: the connector takes Visio's one-bend path.
	const target = viewer.locator('svg.paper [data-shape-id="2"]');
	const scale = await viewer
		.locator('svg.paper')
		.evaluate((node) => (node as SVGSVGElement).getScreenCTM()!.a);
	const box = (await target.boundingBox())!;
	const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(start.x, start.y + scale * 1.5, { steps: 4 });
	await page.mouse.move(start.x, start.y + scale * 3, { steps: 4 });
	await page.mouse.up();
	const pinOf = (xml: string) =>
		Number(/<Cell N="PinY" V="([\d.]+)"/.exec(xml.split('ID="2"')[1]!)![1]);
	await expect.poll(async () => pinOf(await saved(viewer))).toBeLessThan(4);
	const xml = await saved(viewer);
	const pinY = pinOf(xml);
	const line = /<Shape ID="3".*?<\/Shape>/s.exec(xml)![0];
	// It leaves the first shape from its lower side and enters the second from its left side.
	expect(line).toContain(
		`<Cell N="BeginX" V="2" F="${WALK}"/><Cell N="BeginY" V="5.625" F="${WALK}"/>`,
	);
	expect(line).toContain(
		`<Cell N="EndX" V="5.5" F="${WALK_END}"/><Cell N="EndY" V="${pinY}" F="${WALK_END}"/>`,
	);
	expect(line).toContain('<Cell N="Width" V="3.5" F="GUARD(EndX-BeginX)"/>');
	expect(line).toContain('F="GUARD(EndY-BeginY)"/>');
	expect(xml.match(/<Connect /g)).toHaveLength(2);

	// The connector shows its two end handles, and stencil shapes get AutoConnect arrows.
	// (Selected through the API: the middle of a bent connector's box is not on its line.)
	await viewer.evaluate((node) =>
		(node as VisioViewerElement).selectShapes([{ id: '3', name: 'Dynamic connector' }]),
	);
	await expect(viewer.locator('[data-line-endpoint]')).toHaveCount(2);
	await viewer.locator('svg.paper [data-shape-id="1"]').hover();
	await expect(viewer.locator('.auto-connect [data-auto-connect]')).toHaveCount(4);

	// Undo puts the level run back.
	await viewer.evaluate((node) => (node as VisioViewerElement).undo());
	expect(await saved(viewer)).toContain('<Cell N="Height" V="0.25" F="GUARD(0.25DL)"/>');
	expect(errors).toEqual([]);
});
