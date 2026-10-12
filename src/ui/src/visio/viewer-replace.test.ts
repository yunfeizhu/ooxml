import { afterEach, expect, it, vi } from 'vitest';
import {
	captureVisioClipboard,
	serializeVisioClipboard,
	editVsdx,
	parseVsdx,
	type VisioEdit,
} from 'ooxml-core/visio';
import { ViewerController } from './controller';
import { ViewerReplace } from './viewer-replace';
import { createFindBar, renderFindBar, wireFindBar, type FindBar } from './viewer-search';
import { registerViewerControls } from './office-ui';
import { replaceFixture } from './__fixtures__/replace-viewer';

afterEach(() => document.body.replaceChildren());
async function setup(
	protectedSecond = false,
	richSecond = false,
	gate?: () => Promise<void>,
	beforeRender?: (controller: ViewerController, bar: FindBar) => void,
) {
	registerViewerControls();
	const bytes = await replaceFixture(protectedSecond, richSecond),
		edits: VisioEdit[][] = [];
	const controller = new ViewerController(
		parseVsdx,
		() => {},
		async (source, commands) => {
			edits.push([...commands]);
			await gate?.();
			const result = await editVsdx(source, commands);
			return { ...result, document: await parseVsdx(result.bytes) };
		},
		async (source, pageId, shapeIds) =>
			serializeVisioClipboard(await captureVisioClipboard(source, pageId, shapeIds)),
	);
	await controller.load(bytes);
	const host = document.createElement('div');
	document.body.append(host);
	const root = host.attachShadow({ mode: 'open' }),
		bar = createFindBar(document);
	root.append(bar);
	const feedback: string[] = [];
	const replace = new ViewerReplace(bar, controller, (message) => feedback.push(message));
	const disposeFind = wireFindBar(bar, controller, () => {}),
		disposeReplace = replace.wire();
	beforeRender?.(controller, bar);
	const unsubscribe = controller.subscribe((state) => {
		renderFindBar(bar, state);
		replace.render(state);
	});
	replace.showReplace();
	const input = bar.shadowRoot!.querySelector<HTMLInputElement>('input')!;
	const replacement = () => bar.shadowRoot!.querySelector<HTMLTextAreaElement>('textarea')!;
	const query = (value: string) => {
		input.value = value;
		input.dispatchEvent(new Event('input'));
	};
	const text = (value: string) => {
		replacement().value = value;
		replacement().dispatchEvent(new Event('input'));
	};
	const scope = (value: string) => {
		const select = bar.shadowRoot!.querySelector<HTMLElement & { value: string }>(
			'office-ui-select',
		)!;
		select.value = value;
		select.dispatchEvent(new Event('change'));
	};
	const press = (action: string) =>
		bar.shadowRoot!.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.click();
	const done = () => vi.waitFor(() => expect(controller.state.edit.busy).toBe(false));
	const texts = () =>
		controller.state.document!.pages.map((page) =>
			page.shapes.map((shape) => shape.text.plainText),
		);
	const dispose = () => {
		unsubscribe();
		disposeFind();
		disposeReplace();
		controller.destroy();
	};
	await bar.updateComplete;
	return {
		controller,
		bar,
		replace,
		bytes,
		edits,
		feedback,
		query,
		text,
		scope,
		press,
		done,
		texts,
		dispose,
	};
}

it('replaces one occurrence then finds the next, preserving fields, checkbox and exact history', async () => {
	const ui = await setup();
	ui.query('cat');
	ui.text(' <&> Ω\n\n');
	expect(ui.bar.status).toBe('4 occurrences');
	ui.press('next');
	expect(ui.bar.status).toBe('1 of 4 occurrences');
	expect(ui.controller.state.selectedShape).toMatchObject({ id: '1', pageId: '1' });
	ui.press('replace');
	await ui.done();
	await vi.waitFor(() => expect(ui.bar.status).toBe('Replaced 1 occurrence.'));
	expect(ui.texts()[0]![0]).toBe(' <&> Ω\n\n cat CAT');
	expect(ui.bar.value).toBe('cat');
	expect(ui.bar.replacement).toBe(' <&> Ω\n\n');
	expect(ui.bar.matchCase).toBe(true);
	expect(ui.bar.matchCaseDisabled).toBe(true);
	ui.press('next');
	expect(ui.bar.status).toBe('2 of 3 occurrences');
	const accepted = ui.controller.exportVsdx().bytes;
	await ui.controller.undo();
	expect(ui.controller.exportVsdx().bytes).toEqual(ui.bytes);
	await ui.controller.redo();
	expect(ui.controller.exportVsdx().bytes).toEqual(accepted);
	expect(ui.bar.value).toBe('cat');
	expect(ui.bar.replacement).toBe(' <&> Ω\n\n');
	ui.dispose();
});

