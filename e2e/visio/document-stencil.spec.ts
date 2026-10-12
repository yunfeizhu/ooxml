import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import type { VisioViewerElement } from 'ooxml-ui/visio';
import { createVsdxFixture } from './fixture.mjs';
import { openDemo } from './demo-page';
import { history } from './ribbon';

const NS = 'http://schemas.microsoft.com/office/visio/2012/main';
const REL = 'http://schemas.microsoft.com/visio/2010/relationships/';
const RELS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const cell = (name: string, value: number) => `<Cell N="${name}" V="${value}"/>`;
const box = `${cell('PinX', 2)}${cell('PinY', 2)}${cell('Width', 1)}${cell('Height', 0.75)}${cell('LocPinX', 0.5)}${cell('LocPinY', 0.375)}`;
const outline = `<Section N="Geometry" IX="0"><Row T="RelMoveTo" IX="1">${cell('X', 0)}${cell('Y', 0)}</Row><Row T="RelLineTo" IX="2">${cell('X', 1)}${cell('Y', 0)}</Row><Row T="RelLineTo" IX="3">${cell('X', 1)}${cell('Y', 1)}</Row><Row T="RelLineTo" IX="4">${cell('X', 0)}${cell('Y', 1)}</Row><Row T="RelLineTo" IX="5">${cell('X', 0)}${cell('Y', 0)}</Row></Section>`;

