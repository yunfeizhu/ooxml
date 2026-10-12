// @vitest-environment jsdom
import type { RibbonElement } from 'ooxml-core/xlsx/ui';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createEditSession, createWorkbook, saveXlsx } from 'ooxml-core/xlsx';
import type { EditorContext, GridController } from 'ooxml-core/xlsx/ui';
import type { EditorCore } from './editor-core';

// The feature modules have their own tests; here they are doubles so the element is tested alone.
const mounted: string[] = [];
vi.mock('./modules', () => ({
	installCommands: () => {
		mounted.push('commands');
		return () => undefined;
	},
	mountGrid: (ctx: EditorContext, container: HTMLElement) => {
		mounted.push('grid');
		const surface = container.ownerDocument.createElement('div');
		surface.tabIndex = 0;
		container.append(surface);
		let zoom = 100;
		const grid: GridController = {
			focus: () => surface.focus(),
			scrollTo: () => undefined,
			invalidate: () => undefined,
			beginEdit: () => undefined,
			commitEdit: () => true,
			cancelEdit: () => undefined,
			isEditing: () => false,
			measureText: (text) => text.length * 7,
			zoom: () => zoom,
			setZoom: (value) => {
				zoom = value;
			},
		};
		ctx.attachGrid(grid);
		return () => undefined;
	},
	mountFormulaBar: () => () => undefined,
	mountSheetTabs: () => () => undefined,
}));

const { XlsxEditorElement, defineXlsxEditor } = await import('./index');
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function editor() {
	const element = document.createElement('xlsx-editor') as InstanceType<typeof XlsxEditorElement>;
	const events: { type: string; detail: unknown }[] = [];
	for (const type of [
		'workbook-change',
		'workbook-error',
		'workbook-warning',
		'readonly-change',
		'ribbon-action',
		'file-command',
		'selection-change',
		'sheet-change',
		'dirty-change',
	])
		element.addEventListener(type, (event) =>
			events.push({ type, detail: (event as CustomEvent).detail }),
		);
	document.body.append(element);
	return { element, events, of: (type: string) => events.filter((event) => event.type === type) };
}

async function xlsxBytes(sheets = ['Data', 'Second']) {
	const workbook = createWorkbook();
	const session = createEditSession(workbook);
	session.renameSheet(0, sheets[0]!);
	for (const name of sheets.slice(1)) session.addSheet(name);
	session.setCellInput(0, 0, 0, '5');
	return saveXlsx(workbook);
}

beforeAll(() => defineXlsxEditor());

