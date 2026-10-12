// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { VisioDocument, VisioEdit, VisioMaster } from 'ooxml-core/visio';
import { demoDocument } from 'ooxml-core/visio/ui';
import { ViewerController } from './controller';
import { createShapesWindow, setShapesDocument } from './shapes-window';
import { DOCUMENT_MASTER_LIMIT, shapesDocument } from './shapes-document';
import { wireStencil } from './viewer-stencil';
import type { CancellableEditor } from './worker-editor';

afterEach(() => {
	document.body.replaceChildren();
	localStorage.clear();
});

const shape = () => structuredClone(demoDocument.pages[0]!.shapes[0]!);
const master = (id: string, name: string, extra: Partial<VisioMaster> = {}): VisioMaster => ({
	id,
	name,
	width: 20,
	height: 20,
	rootCount: 1,
	oneDimensional: false,
	shapes: [shape()],
	...extra,
});
const drawing = (extra: Partial<VisioDocument> = {}): VisioDocument => ({
	...structuredClone(demoDocument),
	masters: [
		master('2', 'Process'),
		master('4', 'Dynamic connector', { oneDimensional: true }),
		master('7', 'Empty', { shapes: [] }),
	],
	...extra,
});

async function open(model: VisioDocument) {
	const edits: VisioEdit[][] = [];
	const editor: CancellableEditor = async (_bytes, commands) => {
		edits.push([...commands]);
		return {
			bytes: new Uint8Array([2]),
			document: structuredClone(model),
			changedParts: ['visio/pages/page1.xml'],
			diagnostics: [],
		};
	};
	const controller = new ViewerController(
		async () => structuredClone(model),
		() => {},
		editor,
	);
	const pane = createShapesWindow(document);
	const viewport = document.createElement('div');
	document.body.append(pane, viewport);
	const messages: string[] = [];
	const dispose = wireStencil(pane, viewport, controller, (message) => messages.push(message));
	await controller.load(new Uint8Array([1]));
	const sections = () =>
		[...pane.querySelectorAll<HTMLElement>('#shapes-sections [data-stencil]')].map((section) => [
			section.dataset.stencil,
			section.querySelector('.stencil-title')!.getAttribute('aria-expanded'),
		]);
	const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
	return { controller, pane, edits, messages, sections, settle, dispose };
}

