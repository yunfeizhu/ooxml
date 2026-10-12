import { expect, test, type Locator } from '@playwright/test';
import JSZip from 'jszip';
import type { VisioViewerElement } from 'ooxml-ui/visio';
import { createVsdxFixture } from './fixture.mjs';
import { openDemo } from './demo-page';
import { ribbonGroup } from './ribbon';

const NS = 'http://schemas.microsoft.com/office/visio/2012/main';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const VISIO = 'http://schemas.microsoft.com/visio/2010/relationships/';
const cell = (name: string, value: string | number, formula = '') =>
	`<Cell N="${name}" V="${value}" U="IN"${formula ? ` F="${formula}"` : ''}/>`;
const row = (index: number, x: string, y: string) =>
	`<Row T="${index === 1 ? 'MoveTo' : 'LineTo'}" IX="${index}">${x}${y}</Row>`;
/** Our own master: a box of the given width whose outline follows its size. */
const master = (width: number, fill: string) =>
	`<MasterContents xmlns="${NS}"><Shapes><Shape ID="6" Type="Shape">${cell('PinX', 2)}${cell('PinY', 2)}${cell('Width', width)}${cell('Height', 1)}${cell('LocPinX', width / 2, 'Width*0.5')}${cell('LocPinY', 0.5, 'Height*0.5')}<Cell N="Angle" V="0"/><Cell N="FillForegnd" V="${fill}"/><Cell N="LayerMember" V="0"/><Section N="Geometry" IX="0">${row(1, cell('X', 0, 'Width*0'), cell('Y', 0, 'Height*0'))}${row(2, cell('X', width, 'Width*1'), cell('Y', 0, 'Height*0'))}${row(3, cell('X', width, 'Width*1'), cell('Y', 1, 'Height*1'))}${row(4, cell('X', 0, 'Width*0'), cell('Y', 1, 'Height*1'))}${row(5, cell('X', 0, 'Geometry1.X1'), cell('Y', 0, 'Geometry1.Y1'))}</Section></Shape></Shapes></MasterContents>`;
const instance = (id: number, y: number) =>
	`<Shape ID="${id}" NameU="Process" Type="Shape" Master="2"><Cell N="PinX" V="4"/><Cell N="PinY" V="${y}"/><Cell N="LayerMember" V="0"/><Text>Step ${id}\n</Text></Shape>`;

/** Three stencil shapes of one master, and a second master in the document stencil. */
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
		`<Masters xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><Master ID="2" NameU="Process" Name="Process"><Rel r:id="rId1"/></Master><Master ID="4" NameU="Wide" Name="Wide"><Rel r:id="rId2"/></Master></Masters>`,
	);
	zip.file(
		'visio/masters/_rels/masters.xml.rels',
		`<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${VISIO}master" Target="master1.xml"/><Relationship Id="rId2" Type="${VISIO}master" Target="master2.xml"/></Relationships>`,
	);
	zip.file('visio/masters/master1.xml', master(2, '#DAEFE6'));
	zip.file('visio/masters/master2.xml', master(3, '#F2E6D8'));
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
		`<PageContents xmlns="${NS}"><Shapes>${instance(1, 8)}${instance(2, 6)}${instance(3, 4)}</Shapes></PageContents>`,
	);
	zip.file(
		'visio/pages/_rels/page1.xml.rels',
		`<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${VISIO}master" Target="../masters/master1.xml"/></Relationships>`,
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
const shapes = async (viewer: Locator) => {
	await idle(viewer);
	return viewer.evaluate((node) =>
		(node as VisioViewerElement).controller.state.document!.pages[0]!.shapes.map(
			(item) => `${item.id}:${item.masterId}`,
		),
	);
};
const pick = async (viewer: Locator, id: number) => {
	// Near the top left corner: a duplicate lies over the rest of its original.
	await viewer.locator(`svg.paper [data-shape-id="${id}"]`).click({ position: { x: 6, y: 6 } });
	await idle(viewer);
};

test('stencil shapes are duplicated, reordered, deleted and changed to another master', async ({
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
	expect(await shapes(viewer)).toEqual(['1:2', '2:2', '3:2']);
	const status = viewer.locator('[data-status]');

	// Ctrl+D: the copy is an instance of the same master.
	await pick(viewer, 2);
	await page.keyboard.press('Control+D');
	await expect.poll(() => shapes(viewer)).toEqual(['1:2', '2:2', '3:2', '4:2']);

	// Home > Arrange > Bring to Front.
	await pick(viewer, 1);
	await viewer.getByRole('tab', { name: 'Home', exact: true }).click();
	await ribbonGroup(viewer, 'Arrange');
	const front = viewer.locator('[command="bring-to-front"] button').first();
	await expect(front).toBeEnabled();
	await front.click();
	await expect.poll(() => shapes(viewer)).toEqual(['2:2', '3:2', '4:2', '1:2']);

	// Delete removes the instance; its master stays in the Document Stencil.
	await pick(viewer, 3);
	await page.keyboard.press('Delete');
	await expect.poll(() => shapes(viewer)).toEqual(['2:2', '4:2', '1:2']);
	await expect(viewer.locator('#shapes-stencils [data-master="document:2"]')).toHaveCount(1);

	// Change Shape offers the other master of the Document Stencil.
	await pick(viewer, 2);
	await ribbonGroup(viewer, 'Editing');
	const trigger = viewer.locator('office-ui-gallery[command="change-shape"] .trigger');
	await expect(trigger).toBeEnabled();
	await trigger.click();
	const popup = viewer.locator('[data-gallery-popup="change-shape"]');
	await expect(popup).toBeVisible();
	// The drawing's other master, then the built-in shapes.
	await expect(popup.locator('[data-gallery-item^="document:"]')).toHaveCount(1);
	await popup.locator('[data-gallery-item="document:4"]').click();
	await expect(status).toHaveText('Changed the shape to Wide.');
	await expect.poll(() => shapes(viewer)).toEqual(['2:4', '4:2', '1:2']);
	const width = await viewer.evaluate(
		(node) => (node as VisioViewerElement).controller.state.document!.pages[0]!.shapes[0]!.width,
	);
	expect(width).toBe(3);

	// Saved: instances of their masters, and the page now related to the second master.
	const saved = await viewer.evaluate((node) =>
		Array.from((node as VisioViewerElement).controller.exportVsdx().bytes),
	);
	const zip = await JSZip.loadAsync(new Uint8Array(saved));
	const xml = await zip.file('visio/pages/page1.xml')!.async('string');
	expect(xml).toMatch(/<Shape ID="2"[^>]* Master="4"[^>]*>/);
	expect(xml).toMatch(/<Shape ID="4"[^>]* Master="2">/);
	expect(xml).not.toContain('ID="3"');
	expect(await zip.file('visio/pages/_rels/page1.xml.rels')!.async('string')).toContain(
		'../masters/master2.xml',
	);

	// Each command was one step.
	const undo = viewer.locator('.qat').getByRole('button', { name: 'Undo', exact: true });
	for (let step = 0; step < 4; ++step) {
		await undo.click();
		await idle(viewer);
	}
	expect(await shapes(viewer)).toEqual(['1:2', '2:2', '3:2']);
	expect(errors).toEqual([]);
});
