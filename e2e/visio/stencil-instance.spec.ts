import { expect, test, type Locator } from '@playwright/test';
import JSZip from 'jszip';
import type { VisioViewerElement } from 'ooxml-ui/visio';
import { createVsdxFixture } from './fixture.mjs';
import { openDemo } from './demo-page';

const NS = 'http://schemas.microsoft.com/office/visio/2012/main';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const VISIO = 'http://schemas.microsoft.com/visio/2010/relationships/';
const cell = (name: string, value: string | number, formula = '') =>
	`<Cell N="${name}" V="${value}" U="IN"${formula ? ` F="${formula}"` : ''}/>`;
const row = (index: number, type: string, x: string, y: string) =>
	`<Row T="${type}" IX="${index}">${x}${y}</Row>`;

/** A drawing with one stencil shape: a master whose geometry follows its size, and an instance. */
async function stencilDrawing() {
	const zip = await JSZip.loadAsync(await createVsdxFixture('unused'));
	zip.file(
		'visio/_rels/document.xml.rels',
		`<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${VISIO}pages" Target="pages/pages.xml"/><Relationship Id="rId2" Type="${VISIO}masters" Target="masters/masters.xml"/></Relationships>`,
	);
	zip.file(
		'visio/document.xml',
		`<VisioDocument xmlns="${NS}"><StyleSheets><StyleSheet ID="0">${['LockMoveX', 'LockMoveY', 'LockWidth', 'LockHeight', 'LockAspect', 'LockDelete'].map((name) => `<Cell N="${name}" V="0"/>`).join('')}</StyleSheet></StyleSheets></VisioDocument>`,
	);
	zip.file(
		'visio/masters/masters.xml',
		`<Masters xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><Master ID="2" NameU="Process"><Rel r:id="rId1"/></Master></Masters>`,
	);
	zip.file(
		'visio/masters/_rels/masters.xml.rels',
		`<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${VISIO}master" Target="master1.xml"/></Relationships>`,
	);
	zip.file(
		'visio/masters/master1.xml',
		`<MasterContents xmlns="${NS}"><Shapes><Shape ID="6" Type="Shape">${cell('PinX', 2)}${cell('PinY', 2)}${cell('Width', 2)}${cell('Height', 1)}${cell('LocPinX', 1, 'Width*0.5')}${cell('LocPinY', 0.5, 'Height*0.5')}<Cell N="Angle" V="0"/><Cell N="FillForegnd" V="#DAEFE6"/><Cell N="LayerMember" V="0"/><Section N="Connection"><Row T="Connection" IX="0">${cell('X', 2, 'Width')}${cell('Y', 0.5, 'Height*0.5')}</Row></Section><Section N="Geometry" IX="0">${row(1, 'MoveTo', cell('X', 0, 'Width*0'), cell('Y', 0, 'Height*0'))}${row(2, 'LineTo', cell('X', 2, 'Width*1'), cell('Y', 0, 'Height*0'))}${row(3, 'LineTo', cell('X', 2, 'Width*1'), cell('Y', 1, 'Height*1'))}${row(4, 'LineTo', cell('X', 0, 'Width*0'), cell('Y', 1, 'Height*1'))}${row(5, 'LineTo', cell('X', 0, 'Geometry1.X1'), cell('Y', 0, 'Geometry1.Y1'))}</Section></Shape></Shapes></MasterContents>`,
	);
	const pages = await zip.file('visio/pages/pages.xml')!.async('string');
	zip.file(
		'visio/pages/pages.xml',
		pages.replace(
			'</PageSheet>',
			'<Section N="Layer"><Row IX="0"><Cell N="Name" V="Flowchart"/><Cell N="Lock" V="0"/></Row></Section></PageSheet>',
		),
	);
	zip.file(
		'visio/pages/page1.xml',
		`<PageContents xmlns="${NS}"><Shapes><Shape ID="1" NameU="Process" Type="Shape" Master="2"><Cell N="PinX" V="4"/><Cell N="PinY" V="7"/><Cell N="LayerMember" V="0"/><Text>Stencil shape\n</Text></Shape></Shapes></PageContents>`,
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
const shape = async (viewer: Locator) => {
	await idle(viewer);
	return viewer.evaluate((node) => {
		const item = (node as VisioViewerElement).controller.state.document!.pages[0]!.shapes[0]!;
		return {
			width: item.width,
			height: item.height,
			pinX: item.rotation!.pinX,
			left: item.transform[4],
			fill: item.style.fill,
			bold: !!item.text.runs[0]?.bold,
			master: item.masterId,
		};
	});
};
const handle = (viewer: Locator, id: string) =>
	viewer.locator(`[data-resize-handle="${id}"]`).evaluate((node) => {
		const circle = node as SVGCircleElement,
			point = new DOMPoint(circle.cx.baseVal.value, circle.cy.baseVal.value).matrixTransform(
				circle.getScreenCTM()!,
			);
		return { x: point.x, y: point.y };
	});

test('a stencil shape is resized, moved and formatted, and saved as an instance of its master', async ({
	page,
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.setViewportSize({ width: 1600, height: 1000 });
	await openDemo(page);
	const viewer = page.locator('visio-viewer');
	await page.locator('#file').setInputFiles({
		name: 'stencil.vsdx',
		mimeType: 'application/vnd.ms-visio.drawing',
		buffer: await stencilDrawing(),
	});
	await expect(page.locator('#file-name')).toHaveText('stencil.vsdx');
	await idle(viewer);
	await viewer.locator('svg.paper [data-shape-id="1"]').click();
	// The shape gets Visio's eight handles, as a drawn shape does.
	await expect(viewer.locator('[data-resize-handle]')).toHaveCount(8);
	expect(await shape(viewer)).toMatchObject({ width: 2, height: 1, master: '2' });

	// Drag the right handle one inch outwards: the left edge stays.
	const scale = await viewer
		.locator('svg.paper')
		.evaluate((node) => (node as SVGSVGElement).getScreenCTM()!.a);
	const before = await shape(viewer);
	const east = await handle(viewer, 'e');
	await page.mouse.move(east.x, east.y);
	await page.mouse.down();
	await page.mouse.move(east.x + scale * 0.5, east.y, { steps: 4 });
	await page.mouse.move(east.x + scale, east.y, { steps: 4 });
	await page.mouse.up();
	await expect.poll(async () => (await shape(viewer)).width).toBeCloseTo(3, 1);
	const resized = await shape(viewer);
	expect(resized.left).toBeCloseTo(before.left!, 5);
	expect(resized.height).toBe(1);

	// Formatting from the ribbon.
	await viewer.getByRole('tab', { name: 'Home', exact: true }).click();
	const bold = viewer.locator('[command="bold"] button');
	await expect(bold).toBeEnabled();
	await bold.click();
	await expect.poll(async () => (await shape(viewer)).bold).toBe(true);

	// Nudge with the arrow key: a move.
	await viewer.locator('svg.paper [data-shape-id="1"]').click();
	await page.keyboard.press('ArrowRight');
	await expect.poll(async () => (await shape(viewer)).pinX).toBeGreaterThan(resized.pinX);

	// The saved drawing still holds an instance, with local values over the master's formulas.
	const saved = await viewer.evaluate((node) =>
		Array.from((node as VisioViewerElement).controller.exportVsdx().bytes),
	);
	const zip = await JSZip.loadAsync(new Uint8Array(saved));
	const xml = await zip.file('visio/pages/page1.xml')!.async('string');
	expect(xml).toContain('Master="2"');
	expect(xml).toMatch(/<Cell N="Width" V="[\d.]+" U="IN"\/>/);
	expect(xml).toMatch(/<Cell N="LocPinX" V="[\d.]+" U="IN" F="Inh"\/>/);
	expect(xml).toContain('<Section N="Geometry" IX="0"><Row T="LineTo" IX="2">');
	expect(await zip.file('visio/masters/master1.xml')!.async('string')).toContain('F="Width*1"');

	// Undo walks all three steps back to the opened drawing.
	const undo = viewer.locator('.qat').getByRole('button', { name: 'Undo', exact: true });
	for (let step = 0; step < 3; ++step) {
		await undo.click();
		await idle(viewer);
	}
	expect(await shape(viewer)).toMatchObject({ width: 2, bold: false, pinX: 4 });
	expect(errors).toEqual([]);
});