describe('<xlsx-editor> shell', () => {
	it('allows hosts to commit pending edits and respects validation failures', () => {
		const { element } = editor();
		element.newWorkbook();
		const grid = (element as unknown as { core: EditorCore }).core.ctx.grid()!;
		const editing = vi.spyOn(grid, 'isEditing').mockReturnValue(false);
		const commit = vi.spyOn(grid, 'commitEdit').mockReturnValue(false);
		expect(element.commitEdit()).toBe(true);
		expect(commit).not.toHaveBeenCalled();
		editing.mockReturnValue(true);
		expect(element.commitEdit()).toBe(false);
		commit.mockReturnValue(true);
		expect(element.commitEdit()).toBe(true);
		element.remove();
	});
	it('builds the parts in the shadow root and mounts the modules', () => {
		const { element } = editor();
		const root = element.shadowRoot!;
		for (const part of [
			'title-bar',
			'ribbon',
			'grid',
			'formula-bar',
			'sheet-tabs',
			'status-bar',
			'backstage',
		])
			expect(root.querySelector(`[part~="${part}"]`), part).not.toBeNull();
		expect(mounted).toEqual(expect.arrayContaining(['commands', 'grid']));
		expect(element.getAttribute('aria-label')).toBe('Spreadsheet editor');
	});

	it('loads .xlsx bytes with a session, a clean state and workbook-change', async () => {
		const { element, of } = editor();
		await element.load(await xlsxBytes(), 'Report.xlsx');
		expect(element.workbook?.sheets.map((sheet) => sheet.name)).toEqual(['Data', 'Second']);
		expect(element.fileName).toBe('Report.xlsx');
		expect(element.dirty).toBe(false);
		expect(of('workbook-change')).toHaveLength(1);
		const bar = element.shadowRoot!.querySelector('office-ui-title-bar') as HTMLElement & {
			updateComplete: Promise<unknown>;
		};
		await bar.updateComplete;
		expect(bar.shadowRoot!.querySelector('.name')!.textContent).toBe('Report.xlsx');
	});

	it('loads CSV and legacy .xls files, telling the user that Save writes .xlsx', async () => {
		const { element } = editor();
		await element.load(new TextEncoder().encode('a,b\n1,2\n'), 'data.csv');
		expect(element.workbook?.format).toBe('csv');
		const xls = readFileSync(resolve(process.cwd(), 'src/xlsx/__fixtures__/legacy-97.xls'));
		await element.load(new Uint8Array(xls), 'legacy-97.xls');
		expect(element.workbook?.format).toBe('xls');
		await flush();
		expect(element.shadowRoot!.querySelector('.xve-toast')!.textContent).toContain('.xls');
	});

	it('reports load failures through workbook-error and rejects', async () => {
		const { element, of } = editor();
		await expect(
			element.load(new Uint8Array([0x50, 0x4b, 3, 4, 9, 9, 9, 9]), 'broken.xlsx'),
		).rejects.toThrow();
		expect(of('workbook-error')).toHaveLength(1);
	});

	it('creates, edits, saves and marks clean', async () => {
		const { element, of } = editor();
		element.newWorkbook();
		expect(element.workbook?.sheets).toHaveLength(1);
		expect(element.fileName).toBe('Book1.xlsx');
		(
			element as unknown as { core: { session: { setCellInput(...a: unknown[]): void } } }
		).core.session.setCellInput(0, 0, 0, '7');
		expect(element.dirty).toBe(true);
		expect(of('dirty-change').at(-1)?.detail).toEqual({ dirty: true });
		const bytes = await element.saveBytes();
		expect(bytes[0]).toBe(0x50);
		expect(new TextDecoder().decode(await element.saveBytes('csv'))).toContain('7');
		expect((await element.save()).type).toContain('spreadsheetml');
		expect(element.dirty).toBe(true);
		element.markClean();
		expect(element.dirty).toBe(false);
	});

	it('selects ranges, reports them and switches sheets', async () => {
		const { element, of } = editor();
		await element.load(await xlsxBytes(), 'a.xlsx');
		element.setActiveSheet(0);
		element.select('B2:C4');
		expect(element.getSelection()).toBe('B2:C4');
		expect(of('selection-change').at(-1)?.detail).toEqual({ sheet: 0, ref: 'B2:C4', active: 'B2' });
		element.select('Second!A1');
		expect(element.activeSheet).toBe(1);
		expect(of('sheet-change').at(-1)?.detail).toEqual({ index: 1, name: 'Second' });
		expect(() => element.select('not a ref')).toThrow();
		element.setActiveSheet(5);
		expect(element.activeSheet).toBe(1);
	});

	it('undoes and redoes through the edit commands', async () => {
		const { element } = editor();
		element.newWorkbook();
		const session = (
			element as unknown as { core: { session: { setCellInput(...a: unknown[]): void } } }
		).core.session;
		session.setCellInput(0, 0, 0, '1');
		element.undo();
		await flush();
		expect(element.workbook!.sheets[0]!.rows.get(0)?.get(0)).toBeUndefined();
		element.redo();
		await flush();
		expect(element.workbook!.sheets[0]!.rows.get(0)?.get(0)?.value).toBe(1);
	});

	it('runs file commands unless the host cancels file-command', async () => {
		const { element, of } = editor();
		element.newWorkbook();
		element.addEventListener('file-command', (event) => event.preventDefault());
		const newWorkbook = element.workbook;
		await flush();
		const bar = element.shadowRoot!.querySelector('office-ui-title-bar') as HTMLElement & {
			updateComplete: Promise<unknown>;
		};
		await bar.updateComplete;
		bar.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Save"]')!.click();
		await flush();
		expect(of('file-command').at(-1)?.detail).toEqual({ command: 'save' });
		expect(element.workbook).toBe(newWorkbook);
	});

	it('renders one status bar with one Ready, and the mode, Comments and Share on the tab row', async () => {
		const { element } = editor();
		element.newWorkbook();
		const root = element.shadowRoot!;
		const bars = root.querySelectorAll<HTMLElement & { updateComplete: Promise<unknown> }>(
			'office-ui-status-bar',
		);
		expect(bars).toHaveLength(1);
		expect(root.querySelectorAll('[part~="status-bar"]')).toHaveLength(1);
		await bars[0]!.updateComplete;
		// Every "Ready" in the editor, light and shadow trees alike.
		const texts: string[] = [];
		const walk = (node: ParentNode) => {
			for (const child of node.querySelectorAll('*')) {
				if (!child.childElementCount && child.textContent?.trim())
					texts.push(child.textContent.trim());
				if (child.shadowRoot) walk(child.shadowRoot);
			}
		};
		walk(root);
		expect(texts.filter((text) => text === 'Ready')).toHaveLength(1);
		const ribbon = root.querySelector('office-ui-ribbon')!;
		const actions = [...ribbon.children].find((child) =>
			child.classList.contains('xve-ribbon-actions'),
		) as HTMLElement;
		expect(actions.slot).toBe('actions');
		expect(actions.tagName.toLowerCase()).toBe('office-ui-ribbon-actions');
		for (const part of ['mode-select', 'comments', 'share']) {
			expect(actions.shadowRoot!.querySelector(`[part="${part}"]`), part).not.toBeNull();
		}
		expect(
			root.querySelector('office-ui-title-bar')!.querySelector('office-ui-ribbon-actions'),
		).toBeNull();
	});

	it('toggles read-only from the ribbon tab row and focuses the grid', async () => {
		const { element, of } = editor();
		element.newWorkbook();
		const mode = element
			.shadowRoot!.querySelector('office-ui-ribbon office-ui-ribbon-actions')!
			.shadowRoot!.querySelector<HTMLSelectElement>('[part="mode-select"]')!;
		mode.value = 'viewing';
		mode.dispatchEvent(new Event('change'));
		expect(element.readOnly).toBe(true);
		expect(element.hasAttribute('read-only')).toBe(true);
		expect(of('readonly-change')).toEqual([
			{ type: 'readonly-change', detail: { readOnly: true } },
		]);
		element.focusGrid();
		expect(element.shadowRoot!.activeElement).not.toBeNull();
	});

	it('opens the backstage from the File tab and closes it with Escape', async () => {
		const { element } = editor();
		element.newWorkbook();
		const root = element.shadowRoot!;
		const ribbon = root.querySelector<RibbonElement>('office-ui-ribbon')!;
		await ribbon.updateComplete;
		ribbon.fileButton()!.click();
		const backstage = root.querySelector<HTMLElement>('[part="backstage"]')!;
		expect(backstage.hasAttribute('open')).toBe(true);
		expect(backstage.querySelector('h2')!.textContent).toBe('Info');
		backstage.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(backstage.hasAttribute('open')).toBe(false);
	});
});