/** An original drawing with a document stencil of two masters: a box and a 1-D line. */
async function drawingWithMasters(): Promise<Buffer> {
	const zip = await JSZip.loadAsync(await createVsdxFixture('Existing shape'));
	zip.file(
		'visio/_rels/document.xml.rels',
		`<Relationships xmlns="${RELS}"><Relationship Id="rId1" Type="${REL}pages" Target="pages/pages.xml"/><Relationship Id="rId2" Type="${REL}masters" Target="masters/masters.xml"/></Relationships>`,
	);
	zip.file(
		'visio/masters/masters.xml',
		`<Masters xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><Master ID="2" NameU="Step" Name="Step"><PageSheet>${cell('PageWidth', 4)}${cell('PageHeight', 4)}</PageSheet><Rel r:id="rId1"/></Master><Master ID="4" NameU="Link" Name="Link"><Rel r:id="rId2"/></Master></Masters>`,
	);
	zip.file(
		'visio/masters/_rels/masters.xml.rels',
		`<Relationships xmlns="${RELS}"><Relationship Id="rId1" Type="${REL}master" Target="master1.xml"/><Relationship Id="rId2" Type="${REL}master" Target="master2.xml"/></Relationships>`,
	);
	zip.file(
		'visio/masters/master1.xml',
		`<MasterContents xmlns="${NS}"><Shapes><Shape ID="5" Type="Shape">${box}${cell('FillForegnd', 0)}${outline}<Text>Step</Text></Shape></Shapes></MasterContents>`,
	);
	zip.file(
		'visio/masters/master2.xml',
		`<MasterContents xmlns="${NS}"><Shapes><Shape ID="5" Type="Shape">${cell('BeginX', 1)}${cell('BeginY', 1)}${cell('EndX', 2)}${cell('EndY', 1)}${box}</Shape></Shapes></MasterContents>`,
	);
	return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

const sections = (viewer: ReturnType<import('@playwright/test').Page['locator']>) =>
	viewer
		.locator('#shapes-sections [data-stencil]')
		.evaluateAll((nodes) =>
			nodes.map((node) => [
				(node as HTMLElement).dataset.stencil,
				node.querySelector('.stencil-title')!.getAttribute('aria-expanded'),
			]),
		);

test('the sample flowchart opens with Basic Flowchart Shapes showing', async ({ page }) => {
	await page.addInitScript(() => localStorage.clear());
	await page.setViewportSize({ width: 1440, height: 1000 });
	await openDemo(page);
	const viewer = page.locator('visio-viewer');
	await expect(viewer.locator('svg.paper')).toContainText('Release workflow');
	await expect
		.poll(() => sections(viewer))
		// The sample's shapes are instances, so it has a Document Stencil; as in Visio the docked
		// stencil is the one showing.
		.toEqual([
			['document', 'false'],
			['basic-flowchart', 'true'],
			['basic', 'false'],
		]);
	const flowchart = viewer.locator('[data-stencil="basic-flowchart"]');
	// Visio's fourteen masters, in its order.
	await expect(flowchart.locator('li')).toHaveCount(14);
	await expect(flowchart.locator('li').first()).toHaveAttribute('data-name', 'Process');
	await expect(flowchart.locator('li').nth(2)).toHaveAttribute('data-name', 'Subprocess');
	await expect(viewer.locator('#shapes-stencils [data-master="rectangle"]')).toBeHidden();
	const shapes = viewer.locator('svg.paper > g > [data-shape-id]');
	const before = await shapes.count();
	await flowchart
		.locator('[data-master="flowchart-database"]')
		.dragTo(viewer.locator('svg.paper'), { targetPosition: { x: 120, y: 120 } });
	await expect(viewer.locator('[data-status]')).toHaveText(
		/Database .+ added from Basic Flowchart Shapes/,
	);
	await expect(shapes).toHaveCount(before + 1);
	// The drop is an instance of a master the drawing now carries, named as Visio names it.
	const dropped = await viewer.evaluate((node) => {
		const model = (node as VisioViewerElement).controller.state.document!;
		const shape = model.pages[0]!.shapes.at(-1)!;
		return {
			name: shape.name,
			master: model.masters!.find((master) => master.id === shape.masterId)?.name,
			masters: model.masters!.map((master) => master.name),
		};
	});
	expect(dropped).toEqual({
		name: 'Database',
		master: 'Database',
		masters: ['Process', 'Decision', 'Rectangle', 'Database'],
	});
	// Editing does not refold what is showing.
	await expect
		.poll(() => sections(viewer))
		.toEqual([
			['document', 'false'],
			['basic-flowchart', 'true'],
			['basic', 'false'],
		]);
	// The folded stencil opens from its title.
	await viewer.locator('[data-stencil="basic"] .stencil-title').click();
	await expect(viewer.locator('#shapes-stencils [data-master="rectangle"]')).toBeVisible();
	await page.screenshot({ path: test.info().outputPath('sample-stencils.png') });
});

test('a drawing lists its own masters and drops them as master instances', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.addInitScript(() => localStorage.clear());
	await page.setViewportSize({ width: 1440, height: 1000 });
	await openDemo(page);
	const viewer = page.locator('visio-viewer');
	await page.locator('#file').setInputFiles({
		name: 'document-stencil.vsdx',
		mimeType: 'application/vnd.ms-visio.drawing',
		buffer: await drawingWithMasters(),
	});
	await expect(page.locator('#file-name')).toHaveText('document-stencil.vsdx');
	await expect
		.poll(() => sections(viewer))
		.toEqual([
			['document', 'true'],
			['basic', 'false'],
		]);
	const stencil = viewer.locator('[data-stencil="document"]');
	await expect(stencil.locator('.stencil-title')).toHaveText('Document Stencil');
	await expect(stencil.locator('li')).toHaveCount(2);
	const step = stencil.locator('[data-master="document:2"]');
	await expect(step).toHaveText('Step');
	// The preview is the master drawn alone, without its text.
	await expect(step.locator('svg.master-preview path').first()).toBeAttached();
	await expect(step.locator('svg text')).toHaveCount(0);
	const link = stencil.locator('[data-master="document:4"]');
	await expect(link).toHaveAttribute('aria-disabled', 'true');
	await expect(link).toHaveAttribute('title', /not built like Visio's Dynamic connector/);

	const shapes = viewer.locator('svg.paper > g > [data-shape-id]');
	await expect(shapes).toHaveCount(1);
	await step.dragTo(viewer.locator('svg.paper'), { targetPosition: { x: 150, y: 150 } });
	const status = viewer.locator('[data-status]');
	await expect(status).toHaveText(/Step 2 added from Document Stencil/);
	await expect(shapes).toHaveCount(2);
	// The instance draws what it inherits and is selected, like any new shape.
	await expect(viewer.locator('svg.paper [data-shape-id="2"]')).toContainText('Step');
	expect(
		await viewer.evaluate((node) =>
			(node as VisioViewerElement).controller.state.selectedShapes.map((shape) => shape.id),
		),
	).toEqual(['2']);
	const saved = await viewer.evaluate((node) => [
		...(node as VisioViewerElement).controller.exportVsdx().bytes,
	]);
	const zip = await JSZip.loadAsync(Buffer.from(saved));
	// As Visio writes a dropped master: the reference, its name and the pin; the master's size is
	// kept beside them as inherited caches.
	expect(await zip.file('visio/pages/page1.xml')!.async('string')).toMatch(
		/<Shape ID="2" Type="Shape" Master="2" NameU="Step" Name="Step"><Cell N="PinX" V="[\d.]+"\/><Cell N="PinY" V="[\d.]+"\/>(<Cell N="(Width|Height|LocPinX|LocPinY)" V="[\d.]+" U="IN" F="Inh"\/>)*<\/Shape>/,
	);
	expect(await zip.file('visio/pages/_rels/page1.xml.rels')!.async('string')).toContain(
		'relationships/master" Target="../masters/master1.xml"',
	);
	// The connector master says why it is not dropped.
	await link.click({ force: true });
	await expect(status).toHaveText(/Link: A line or connector master/);
	await expect(shapes).toHaveCount(2);
	// One undo removes the instance; Search finds the drawing's masters.
	await history(viewer, 'Undo').click();
	await expect(shapes).toHaveCount(1);
	await viewer.locator('.shapes-search-field').fill('step');
	await expect(viewer.locator('#shapes-search li:not([hidden]) [data-master]')).toHaveAttribute(
		'data-master',
		'document:2',
	);
	await page.screenshot({ path: test.info().outputPath('document-stencil.png') });
	expect(errors).toEqual([]);
});
