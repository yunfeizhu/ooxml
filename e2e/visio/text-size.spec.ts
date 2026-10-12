import { expect, test, type Locator } from '@playwright/test';
import JSZip from 'jszip';
import type { VisioViewerElement } from 'ooxml-ui/visio';
import { createVsdxFixture } from './fixture.mjs';
import { openDemo } from './demo-page';
import { history } from './ribbon';

const NS = 'http://schemas.microsoft.com/office/visio/2012/main';
const inch = (name: string, value: number, formula = '') =>
	`<Cell N="${name}" V="${value}" U="IN"${formula ? ` F="${formula}"` : ''}/>`;
const point = (name: string, points: number) => `<Cell N="${name}" V="${points / 72}" U="PT"/>`;
const FOX = 'The quick brown fox jumps over the lazy dog';
/** TEXTHEIGHT of FOX in Arial 12 pt with 4 pt margins at 1.5 in, recorded from Visio 16 (points). */
const VISIO_FOX_HEIGHT = 51.2;

/** A text box as Visio saves one: its height is the height of its text at its width. */
async function textBox() {
	const zip = await JSZip.loadAsync(await createVsdxFixture('unused'));
	zip.file(
		'visio/pages/page1.xml',
		`<PageContents xmlns="${NS}"><Shapes><Shape ID="1" Type="Shape">${inch('PinX', 4)}${inch('PinY', 7)}${inch('Width', 1.5)}${inch('Height', 22.4 / 72, 'GUARD(TEXTHEIGHT(TheText,Width))')}${inch('LocPinX', 0.75, 'Width*0.5')}${inch('LocPinY', 11.2 / 72, 'Height*0.5')}${['LeftMargin', 'RightMargin', 'TopMargin', 'BottomMargin'].map((name) => point(name, 4)).join('')}<Section N="Character"><Row IX="0"><Cell N="Font" V="Arial"/>${point('Size', 12)}<Cell N="Style" V="0"/></Row></Section><Section N="Geometry" IX="0"><Row T="RelMoveTo" IX="1"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row><Row T="RelLineTo" IX="2"><Cell N="X" V="1"/><Cell N="Y" V="0"/></Row><Row T="RelLineTo" IX="3"><Cell N="X" V="1"/><Cell N="Y" V="1"/></Row><Row T="RelLineTo" IX="4"><Cell N="X" V="0"/><Cell N="Y" V="1"/></Row><Row T="RelLineTo" IX="5"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row></Section><Text>Process</Text></Shape></Shapes></PageContents>`,
	);
	return zip.generateAsync({ type: 'nodebuffer' });
}

const height = (viewer: Locator) =>
	viewer.evaluate((node) => {
		const state = (node as VisioViewerElement).controller.state;
		return state.loading || state.edit.busy
			? Number.NaN
			: state.document!.pages[0]!.shapes[0]!.height * 72;
	});

test('a text box grows with its text, as Visio sizes it, and undo restores it', async ({
	page,
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.setViewportSize({ width: 1600, height: 1000 });
	await openDemo(page);
	const viewer = page.locator('visio-viewer');
	await page.locator('#file').setInputFiles({
		name: 'text-box.vsdx',
		mimeType: 'application/vnd.ms-visio.drawing',
		buffer: await textBox(),
	});
	await expect(page.locator('#file-name')).toHaveText('text-box.vsdx');
	await expect.poll(() => height(viewer)).toBeCloseTo(22.4, 1);

	const drawn = viewer.locator('svg.paper [data-shape-id="1"]');
	await drawn.dblclick();
	const editor = viewer.locator('#edit-text');
	await expect(editor).toBeFocused();
	const before = (await editor.boundingBox())!;
	await editor.fill(FOX);
	// While typing, the editing frame grows around the middle of the shape.
	const typing = (await editor.boundingBox())!;
	expect(typing.height).toBeGreaterThan(before.height + 10);
	expect(typing.y).toBeLessThan(before.y);
	await editor.press('Escape');
	await expect(editor).toHaveCount(0);

	// Saved: the shape has the height Visio computes for this text at this width.
	await expect.poll(() => height(viewer)).toBeCloseTo(VISIO_FOX_HEIGHT, 1);
	const saved = await viewer.evaluate((node) =>
		Array.from((node as VisioViewerElement).controller.exportVsdx().bytes),
	);
	const xml = await (
		await JSZip.loadAsync(new Uint8Array(saved))
	)
		.file('visio/pages/page1.xml')!
		.async('string');
	expect(xml).toContain('F="GUARD(TEXTHEIGHT(TheText,Width))"');

	await history(viewer, 'Undo').click();
	await expect.poll(() => height(viewer)).toBeCloseTo(22.4, 1);
	expect(errors).toEqual([]);
});