describe('attributes and properties', () => {
	it('reflects attributes both ways without ping-pong and keeps defaults', async () => {
		const { element } = editor();
		element.setAttribute('locale', 'fr-CA');
		expect(element.locale).toBe('fr');
		const ribbon = element.shadowRoot!.querySelector<RibbonElement>('office-ui-ribbon')!;
		await ribbon.updateComplete;
		expect(ribbon.fileButton()!.textContent).toBe('Fichier');
		element.showFormulaBar = false;
		expect(element.getAttribute('show-formula-bar')).toBe('false');
		element.setAttribute('show-toolbar', 'false');
		expect(element.showToolbar).toBe(false);
		element.fileName = '';
		expect(element.fileName).toBe('Book1.xlsx');
		element.authorName = '';
		expect(element.authorName).toBe('Author');
		element.setAttribute('theme', 'sepia');
		expect(element.theme).toBe('auto');
	});

	it('applies themeColors inline and clears stale overrides', () => {
		const { element } = editor();
		element.themeColors = { primary: '#ff0000', gridLine: '#00ff00' };
		expect(element.style.getPropertyValue('--xve-primary')).toBe('#ff0000');
		expect(element.style.getPropertyValue('--xve-grid-line')).toBe('#00ff00');
		element.themeColors = {};
		expect(element.style.getPropertyValue('--xve-primary')).toBe('');
		expect(element.themeColors).toEqual({});
	});

	it('accepts a workbook model without echoing workbook-change', () => {
		const { element, of } = editor();
		const workbook = createWorkbook();
		element.workbook = workbook;
		expect(element.workbook).toBe(workbook);
		expect(element.dirty).toBe(false);
		expect(of('workbook-change')).toHaveLength(0);
		element.workbook = null;
		expect(element.workbook).toBeNull();
	});
});

describe('ribbon add-in tabs', () => {
	const tab = (run: () => void) => ({
		id: 'pdf',
		label: 'PDF',
		groups: [{ label: 'Create PDF', commands: [{ id: 'create-pdf', label: 'Create PDF', run }] }],
	});

	it('adds host tabs after the built-in ones, before and after connecting, and reports their commands', () => {
		const element = document.createElement('xlsx-editor') as InstanceType<typeof XlsxEditorElement>;
		const run = vi.fn();
		const heard = vi.fn();
		element.addEventListener('office-ribbon-add-in', (event) =>
			heard((event as CustomEvent).detail),
		);
		element.ribbonAddIns = [tab(run)];
		document.body.append(element);
		const ribbon = element.shadowRoot!.querySelector('office-ui-ribbon')!;
		const labels = () =>
			[...ribbon.querySelectorAll<HTMLElement>('[data-ribbon-tab]')].map(
				(panel) => panel.dataset.label,
			);
		expect(labels().at(-1)).toBe('PDF');
		ribbon.querySelector('[data-add-in-command="create-pdf"]')!.dispatchEvent(
			new CustomEvent('office-command', {
				detail: { command: 'create-pdf' },
				bubbles: true,
				composed: true,
			}),
		);
		expect(run).toHaveBeenCalledTimes(1);
		expect(heard).toHaveBeenCalledWith({ tab: 'pdf', command: 'create-pdf' });
		// A locale change rebuilds Excel's tabs; the host's tab stays.
		element.locale = 'fr';
		expect(labels().at(-1)).toBe('PDF');
		element.ribbonAddIns = [];
		expect(ribbon.querySelector('[data-add-in]')).toBeNull();
		element.remove();
	});
});
