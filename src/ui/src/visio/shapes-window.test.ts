import { afterEach, describe, expect, it } from 'vitest';
import type { VisioEdit } from 'ooxml-core/visio';
import { ViewerController } from './controller';
import { demoDocument } from 'ooxml-core/visio/ui';
import { BASIC_SHAPES, createShapesWindow } from './shapes-window';
import { wireStencil } from './viewer-stencil';
import type { CancellableEditor } from './worker-editor';

afterEach(() => {
	document.body.replaceChildren();
	localStorage.clear();
});

async function setup(source = true, delay = 0) {
	const edits: VisioEdit[][] = [];
	const editor: CancellableEditor = async (_bytes, commands) => {
		edits.push([...commands]);
		if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
		return {
			bytes: new Uint8Array([2]),
			document: structuredClone(demoDocument),
			changedParts: ['visio/pages/page1.xml'],
			diagnostics: [],
		};
	};
	const controller = new ViewerController(
		async () => structuredClone(demoDocument),
		() => {},
		editor,
	);
	if (source) await controller.load(new Uint8Array([1]));
	else controller.setDocument(structuredClone(demoDocument));
	const pane = createShapesWindow(document);
	const viewport = document.createElement('div');
	document.body.append(pane, viewport);
	const messages: string[] = [];
	const dispose = wireStencil(pane, viewport, controller, (message) => messages.push(message));
	const master = (id: string) => pane.querySelector<HTMLButtonElement>(`[data-master="${id}"]`)!;
	const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
	return { controller, pane, edits, messages, master, settle, dispose };
}

describe("Visio's Shapes window", () => {
	it('shows the Basic Shapes stencil with every master enabled', async () => {
		const { pane } = await setup();
		expect(pane.querySelector('.stencil-title')!.textContent).toBe('Basic Shapes');
		const masters = [...pane.querySelectorAll<HTMLButtonElement>('#shapes-stencils [data-master]')];
		expect(masters).toHaveLength(BASIC_SHAPES.length);
		for (const master of masters) {
			expect(master.draggable).toBe(true);
			expect(master.hasAttribute('aria-disabled')).toBe(false);
			expect(master.title).not.toMatch(/not available/);
		}
		// More Shapes and Quick Shapes work over the built-in stencils.
		expect(
			[...pane.querySelectorAll<HTMLButtonElement>('.shapes-row')].map((row) => row.disabled),
		).toEqual([false, false]);
	});

	it('adds masters at the page centre through core', async () => {
		const { controller, edits, master, messages, settle } = await setup();
		const page = demoDocument.pages[0]!;
		// An instance of the stencil master, pinned at the page centre (the size is the master's).
		const drop = (id: string) => ({
			type: 'drop-stencil-master',
			pageId: page.id,
			shapeId: expect.any(String),
			master: id,
			x: page.width / 2,
			y: page.height / 2,
		});
		master('rectangle').click();
		await settle();
		master('circle').click();
		await settle();
		master('star').click();
		await settle();
		// Each master is created with Visio's default theme look in the same history step.
		const style = (shapeId: string) => ({
			type: 'format-shape',
			pageId: page.id,
			shapeId,
			quickStyle: { color: 100, matrix: 4 },
		});
		expect(edits.map(([created]) => created)).toEqual([
			drop('rectangle'),
			drop('circle'),
			drop('star'),
		]);
		for (const [created, styled, ...rest] of edits) {
			expect(styled).toEqual(style((created as { shapeId: string }).shapeId));
			expect(rest).toEqual([]);
		}
		expect(messages.at(-1)).toMatch(/^5-point star .+ added from Basic Shapes\.$/);
		expect(controller.state.edit.canUndo).toBe(true);
	});

	it('adds a master dropped while the previous one is still saving', async () => {
		const { master, edits, messages } = await setup(true, 30);
		master('square').click();
		master('triangle').click();
		await new Promise((resolve) => setTimeout(resolve, 200));
		expect(edits.map(([created]) => (created as { master?: string }).master)).toEqual([
			'square',
			'triangle',
		]);
		expect(messages.at(-1)).toMatch(/^Triangle .+ added from Basic Shapes\.$/);
	});

	it('explains read-only documents instead of editing them', async () => {
		const { master, edits, messages, settle } = await setup(false);
		master('rectangle').click();
		await settle();
		expect(edits).toEqual([]);
		expect(messages).toEqual(['Open a .vsdx file to add shapes.']);
	});

	it('searches from the box under the title and filters every stencil by name', async () => {
		const { pane } = await setup();
		const stencils = pane.querySelector<HTMLElement>('#shapes-stencils')!;
		const results = pane.querySelector<HTMLElement>('#shapes-search')!;
		const field = pane.querySelector<HTMLInputElement>('.shapes-search-field')!;
		expect(field.placeholder).toBe('Search shapes');
		expect(pane.querySelector('[data-shapes-view]')).toBeNull();
		expect([stencils.hidden, results.hidden]).toEqual([false, true]);
		field.value = 'star';
		field.dispatchEvent(new Event('input'));
		// Typing swaps the stencils for the results; clearing brings them back.
		expect([stencils.hidden, results.hidden]).toEqual([true, false]);
		const visible = () =>
			[...pane.querySelectorAll<HTMLElement>('#shapes-search li')]
				.filter((item) => !item.hidden)
				.map((item) => item.dataset.name);
		// Search covers the built-in stencils too, open or not.
		expect(visible()).toEqual(['5-point star', 'Start/End']);
		field.value = 'arrow';
		field.dispatchEvent(new Event('input'));
		expect(visible()).toContain('Curved arrow');
		field.value = 'zzz';
		field.dispatchEvent(new Event('input'));
		expect(pane.querySelector<HTMLElement>('.shapes-empty')!.hidden).toBe(false);
		field.value = '';
		field.dispatchEvent(new Event('input'));
		expect([stencils.hidden, results.hidden]).toEqual([false, true]);
	});
});
