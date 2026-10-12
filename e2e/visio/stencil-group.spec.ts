import { expect, test, type Locator } from '@playwright/test';
import JSZip from 'jszip';
import type { VisioViewerElement } from 'ooxml-ui/visio';
import { createVsdxFixture } from './fixture.mjs';
import { openDemo } from './demo-page';

const NS = 'http://schemas.microsoft.com/office/visio/2012/main';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const VISIO = 'http://schemas.microsoft.com/visio/2010/relationships/';
const cell = (name: string, value: string | number, formula = '') =>
	`<Cell N="${name}" V="${value}"${formula ? ` F="${formula}"` : ''}/>`;
const row = (index: number, type: string, x: string, y: string) =>
	`<Row T="${type}" IX="${index}">${x}${y}</Row>`;
const outline = `<Section N="Geometry" IX="0">${row(1, 'MoveTo', cell('X', 0, 'Width*0'), cell('Y', 0, 'Height*0'))}${row(2, 'LineTo', cell('X', 1, 'Width*1'), cell('Y', 0, 'Height*0'))}${row(3, 'LineTo', cell('X', 1, 'Width*1'), cell('Y', 1, 'Height*1'))}${row(4, 'LineTo', cell('X', 0, 'Width*0'), cell('Y', 1, 'Height*1'))}${row(5, 'LineTo', cell('X', 0, 'Geometry1.X1'), cell('Y', 0, 'Geometry1.Y1'))}</Section>`;
const half = (id: string, x: number, fill: string, text = '') =>
	`<Shape ID="${id}" Type="Shape">${cell('PinX', 2 * x, `Sheet.5!Width*${x}`)}${cell('PinY', 0.5, 'Sheet.5!Height*0.5')}${cell('Width', 1, 'Sheet.5!Width*0.5')}${cell('Height', 1, 'Sheet.5!Height*1')}${cell('LocPinX', 0.5, 'Width*0.5')}${cell('LocPinY', 0.5, 'Height*0.5')}${cell('FillForegnd', fill)}${outline}${text}</Shape>`;

/** A drawing with one stencil group: a master of two halves that follow the group's size. */
async function groupDrawing() {
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
		`<Masters xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><Master ID="2" NameU="Pair"><Rel r:id="rId1"/></Master></Masters>`,
	);
	zip.file(
		'visio/masters/_rels/masters.xml.rels',
		`<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${VISIO}master" Target="master1.xml"/></Relationships>`,
	);
	zip.file(
		'visio/masters/master1.xml',
		`<MasterContents xmlns="${NS}"><Shapes><Shape ID="5" Type="Group">${cell('PinX', 2)}${cell('PinY', 2)}${cell('Width', 2)}${cell('Height', 1)}${cell('LocPinX', 1, 'Width*0.5')}${cell('LocPinY', 0.5, 'Height*0.5')}${cell('Angle', 0)}<Shapes>${half('6', 0.25, '#DAEFE6')}${half('7', 0.75, '#F1EADF', '<Text>Right\n</Text>')}</Shapes></Shape></Shapes></MasterContents>`,
	);
	zip.file(
		'visio/pages/page1.xml',
		`<PageContents xmlns="${NS}"><Shapes><Shape ID="1" NameU="Pair" Type="Group" Master="2"><Cell N="PinX" V="4"/><Cell N="PinY" V="7"/><Shapes><Shape ID="2" Type="Shape" MasterShape="6"/><Shape ID="3" Type="Shape" MasterShape="7"/></Shapes></Shape></Shapes></PageContents>`,
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
const group = async (viewer: Locator) => {
	await idle(viewer);
	return viewer.evaluate((node) => {
		const state = (node as VisioViewerElement).controller.state;
		const item = state.document!.pages[0]!.shapes[0]!;
		return {
			width: item.width,
			left: item.transform[4],
			master: item.masterId,
			parts: item.children.map((child) => child.width),
			bold: item.children.map((child) => !!child.text.runs[0]?.bold),
			selected: state.selectedShape?.id,
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

test('a stencil group is resized with its parts, and one part is formatted alone', async ({
	page,
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.setViewportSize({ width: 1600, height: 1000 });
	await openDemo(page);
	const viewer = page.locator('visio-viewer');
	await page.locator('#file').setInputFiles({
		name: 'group.vsdx',
		mimeType: 'application/vnd.ms-visio.drawing',
		buffer: await groupDrawing(),
	});
	await expect(page.locator('#file-name')).toHaveText('group.vsdx');
	await idle(viewer);
	const right = viewer.locator('svg.paper [data-shape-id="3"] [data-geometry]').first();
	// The first click on a part selects the group, which gets Visio's eight handles.
	await right.click();
	await expect(viewer.locator('[data-resize-handle]')).toHaveCount(8);
	expect(await group(viewer)).toMatchObject({
		width: 2,
		parts: [1, 1],
		master: '2',
		selected: '1',
	});

	// Drag the right handle one inch outwards: the left edge stays and both halves follow.
	const scale = await viewer
		.locator('svg.paper')
		.evaluate((node) => (node as SVGSVGElement).getScreenCTM()!.a);
	const before = await group(viewer);
	const east = await handle(viewer, 'e');
	await page.mouse.move(east.x, east.y);
	await page.mouse.down();
	await page.mouse.move(east.x + scale * 0.5, east.y, { steps: 4 });
	await page.mouse.move(east.x + scale, east.y, { steps: 4 });
	await page.mouse.up();
	await expect.poll(async () => (await group(viewer)).width).toBeCloseTo(3, 1);
	const resized = await group(viewer);
	expect(resized.left).toBeCloseTo(before.left!, 5);
	expect(resized.parts[0]).toBeCloseTo(resized.width / 2, 5);
	expect(resized.parts[1]).toBeCloseTo(resized.width / 2, 5);

	// A second click inside the selected group sub-selects the part: it is formatted alone.
	await viewer.locator('svg.paper [data-shape-id="3"] [data-geometry]').first().click();
	await expect.poll(async () => (await group(viewer)).selected).toBe('3');
	await expect(viewer.locator('[data-resize-handle]')).toHaveCount(0);
	await viewer.getByRole('tab', { name: 'Home', exact: true }).click();
	const bold = viewer.locator('[command="bold"] button');
	await expect(bold).toBeEnabled();
	await bold.click();
	await expect.poll(async () => (await group(viewer)).bold).toEqual([false, true]);

	// The saved drawing still holds an instance: local size on the group, refreshed caches inside.
	const saved = await viewer.evaluate((node) =>
		Array.from((node as VisioViewerElement).controller.exportVsdx().bytes),
	);
	const zip = await JSZip.loadAsync(new Uint8Array(saved));
	const xml = await zip.file('visio/pages/page1.xml')!.async('string');
	expect(xml).toContain('Type="Group" Master="2"');
	expect(xml).toMatch(/<Cell N="Width" V="[\d.]+" U="IN"\/>/);
	expect(xml).toMatch(/MasterShape="6"><Cell N="PinX" V="[\d.]+" U="IN" F="Inh"\/>/);
	expect(await zip.file('visio/masters/master1.xml')!.async('string')).toContain(
		'F="Sheet.5!Width*0.5"',
	);

	// Undo walks both steps back to the opened drawing.
	const undo = viewer.locator('.qat').getByRole('button', { name: 'Undo', exact: true });
	for (let step = 0; step < 2; ++step) {
		await undo.click();
		await idle(viewer);
	}
	expect(await group(viewer)).toMatchObject({ width: 2, parts: [1, 1], bold: [false, false] });
	expect(errors).toEqual([]);
});