describe('the Document Stencil in the Shapes window', () => {
	it('lists the drawing masters first and showing, with the other stencils folded', async () => {
		const ui = await open(drawing());
		expect(ui.sections()).toEqual([
			['document', 'true'],
			['basic', 'false'],
		]);
		const section = ui.pane.querySelector<HTMLElement>('[data-stencil="document"]')!;
		expect(section.querySelector('.stencil-title')!.textContent).toBe('Document Stencil');
		// It belongs to the drawing, so it cannot be closed.
		expect(section.querySelector('[data-close-stencil]')).toBeNull();
		const names = [...section.querySelectorAll('li')].map((item) => item.dataset.name);
		expect(names).toEqual(['Process', 'Dynamic connector', 'Empty']);
		// A drawn preview, cropped to the shape and without its text.
		const preview = section.querySelector('[data-master="document:2"] svg')!;
		expect(preview.getAttribute('class')).toBe('master-preview');
		expect(preview.querySelector('text, title')).toBeNull();
		expect(preview.querySelectorAll('path, ellipse, rect').length).toBeGreaterThan(0);
		const [x, y, width, height] = preview.getAttribute('viewBox')!.split(' ').map(Number);
		expect(width).toBe(height);
		expect(width).toBeLessThan(20);
		expect(Number.isFinite(x! + y!)).toBe(true);
		// No shapes to draw: the plain tile.
		expect(section.querySelector('[data-master="document:7"] svg path')).not.toBeNull();
		ui.dispose();
	});

	it('drops a master as an instance and refuses a connector master with its reason', async () => {
		const ui = await open(drawing());
		ui.pane.querySelector<HTMLButtonElement>('[data-master="document:2"]')!.click();
		await ui.settle();
		await ui.settle();
		expect(ui.edits).toHaveLength(1);
		const page = demoDocument.pages[0]!;
		expect(ui.edits[0]).toEqual([
			{
				type: 'insert-master-instance',
				pageId: page.id,
				shapeId: expect.stringMatching(/^[1-9]\d*$/),
				masterId: '2',
				x: page.width / 2,
				y: page.height / 2,
			},
		]);
		expect(ui.messages.at(-1)).toMatch(/^Process \d+ added from Document Stencil\.$/);
		const connector = ui.pane.querySelector<HTMLButtonElement>('[data-master="document:4"]')!;
		expect(connector.draggable).toBe(false);
		expect(connector.getAttribute('aria-disabled')).toBe('true');
		expect(connector.title).toMatch(/^Dynamic connector: A line or connector master/);
		connector.click();
		await ui.settle();
		expect(ui.edits).toHaveLength(1);
		expect(ui.messages.at(-1)).toMatch(/^Dynamic connector: A line or connector master/);
		ui.dispose();
	});

	it("drops Visio's Dynamic connector as a connector with free ends", async () => {
		const model = drawing();
		model.masters![1]!.dynamicConnector = true;
		const ui = await open(model);
		const connector = ui.pane.querySelector<HTMLButtonElement>('[data-master="document:4"]')!;
		expect(connector.getAttribute('aria-disabled')).not.toBe('true');
		connector.click();
		await ui.settle();
		await ui.settle();
		expect(ui.edits[0]).toEqual([
			expect.objectContaining({ type: 'insert-master-instance', masterId: '4' }),
		]);
		ui.dispose();
	});

	it('finds drawing masters in Search shapes', async () => {
		const ui = await open(drawing());
		const field = ui.pane.querySelector<HTMLInputElement>('.shapes-search-field')!;
		field.value = 'proc';
		field.dispatchEvent(new Event('input'));
		const found = [...ui.pane.querySelectorAll<HTMLElement>('#shapes-search li:not([hidden])')];
		expect(found[0]!.querySelector('[data-master]')!.getAttribute('data-master')).toBe(
			'document:2',
		);
		expect(found.length).toBeGreaterThan(1);
		expect(found.every((item) => /proc/i.test(item.dataset.name!))).toBe(true);
		expect(found[0]!.dataset.name).toBe('Process');
		ui.dispose();
	});

	it('shows the stencils a drawing docks, the first one showing, and follows the drawing', async () => {
		const ui = await open(
			drawing({ masters: [], stencils: ['BASFLO_U.vssx', 'NETWRK_U.vssx', 'ARROWS_M.VSSX'] }),
		);
		expect(ui.sections()).toEqual([
			['basic-flowchart', 'true'],
			['arrow-shapes', 'false'],
			['basic', 'false'],
		]);
		// Docked stencils are the drawing's, not a saved preference.
		expect(localStorage.length).toBe(0);
		const more = ui.pane.querySelector('[data-shapes-menu="more"]')!;
		expect(more.querySelector('[command="stencil:basic-flowchart"]')!.getAttribute('checked')).toBe(
			'true',
		);
		ui.pane.querySelector<HTMLButtonElement>('[data-close-stencil="basic-flowchart"]')!.click();
		expect(ui.sections().map(([id]) => id)).toEqual(['arrow-shapes', 'basic']);
		// A drawing without masters or stencils is the plain window again.
		const plain = structuredClone(demoDocument);
		ui.controller.setDocument(plain);
		expect(ui.sections()).toEqual([['basic', 'true']]);
		ui.dispose();
	});

	it('shows the docked stencil over the Document Stencil, and names stencil files it cannot open', async () => {
		const ui = await open(drawing({ stencils: ['BASFLO_U.vssx', 'NETWRK_U.vssx'] }));
		// As in Visio, the stencil the drawing docks is the one showing; its own masters fold.
		expect(ui.sections()).toEqual([
			['document', 'false'],
			['basic-flowchart', 'true'],
			['basic', 'false'],
		]);
		const missing = ui.pane.querySelector<HTMLElement>('[data-stencil-file="NETWRK_U.vssx"]')!;
		expect(missing.dataset.unavailable).toBe('');
		expect(missing.querySelector('.stencil-title')!.textContent).toBe('NETWRK_U.vssx');
		expect(missing.querySelector('.shapes-empty')!.textContent).toMatch(/not available here/);
		expect(missing.querySelector('[data-master]')).toBeNull();
		ui.dispose();
	});

	it('offers the drawing masters in Quick Shapes, without the ones that cannot be dropped', async () => {
		const ui = await open(drawing());
		ui.pane.querySelector<HTMLButtonElement>('#shapes-quick-toggle')!.click();
		const quick = [...ui.pane.querySelectorAll<HTMLElement>('#shapes-quick [data-master]')].map(
			(item) => item.dataset.master,
		);
		expect(quick.slice(0, 2)).toEqual(['document:2', 'document:7']);
		expect(quick).not.toContain('document:4');
		expect(quick).toContain('rectangle');
		ui.dispose();
	});

	it('keeps the open stencil open when an edit gives the drawing its first master', () => {
		const pane = createShapesWindow(document);
		document.body.append(pane);
		const sections = () =>
			[...pane.querySelectorAll<HTMLElement>('#shapes-sections [data-stencil]')].map((section) => [
				section.dataset.stencil,
				section.querySelector('.stencil-title')!.getAttribute('aria-expanded'),
			]);
		expect(sections()).toEqual([['basic', 'true']]);
		// The first drop of a built-in master copies it into the drawing: the same drawing, edited.
		setShapesDocument(pane, shapesDocument(drawing()), false);
		expect(sections()).toEqual([
			['document', 'false'],
			['basic', 'true'],
		]);
		// Opening that drawing afresh shows its own masters.
		setShapesDocument(pane, shapesDocument(drawing({ masters: [master('2', 'Process')] })), true);
		expect(sections()).toEqual([
			['document', 'true'],
			['basic', 'false'],
		]);
	});

	it('starts a newly opened drawing from its own stencils, whatever the last one showed', async () => {
		const ui = await open(drawing({ masters: [], stencils: ['BASFLO_U.vssx'] }));
		expect(ui.sections()).toEqual([
			['basic-flowchart', 'true'],
			['basic', 'false'],
		]);
		// A plain drawing replaces it: Basic Shapes is open again, with nothing left folded.
		ui.controller.setDocument(structuredClone(demoDocument));
		expect(ui.sections()).toEqual([['basic', 'true']]);
		// And another plain one, which lists the same stencils, is still a fresh start.
		ui.pane.querySelector<HTMLElement>('[data-stencil="basic"] .stencil-title')!.click();
		expect(ui.sections()).toEqual([['basic', 'false']]);
		ui.controller.setDocument(structuredClone(demoDocument));
		expect(ui.sections()).toEqual([['basic', 'true']]);
		ui.dispose();
	});

	it('bounds a very large document stencil', () => {
		const many = Array.from({ length: DOCUMENT_MASTER_LIMIT + 5 }, (_, index) =>
			master(String(index + 1), `Master ${index + 1}`, { shapes: [] }),
		);
		const result = shapesDocument(drawing({ masters: many }));
		expect(result.masters).toHaveLength(DOCUMENT_MASTER_LIMIT);
		expect(result.omitted).toBe(5);
		expect(shapesDocument(null).key).toBe('');
	});
});
