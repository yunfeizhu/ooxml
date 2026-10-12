import { test, expect, type Locator, type Page } from '@playwright/test';
import JSZip from 'jszip';
import type { VisioViewerElement } from 'ooxml-ui/visio';
import { createVsdxFixture } from './fixture.mjs';
import { fileBackstage, ribbonGroup } from './ribbon';
import { openDemo } from './demo-page';

/** Three rectangles: the fixture's shape 1 at (4, 7), shape 2 at (2, 2.2) and shape 3 at (7, 2). */
async function layoutFixture(): Promise<Buffer> {
	const zip = await JSZip.loadAsync(await createVsdxFixture('Layout anchor'));
	const xml = await zip.file('visio/pages/page1.xml')!.async('string');
	const anchor = xml.match(/<Shape ID="1"[\s\S]*?<\/Shape>/u)![0];
	const rectangle = (id: string, x: number, y: number) => {
		let shape = anchor.replace('ID="1"', `ID="${id}"`).replace('Layout anchor', `Layout ${id}`);
		for (const [name, value] of Object.entries({ PinX: x, PinY: y }))
			shape = shape.replace(new RegExp(`(<Cell N="${name}" V=")[^"]+"`, 'u'), `$1${value}"`);
		return shape;
	};
	zip.file(
		'visio/pages/page1.xml',
		xml.replace('</Shapes>', `${rectangle('2', 2, 2.2)}${rectangle('3', 7, 2)}</Shapes>`),
	);
	return zip.generateAsync({ type: 'nodebuffer' });
}
const pins = (viewer: Locator) =>
	viewer.evaluate((node) =>
		(node as VisioViewerElement).controller.state.document!.pages[0]!.shapes.map((shape) => [
			shape.rotation!.pinX,
			shape.rotation!.pinY,
		]),
	);
async function open(page: Page): Promise<Locator> {
	await page.setViewportSize({ width: 1600, height: 1000 });
	await openDemo(page);
	const viewer = page.locator('visio-viewer');
	await page.locator('#file').setInputFiles({
		name: 'layout.vsdx',
		mimeType: 'application/vnd.ms-visio.drawing',
		buffer: await layoutFixture(),
	});
	await expect(page.locator('#file-name')).toHaveText('layout.vsdx');
	return viewer;
}
async function home(viewer: Locator): Promise<void> {
	await viewer.getByRole('tab', { name: 'Home', exact: true }).click();
	const tools = viewer.locator('.ribbon-tools');
	if ((await tools.getAttribute('open')) === null) await tools.locator('summary').click();
}
async function selectAll(viewer: Locator): Promise<void> {
	await home(viewer);
	await ribbonGroup(viewer, 'Editing');
	await viewer.locator('[data-menu="select"] button').first().click();
	await viewer.locator('[command="select-all"]').click();
	await expect(viewer.locator('svg.paper [data-selected="true"]')).toHaveCount(3);
}
const press = (viewer: Locator, command: string) =>
	viewer.locator(`office-ui-button[command="${command}"] button`).click();

test('Auto Align & Space and Re-Layout Page move shapes as single undo steps', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const viewer = await open(page);
	const original = await pins(viewer);
	await selectAll(viewer);
	await viewer.locator('[data-menu="position"] button').first().click();
	await viewer.locator('[command="auto-align"]').click();
	await expect(viewer.locator('[data-status]')).toHaveText(/Aligned and spaced 3 shapes/);
	const aligned = await pins(viewer);
	// Shapes 2 and 3 now share a row.
	expect(aligned[1]![1]).toBeCloseTo(aligned[2]![1]!, 6);
	await viewer.locator('.qat').getByRole('button', { name: 'Undo', exact: true }).click();
	await expect.poll(() => pins(viewer)).toEqual(original);

	await viewer.getByRole('tab', { name: 'Design', exact: true }).click();
	const trigger = viewer.locator('office-ui-gallery[command="re-layout"] .trigger');
	await expect(trigger).toBeEnabled();
	await trigger.click();
	await viewer.locator('[data-gallery-popup="re-layout"] [data-gallery-item="circular"]').click();
	await expect(viewer.locator('[data-status]')).toHaveText(/Laid out 3 shapes as Circular/);
	await expect.poll(() => pins(viewer)).not.toEqual(original);
	await viewer.locator('.qat').getByRole('button', { name: 'Undo', exact: true }).click();
	await expect.poll(() => pins(viewer)).toEqual(original);

	// The Layout group launcher opens the Layout dialog.
	await viewer.locator('office-ui-ribbon-group[launcher="layout-dialog"] .launcher').click();
	const dialog = viewer.locator('.layout-dialog');
	await dialog.locator('select[name="style"]').selectOption('flowchart-lr');
	await dialog.locator('[command="layout-dialog-apply"] button').click();
	await expect(viewer.locator('[data-status]')).toHaveText(/Flowchart, Left to Right/);
	expect(errors).toEqual([]);
});

