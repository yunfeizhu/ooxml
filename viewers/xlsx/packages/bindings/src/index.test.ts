// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { XLSX_EDITOR_EVENTS, XlsxEditorElement } from 'xlsx-web-component';
import {
	EDITOR_EVENT_NAMES,
	EDITOR_PROP_KEYS,
	deferredHandle,
	eventOptions,
	mountEditor,
	pickEditorProps,
} from './index';
import { emit, fakeWorkbook, stubElementMethods } from './test-support';

afterEach(() => {
	document.body.replaceChildren();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});
const newHost = () => {
	const host = document.createElement('div');
	document.body.append(host);
	return host;
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('shared binding lifecycle', () => {
	it('creates one <xlsx-editor> in the host and calls onReady with it', () => {
		const host = newHost();
		const onReady = vi.fn();
		const binding = mountEditor(host, { onReady });
		expect(host.querySelectorAll('xlsx-editor')).toHaveLength(1);
		expect(binding.element).toBeInstanceOf(XlsxEditorElement);
		expect(onReady).toHaveBeenCalledWith(binding.element);
		binding.update({ onReady });
		expect(onReady).toHaveBeenCalledTimes(1);
		binding.destroy();
	});

	it('forwards theme and defaults back to auto', () => {
		const binding = mountEditor(newHost(), { theme: 'dark' });
		expect(binding.element.theme).toBe('dark');
		expect(binding.element.getAttribute('theme')).toBe('dark');
		binding.update({});
		expect(binding.element.theme).toBe('auto');
		binding.destroy();
	});

	it('does not overwrite edits on unrelated parent updates or model feedback', () => {
		const source = fakeWorkbook('Source');
		const change = vi.fn();
		const binding = mountEditor(newHost(), { workbook: source, onWorkbookChange: change });
		expect(binding.element.workbook).toBe(source);
		const edited = fakeWorkbook('Edited');
		binding.element.workbook = edited;
		emit(binding.element, 'workbook-change', { workbook: edited });
		expect(change).toHaveBeenCalledWith(edited);
		binding.update({ workbook: source, readOnly: true });
		expect(binding.element.workbook).toBe(edited);
		expect(binding.element.readOnly).toBe(true);
		binding.update({ workbook: edited });
		expect(binding.element.workbook).toBe(edited);
		const replacement = fakeWorkbook('Replacement');
		binding.update({ workbook: replacement });
		expect(binding.element.workbook).toBe(replacement);
		binding.destroy();
	});

	it('forwards latest callbacks and removes listeners and owned element on destroy', () => {
		const host = newHost();
		const sentinel = document.createElement('span');
		host.append(sentinel);
		const first = vi.fn();
		const second = vi.fn();
		const error = vi.fn();
		const binding = mountEditor(host, { onWorkbookChange: first });
		binding.update({ onWorkbookChange: second, onWorkbookError: error });
		const workbook = fakeWorkbook();
		const failure = new Error('Expected test failure');
		emit(binding.element, 'workbook-change', { workbook });
		emit(binding.element, 'workbook-error', { error: failure, message: failure.message });
		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledWith(workbook);
		expect(error).toHaveBeenCalledWith(failure);
		binding.destroy();
		binding.destroy();
		emit(binding.element, 'workbook-change', { workbook });
		expect(second).toHaveBeenCalledTimes(1);
		expect(host.children).toHaveLength(1);
		expect(host.firstChild).toBe(sentinel);
	});
});

describe('shared option keys', () => {
	it('only lists real element events and props', () => {
		for (const name of EDITOR_EVENT_NAMES) expect(XLSX_EDITOR_EVENTS).toContain(name);
		const binding = mountEditor(newHost());
		const props = ['readOnly', 'locale', 'theme', 'fileName', 'authorName', 'workbook'];
		for (const key of [
			...props,
			'showToolbar',
			'showFormulaBar',
			'hiddenActions',
			'themeColors',
			'collaboration',
		])
			expect(key in binding.element, key).toBe(true);
		expect(EDITOR_PROP_KEYS).toEqual(expect.arrayContaining([...props, 'bytes', 'src']));
		binding.destroy();
	});

	it('picks exactly the shared props and maps event handlers', () => {
		const workbook = fakeWorkbook();
		const extra = { workbook, readOnly: true, locale: 'fr', other: 1 };
		expect(pickEditorProps(extra)).toEqual({ workbook, readOnly: true, locale: 'fr' });
		const change = vi.fn();
		const options = eventOptions({
			'workbook-change': change,
			'workbook-error': undefined,
			'selection-change': undefined,
			'dirty-change': undefined,
			'readonly-change': undefined,
			'ribbon-customize': undefined,
			'office-ribbon-add-in': undefined,
			'collaboration-change': undefined,
		});
		options.onWorkbookChange?.(workbook);
		expect(change).toHaveBeenCalledWith(workbook);
		expect(options.onWorkbookError).toBeUndefined();
		expect(options.onReady).toBeUndefined();
	});
});

describe('props, attributes and defaults', () => {
	it('forwards toolbar, formula bar, author, hidden actions and theme colours', () => {
		const themeColors = { primary: '#1f9d63' };
		const binding = mountEditor(newHost(), {
			showToolbar: false,
			showFormulaBar: false,
			authorName: 'Ada',
			hiddenActions: ['bold'],
			themeColors,
		});
		const element = binding.element;
		expect(element.showToolbar).toBe(false);
		expect(element.showFormulaBar).toBe(false);
		expect(element.getAttribute('show-toolbar')).toBe('false');
		expect(element.getAttribute('show-formula-bar')).toBe('false');
		expect(element.authorName).toBe('Ada');
		expect(element.hiddenActions).toEqual(['bold']);
		expect(element.themeColors).toEqual(themeColors);
		binding.update({});
		expect(element.showToolbar).toBe(true);
		expect(element.showFormulaBar).toBe(true);
		expect(element.authorName).toBe('Author');
		expect(element.hiddenActions).toEqual([]);
		expect(element.themeColors).toEqual({});
		binding.destroy();
	});

	it('forwards fileName only when the parent changes it', () => {
		const binding = mountEditor(newHost(), { fileName: 'Budget.xlsx' });
		expect(binding.element.fileName).toBe('Budget.xlsx');
		binding.element.fileName = 'Opened.xlsx';
		binding.update({ fileName: 'Budget.xlsx', readOnly: true });
		expect(binding.element.fileName).toBe('Opened.xlsx');
		binding.update({ fileName: 'Renamed.xlsx' });
		expect(binding.element.fileName).toBe('Renamed.xlsx');
		binding.destroy();
	});

	it('normalises de, es, fr and zh-CN locales and their region variants', () => {
		const binding = mountEditor(newHost(), { locale: 'de-DE' });
		expect(binding.element.locale).toBe('de');
		for (const [input, expected] of [
			['es-MX', 'es'],
			['zh-Hans', 'zh-CN'],
			['zh-TW', 'en'],
			['fr-FR', 'fr'],
		] as const) {
			binding.update({ locale: input });
			expect(binding.element.locale).toBe(expected);
		}
		binding.destroy();
	});

	it('forwards readOnly to the read-only attribute', () => {
		const binding = mountEditor(newHost(), { readOnly: true });
		expect(binding.element.hasAttribute('read-only')).toBe(true);
		binding.update({ readOnly: false });
		expect(binding.element.hasAttribute('read-only')).toBe(false);
		binding.destroy();
	});
});

describe('bytes and src', () => {
	it('loads bytes once per new array, with the file name', () => {
		const load = vi.spyOn(XlsxEditorElement.prototype, 'load').mockResolvedValue(undefined);
		const bytes = new Uint8Array([80, 75, 3, 4]);
		const binding = mountEditor(newHost(), { bytes, fileName: 'Sales.xlsx' });
		expect(load).toHaveBeenCalledWith(bytes, 'Sales.xlsx');
		binding.update({ bytes, fileName: 'Sales.xlsx', readOnly: true });
		expect(load).toHaveBeenCalledTimes(1);
		const next = new Uint8Array([80, 75, 3, 4]);
		binding.update({ bytes: next });
		expect(load).toHaveBeenCalledTimes(2);
		expect(load).toHaveBeenLastCalledWith(next, undefined);
		binding.destroy();
	});

	it('swallows a load rejection (the element reports it as workbook-error)', async () => {
		vi.spyOn(XlsxEditorElement.prototype, 'load').mockRejectedValue(new Error('corrupt'));
		const unhandled = vi.fn();
		process.on('unhandledRejection', unhandled);
		const binding = mountEditor(newHost(), { bytes: new Uint8Array([1]) });
		await flush();
		process.off('unhandledRejection', unhandled);
		expect(unhandled).not.toHaveBeenCalled();
		binding.destroy();
	});

	it('fetches src, loads it under the URL file name and reports fetch failures', async () => {
		const load = vi.spyOn(XlsxEditorElement.prototype, 'load').mockResolvedValue(undefined);
		const fetchMock = vi.fn(async (url: string) =>
			url.endsWith('missing.xlsx')
				? new Response('', { status: 404 })
				: new Response(new Uint8Array([80, 75, 3, 4])),
		);
		vi.stubGlobal('fetch', fetchMock);
		const onWorkbookError = vi.fn();
		const binding = mountEditor(newHost(), { src: '/files/Q3%20Sales.xlsx?v=2', onWorkbookError });
		await flush();
		expect(fetchMock.mock.calls[0]?.[0]).toBe('/files/Q3%20Sales.xlsx?v=2');
		expect(load).toHaveBeenCalledWith(new Uint8Array([80, 75, 3, 4]), 'Q3 Sales.xlsx');
		binding.update({ src: '/files/Q3%20Sales.xlsx?v=2', onWorkbookError });
		await flush();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		binding.update({ src: '/missing.xlsx', onWorkbookError });
		await flush();
		expect(onWorkbookError).toHaveBeenCalledTimes(1);
		expect(String(onWorkbookError.mock.calls[0]?.[0])).toContain('404');
		binding.destroy();
	});
});

describe('events and handle methods', () => {
	it('surfaces selection-change and dirty-change and exposes the element methods', async () => {
		const onSelectionChange = vi.fn();
		const onDirtyChange = vi.fn();
		const binding = mountEditor(newHost(), { onSelectionChange, onDirtyChange });
		const calls = stubElementMethods(binding.element);
		emit(binding.element, 'selection-change', { sheet: 0, ref: 'B2:C4', active: 'B2' });
		expect(onSelectionChange).toHaveBeenCalledWith({ sheet: 0, ref: 'B2:C4', active: 'B2' });
		emit(binding.element, 'dirty-change', { dirty: true });
		expect(onDirtyChange).toHaveBeenCalledWith(true);
		expect(await binding.save()).toBeInstanceOf(Blob);
		expect(await binding.saveBytes('csv')).toEqual(new Uint8Array([1, 2, 3]));
		await binding.load(new Uint8Array([1]), 'a.xlsx');
		await binding.download('b.xlsx');
		binding.newWorkbook();
		expect(calls.map((call) => call.method)).toEqual([
			'save',
			'saveBytes',
			'load',
			'download',
			'newWorkbook',
		]);
		expect(calls[1]?.args).toEqual(['csv']);
		expect(calls[2]?.args).toEqual([new Uint8Array([1]), 'a.xlsx']);
		binding.select('D5');
		expect(binding.getSelection()).toBe('D5');
		expect(binding.dirty).toBe(false);
		binding.destroy();
		emit(binding.element, 'dirty-change', { dirty: false });
		expect(onDirtyChange).toHaveBeenCalledTimes(1);
	});

	it('gives adapters a handle that throws before mount and forwards after', async () => {
		let current: ReturnType<typeof mountEditor> | undefined;
		const handle = deferredHandle(() => current);
		await expect(handle.save()).rejects.toThrow('Editor is not mounted');
		expect(() => handle.element).toThrow('Editor is not mounted');
		expect(handle.dirty).toBe(false);
		handle.markClean();
		current = mountEditor(newHost());
		expect(handle.element).toBe(current.element);
		stubElementMethods(current.element);
		expect(await handle.save()).toBeInstanceOf(Blob);
		current.destroy();
	});
});
