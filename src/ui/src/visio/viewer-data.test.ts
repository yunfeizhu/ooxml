// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { setupFormattingViewer } from './__fixtures__/formatting-viewer';
// The Data tab loads the workbook reader on first use; load it up front so waits stay short.
import 'ooxml-core/xlsx/load';

afterEach(() => {
	document.body.replaceChildren();
	vi.restoreAllMocks();
	delete (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker;
});
const csv = (text: string, name = 'servers.csv') => new File([text], name, { type: 'text/csv' });
async function setup() {
	const view = await setupFormattingViewer();
	const q = <T extends Element = HTMLElement>(selector: string) =>
		view.root.querySelector<T>(selector)!;
	const field = (dialog: string, name: string, value: string | boolean) => {
		const input = q<HTMLInputElement>(`.${dialog} [name="${name}"]`);
		if (typeof value === 'boolean') input.checked = value;
		else input.value = value;
		input.dispatchEvent(new Event('change'));
	};
	const dialogButton = (dialog: string, label: string) =>
		q(`.${dialog}`)
			.querySelector(`[label="${label}"]`)!
			.shadowRoot!.querySelector('button')!
			.click();
	const data = (command: Parameters<typeof view.commands.run>[0] extends infer A ? A : never) =>
		view.commands.run(command);
	const pane = () => q('.external-data');
	const choose = async (file: File) => {
		const input = q<HTMLInputElement>('[data-import-data]');
		vi.spyOn(input, 'click').mockImplementation(() => {
			Object.defineProperty(input, 'files', { configurable: true, value: [file] });
			input.dispatchEvent(new Event('change'));
		});
	};
	const shape = () => view.controller.state.document!.pages[0]!.shapes[0]!;
	return { ...view, q, field, dialogButton, data, pane, choose, shape };
}

it('defines, edits and deletes Shape Data through the Define Shape Data dialog', async () => {
	const view = await setup();
	view.selection();
	view.data({ type: 'data', command: 'define-shape-data' });
	expect(view.q<HTMLElement & { open: boolean }>('.shape-data-dialog').open).toBe(true);
	view.field('shape-data-dialog', 'label', 'Cost center');
	view.field('shape-data-dialog', 'dataType', 'number');
	view.field('shape-data-dialog', 'value', '42');
	view.dialogButton('shape-data-dialog', 'OK');
	await vi.waitFor(() => expect(view.edits.at(-1)?.[0]?.type).toBe('set-shape-data'));
	await view.done();
	expect(view.edits.at(-1)![0]).toMatchObject({
		row: 'Cost_center',
		data: { type: 'number', value: '42' },
	});
	expect(view.shape().shapeData).toEqual([
		expect.objectContaining({ name: 'Cost_center', label: 'Cost center', value: 42 }),
	]);
	view.data({ type: 'data', command: 'define-shape-data' });
	expect(view.q<HTMLSelectElement>('.shape-data-dialog [name="row"]').value).toBe('Cost_center');
	expect(view.q<HTMLInputElement>('.shape-data-dialog [name="value"]').value).toBe('42');
	view.field('shape-data-dialog', 'value', 'not a number');
	view.dialogButton('shape-data-dialog', 'OK');
	await vi.waitFor(() =>
		expect(view.q('.shape-data-dialog [role="alert"]').textContent).toMatch(/Number value/),
	);
	view.dialogButton('shape-data-dialog', 'Delete');
	await vi.waitFor(() => expect(view.shape().shapeData).toEqual([]));
	await view.controller.undo();
	expect(view.shape().shapeData).toHaveLength(1);
	view.dispose();
});

it('quick imports a CSV, shows the External Data window and links a row by drag and by selection', async () => {
	const view = await setup();
	expect(view.button('quick-import').disabled).toBe(false);
	expect(view.button('refresh-all').disabled).toBe(true);
	await view.choose(csv('Name,Load\nImport test,20\nOther,80\n'));
	view.data({ type: 'data', command: 'quick-import' });
	await vi.waitFor(() => expect(view.controller.state.document?.dataRecordsets).toHaveLength(1), {
		timeout: 15_000,
	});
	await view.done();
	expect(view.edits.at(-1)![0]).toMatchObject({
		type: 'import-data-recordset',
		name: 'servers.csv',
	});
	expect(view.pane().hidden).toBe(false);
	expect(
		view.q<HTMLElement & { checked: boolean }>('[data-check="external-data-window"]').checked,
	).toBe(true);
	const rows = () => [...view.pane().querySelectorAll<HTMLTableRowElement>('tbody tr')];
	expect(rows().map((row) => row.textContent)).toEqual(['Import test20', 'Other80']);
	// Drag the second row onto the shape.
	const target = document.createElementNS('http://www.w3.org/2000/svg', 'g');
	target.dataset.shapeId = '1';
	target.dataset.pageId = '1';
	view.viewport.append(target);
	const store = new Map<string, string>();
	const transfer = {
		types: [] as string[],
		setData: (type: string, value: string) => (store.set(type, value), transfer.types.push(type)),
		getData: (type: string) => store.get(type) ?? '',
		effectAllowed: '',
		dropEffect: '',
	};
	const drag = (node: Element, type: string) => {
		const event = new Event(type, { bubbles: true, cancelable: true });
		Object.defineProperty(event, 'dataTransfer', { value: transfer });
		node.dispatchEvent(event);
		return event;
	};
	drag(rows()[1]!, 'dragstart');
	expect(drag(target, 'dragover').defaultPrevented).toBe(true);
	drag(target, 'drop');
	await vi.waitFor(() => expect(view.edits.at(-1)?.[0]?.type).toBe('link-data-rows'));
	await view.done();
	expect(view.shape().shapeData!.map((row) => [row.name, row.value, row.dataLinked])).toEqual([
		['Name', 'Other', true],
		['Load', 80, true],
	]);
	expect(rows()[1]!.textContent).toBe('1Other80');
	// Select the first row and link it to the selected shape with the window's command.
	view.selection();
	rows()[0]!.click();
	view.pane().querySelector<HTMLButtonElement>('[data-data-action="link"]')!.click();
	await vi.waitFor(() => expect(view.shape().shapeData![0]!.value).toBe('Import test'));
	await view.done();
	expect(rows()[0]!.hasAttribute('data-current')).toBe(true);
	view.pane().querySelector<HTMLButtonElement>('[data-data-action="unlink"]')!.click();
	await vi.waitFor(() =>
		expect(view.controller.state.document!.dataRecordsets![0]!.links).toEqual([]),
	);
	await view.done();
	view.data({ type: 'data', command: 'external-data-window' });
	expect(view.pane().hidden).toBe(true);
	// The window is the shared task pane: its title, and its close button hides it again.
	view.data({ type: 'data', command: 'external-data-window' });
	expect(view.pane().localName).toBe('office-ui-task-pane');
	expect(view.pane().shadowRoot!.querySelector('.title')!.textContent).toBe('External Data');
	const close = view.pane().shadowRoot!.querySelector<HTMLButtonElement>('.close')!;
	expect(close.getAttribute('aria-label')).toBe('Close External Data window');
	close.click();
	expect(view.pane().hidden).toBe(true);
	expect(
		view.q<HTMLElement & { checked: boolean }>('[data-check="external-data-window"]').checked,
	).toBe(false);
	view.dispose();
});

it('custom imports a chosen range, links automatically and refreshes through a saved file handle', async () => {
	const view = await setup();
	let text = 'Server,Load\nImport test,20\nOther,80\n';
	const handle = { getFile: async () => csv(text) };
	(window as unknown as { showOpenFilePicker: unknown }).showOpenFilePicker = vi.fn(async () => [
		handle,
	]);
	view.data({ type: 'data', command: 'custom-import' });
	await vi.waitFor(
		() => expect(view.q<HTMLElement & { open: boolean }>('.data-import-dialog').open).toBe(true),
		{ timeout: 15_000 },
	);
	view.field('data-import-dialog', 'name', 'Loads');
	view.field('data-import-dialog', 'range', 'A1:B2');
	view.dialogButton('data-import-dialog', 'Import');
	await vi.waitFor(() =>
		expect(view.controller.state.document?.dataRecordsets?.[0]?.rows).toHaveLength(1),
	);
	await view.done();
	expect(view.controller.state.document!.dataRecordsets![0]!.name).toBe('Loads');
	view.pane().querySelector<HTMLButtonElement>('[data-data-action="auto-link"]')!.click();
	view.field('data-link-dialog', 'shapeField', 'name');
	view.dialogButton('data-link-dialog', 'Link');
	await vi.waitFor(() => expect(view.shape().shapeData?.[1]?.value).toBe(20));
	await view.done();
	text = 'Server,Load\nImport test,55\n';
	view.data({ type: 'data', command: 'refresh' });
	await vi.waitFor(() => expect(view.shape().shapeData?.[1]?.value).toBe(55), { timeout: 5000 });
	await view.done();
	expect(view.edits.at(-1)![0]).toMatchObject({ type: 'refresh-data-recordset', recordsetId: '0' });
	view.pane().querySelector<HTMLButtonElement>('[data-data-action="remove"]')!.click();
	await vi.waitFor(() => expect(view.controller.state.document!.dataRecordsets).toBeUndefined());
	expect(view.shape().shapeData?.[1]?.value).toBe(55);
	view.dispose();
});

it('applies, replaces and removes data graphics and inserts a Color by Value legend', async () => {
	const view = await setup();
	expect(view.button('graphic-text').disabled).toBe(true);
	await view.controller.applyEdits([
		{
			type: 'set-shape-data',
			pageId: '1',
			shapeId: '1',
			row: 'Status',
			data: { label: 'Status', prompt: '', type: 'string', format: '', value: 'Up' },
		},
	]);
	expect(view.button('graphic-text').disabled).toBe(false);
	expect(
		view.root.querySelector<HTMLElement & { disabled: boolean }>('[data-menu="insert-legend"]')!
			.disabled,
	).toBe(true);
	view.data({ type: 'data', command: 'graphic-text' });
	view.dialogButton('data-graphics-dialog', 'Apply');
	await vi.waitFor(() => expect(view.controller.state.document!.pages[0]!.shapes).toHaveLength(2));
	await view.done();
	expect(view.controller.state.document!.pages[0]!.shapes[1]!.text.plainText).toBe('Up');
	view.data({ type: 'data', command: 'graphic-color' });
	view.dialogButton('data-graphics-dialog', 'Apply');
	await vi.waitFor(() => expect(view.shape().style.fill).toBe('#5b9bd5'));
	await view.done();
	view.data({ type: 'data', command: 'legend' });
	await vi.waitFor(() =>
		expect(view.controller.state.document!.pages[0]!.shapes.at(-1)!.kind).toBe('group'),
	);
	await view.done();
	view.data({ type: 'data', command: 'graphic-remove' });
	await vi.waitFor(() => expect(view.controller.state.document!.pages[0]!.shapes).toHaveLength(1));
	await view.done();
	expect(view.shape().style.fill).toBe('#daefe6');
	await view.controller.undo();
	expect(view.controller.state.document!.pages[0]!.shapes).toHaveLength(3);
	view.dispose();
});