test('Assign to Layer, Select by Type, Drawing Explorer and guides', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const viewer = await open(page);
	await selectAll(viewer);
	await ribbonGroup(viewer, 'Editing');
	await viewer.locator('[data-menu="layers"] button').first().click();
	await viewer.locator('[command="assign-layer"]').click();
	const layers = viewer.locator('.layer-assign-dialog');
	await expect(layers).toContainText('This page has no layers yet.');
	await layers.locator('input[name="new-layer"]').fill('Review');
	await layers.locator('[command="layer-assign-dialog-ok"] button').click();
	await expect(viewer.locator('[data-status]')).toHaveText(
		/Assigned 3 shapes to layers. Added Review./,
	);
	expect(
		await viewer.evaluate((node) =>
			(node as VisioViewerElement).controller.state.document!.pages[0]!.shapes.map(
				(shape) => shape.layerIds,
			),
		),
	).toEqual([['0'], ['0'], ['0']]);
	// Layered shapes still move.
	const before = await pins(viewer);
	await viewer.locator('.viewport').press('Escape');
	const shape = viewer.locator('svg.paper [data-shape-id="2"]');
	const box = (await shape.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 5 });
	await page.mouse.up();
	await expect.poll(() => pins(viewer)).not.toEqual(before);

	await home(viewer);
	await ribbonGroup(viewer, 'Editing');
	await viewer.locator('[data-menu="select"] button').first().click();
	await viewer.locator('[command="select-by-type"]').click();
	const select = viewer.locator('.select-type-dialog');
	await select.locator('[command="select-type-dialog-ok"] button').click();
	await expect(viewer.locator('svg.paper [data-selected="true"]')).toHaveCount(3);

	await viewer.getByRole('tab', { name: 'View', exact: true }).click();
	await viewer.getByRole('button', { name: 'Task Panes', exact: true }).click();
	await viewer.locator('office-ui-menu-item[label="Drawing Explorer"]').click();
	const explorer = viewer.locator('.explorer-dialog');
	await expect(explorer).toContainText('Review');
	await explorer.locator('button[data-explore="shape"][data-value="3"]').click();
	await expect(viewer.locator('svg.paper [data-selected="true"]')).toHaveCount(1);
	await explorer.locator('[command="explorer-dialog-close"] button').click();

	// Guides: show them and the ruler, then drag a vertical guide out of the left ruler.
	await viewer.locator('[data-check="ruler"]').click();
	await viewer.locator('[data-check="guides"]').click();
	const ruler = (await viewer.locator('.ruler-v').boundingBox())!;
	const paper = (await viewer.locator('svg.paper').boundingBox())!;
	await page.mouse.move(ruler.x + ruler.width / 2, paper.y + 100);
	await page.mouse.down();
	await page.mouse.move(paper.x + 150, paper.y + 100, { steps: 5 });
	await page.mouse.up();
	await expect(viewer.locator('[data-status]')).toHaveText('Added a guide.');
	await expect(viewer.locator('svg.paper [data-guide-id]')).toHaveCount(1);
	await viewer.locator('svg.paper [data-guide-id] .guide-hit').click({ force: true });
	await viewer.locator('.viewport').press('Delete');
	await expect(viewer.locator('[data-status]')).toHaveText('Deleted the guide.');
	await expect(viewer.locator('svg.paper [data-guide-id]')).toHaveCount(0);
	expect(errors).toEqual([]);
});

test('File > Export creates a PDF and Help opens the viewer guide', async ({ page, context }) => {
	const viewer = await open(page);
	await fileBackstage(viewer, 'export');
	const downloading = page.waitForEvent('download');
	await viewer.locator('[data-backstage-action="export-pdf"]').first().click();
	const download = await downloading;
	expect(download.suggestedFilename()).toBe('layout.pdf');
	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
	const pdf = Buffer.concat(chunks).toString('latin1');
	expect(pdf.startsWith('%PDF-1.4')).toBe(true);
	expect(pdf).toContain('/MediaBox [0 0 612.00 792.00]');

	await context.route('https://christophervr.github.io/**', (route) =>
		route.fulfill({ body: '<title>Guide</title>', contentType: 'text/html' }),
	);
	await viewer.getByRole('tab', { name: 'Help', exact: true }).click();
	const opened = context.waitForEvent('page');
	await press(viewer, 'help');
	expect((await opened).url()).toBe('https://christophervr.github.io/ooxml/visio/');
});