it('keeps a captured Selection scope across owned navigation and resets it after manual selection', async () => {
	const ui = await setup();
	ui.controller.selectAll();
	ui.scope('selection');
	ui.query('cat');
	ui.text('dog');
	expect(ui.bar.status).toBe('4 occurrences');
	ui.press('next');
	expect(ui.controller.state.selectedShapes.map((shape) => shape.id)).toEqual(['1']);
	ui.press('replace-all');
	await ui.done();
	await vi.waitFor(() => expect(ui.bar.status).toBe('Replaced 4 occurrences.'));
	expect(ui.edits.at(-1)).toHaveLength(2);
	expect(ui.texts()).toEqual([['dog dog CAT', 'dog Ω dog'], ['cat tail']]);
	await ui.controller.undo();
	ui.controller.selectShape({ id: '2', name: 'Two', pageId: '1' });
	expect(ui.bar.status).toBe('2 occurrences');
	ui.press('replace-all');
	await ui.done();
	expect(ui.texts()).toEqual([['cat cat CAT', 'dog Ω dog'], ['cat tail']]);
	ui.dispose();
});

it('applies AllPages atomically with page-qualified IDs and preserves source on unsupported matched targets', async () => {
	const ui = await setup();
	ui.scope('all-pages');
	ui.query('cat');
	ui.text('dog');
	expect(ui.bar.status).toBe('5 occurrences');
	ui.press('replace-all');
	await ui.done();
	expect(ui.edits.at(-1)?.map((edit) => 'shapeId' in edit && [edit.pageId, edit.shapeId])).toEqual([
		['1', '1'],
		['1', '2'],
		['2', '1'],
	]);
	expect(ui.texts()).toEqual([['dog dog CAT', 'dog Ω dog'], ['dog tail']]);
	await ui.controller.undo();
	expect(ui.controller.exportVsdx().bytes).toEqual(ui.bytes);
	ui.dispose();
	// Replacing inside a character run keeps the source runs, so rich text accepts it.
	const rich = await setup(false, true);
	rich.scope('all-pages');
	rich.query('cat');
	rich.text('dog');
	rich.press('replace-all');
	await rich.done();
	expect(rich.texts()).toEqual([['dog dog CAT', 'dog dog'], ['dog tail']]);
	rich.dispose();
	// A locked shape refuses any edit; rich text still refuses inserted paragraphs.
	for (const [locked, richText] of [
		[true, false],
		[false, true],
	]) {
		const refused = await setup(locked, richText);
		refused.scope('all-pages');
		refused.query('cat');
		refused.text(richText ? 'dog\n' : 'dog');
		expect(refused.bar.status).toBe('5 occurrences');
		refused.press('replace-all');
		await refused.done();
		const reason = locked ? 'protection is active' : 'cannot be edited';
		await vi.waitFor(() => expect(refused.bar.error).toContain(reason));
		expect(refused.controller.exportVsdx().bytes).toEqual(refused.bytes);
		expect(refused.controller.state.edit.canUndo).toBe(false);
		refused.controller.setZoom(2);
		expect(refused.bar.error).toContain(reason);
		refused.dispose();
	}
});

it('cancels close, newer selection, page and source intent before deferred edit acceptance', async () => {
	for (const action of ['close', 'selection', 'page', 'load']) {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const ui = await setup(false, false, () => gate);
		ui.query('cat');
		ui.text('dog');
		ui.press('replace-all');
		expect(ui.controller.state.edit.busy).toBe(true);
		if (action === 'close') ui.bar.close();
		if (action === 'selection') ui.controller.selectAll();
		if (action === 'page') ui.controller.setPage(1);
		if (action === 'load') await ui.controller.load(ui.bytes);
		release();
		await ui.done();
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(ui.controller.exportVsdx().bytes).toEqual(ui.bytes);
		expect(ui.controller.state.edit.canUndo).toBe(false);
		expect(ui.feedback).toEqual([]);
		ui.dispose();
	}
});

it('closing a superseded Replace leaves a newer unrelated edit on the same source running', async () => {
	let release!: () => void;
	const waiting = new Promise<void>((resolve) => {
		release = resolve;
	});
	let newer: Promise<void> | undefined;
	let started = false;
	const ui = await setup(
		false,
		false,
		() => waiting,
		(controller, bar) => {
			// Host callbacks precede the adapter's render subscriber and reenter the busy publication.
			controller.subscribe((state) => {
				if (!state.edit.busy || started) return;
				started = true;
				controller.cancelEdit();
				newer = controller.applyEdits([
					{
						type: 'replace-plain-text',
						pageId: '1',
						shapeId: '1',
						text: 'Unrelated edit',
					},
				]);
				bar.close();
			});
		},
	);
	ui.query('cat');
	ui.text('dog');
	ui.press('replace-all');
	expect(started).toBe(true);
	expect(ui.bar.open).toBe(false);
	expect(ui.controller.state.edit.busy).toBe(true);
	release();
	await newer;
	await ui.done();
	expect(ui.texts()).toEqual([['Unrelated edit', 'cat Ω cat'], ['cat tail']]);
	expect(ui.controller.state.edit.canUndo).toBe(true);
	expect(ui.feedback).toEqual([]);
	await ui.controller.undo();
	expect(ui.controller.exportVsdx().bytes).toEqual(ui.bytes);
	ui.dispose();
});

it('guards owned navigation callbacks and accepted edit callbacks from stale success', async () => {
	const ui = await setup();
	ui.query('cat');
	ui.text('dog');
	const unsubscribe = ui.controller.onEvent((type) => {
		if (type === 'shape-select') ui.controller.clearSelection();
	});
	ui.press('next');
	expect(ui.bar.status).toBe('4 occurrences');
	expect(ui.edits).toHaveLength(0);
	unsubscribe();
	const document = ui.controller.state.document;
	const cancel = ui.controller.subscribe((state) => {
		if (state.document !== document && state.selectedShapes.length) ui.controller.clearSelection();
	});
	ui.press('replace');
	await ui.done();
	expect(ui.texts()[0]![0]).toBe('dog cat CAT');
	expect(ui.feedback).toEqual([]);
	cancel();
	ui.dispose();
});

it('retains ordinary Find shape semantics and reports replacement bounds honestly', async () => {
	const ui = await setup();
	ui.query('CAT');
	expect(ui.bar.status).toBe('1 occurrence');
	ui.replace.showFind();
	expect(ui.controller.state.search.results).toHaveLength(3);
	expect(ui.bar.replaceMode).toBe(false);
	ui.replace.showReplace();
	ui.query('cat');
	ui.text('x'.repeat(32769));
	ui.press('replace');
	await vi.waitFor(() => expect(ui.bar.error).toMatch(/limits/));
	expect(ui.edits).toHaveLength(0);
	ui.dispose();
});

it('does not announce accepted operations superseded by refreshing occurrence getters', async () => {
	const ui = await setup();
	ui.query('cat');
	ui.text('dog');
	const original = ui.controller.getTextReplaceOccurrences.bind(ui.controller),
		document = ui.controller.state.document;
	vi.spyOn(ui.controller, 'getTextReplaceOccurrences').mockImplementation((token, query) => {
		const matches = original(token, query);
		if (ui.controller.state.document !== document) ui.controller.setDocument(null);
		return matches;
	});
	ui.press('replace');
	await ui.done();
	await vi.waitFor(() => expect(ui.controller.state.document).toBe(null));
	expect(ui.feedback).toEqual([]);
	ui.dispose();
});
