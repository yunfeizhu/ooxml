import type { VisioDataRecordset } from 'ooxml-core/visio';

/** Drag payload of External Data rows: `{ recordsetId, rowIds }` as JSON. */
export const DATA_ROW_MIME = 'application/x-visio-viewer-data-row';
/** Rows drawn in the grid; the rest stay in the recordset and remain linkable by key. */
const MAX_VISIBLE_ROWS = 2000;
export type DataWindowAction = 'link' | 'auto-link' | 'unlink' | 'refresh' | 'remove' | 'close';
const ACTIONS: readonly [DataWindowAction, string, string][] = [
	['link', 'Link to Selected Shapes', 'Link the selected rows to the selected shapes, in order.'],
	[
		'auto-link',
		'Automatically Link...',
		'Link rows to shapes whose text or name matches a column.',
	],
	['unlink', 'Unlink', 'Unlink the selected shapes from this recordset; their Shape Data stays.'],
	['refresh', 'Refresh', 'Read the source file again and update linked shapes.'],
	['remove', 'Remove', 'Remove this recordset from the drawing; linked shapes keep their data.'],
];

/**
 * Visio's External Data window: a grid of the drawing's saved recordsets, docked under the
 * drawing in the shared `office-ui-task-pane` (title and close button), with the recordset
 * picker and the link commands in a bar above the grid.
 */
export function createExternalDataWindow(doc: Document): HTMLElement {
	const pane = doc.createElement('office-ui-task-pane');
	pane.className = 'external-data';
	pane.hidden = true;
	pane.setAttribute('label', 'External Data');
	pane.setAttribute('close-label', 'Close External Data window');
	const heading = doc.createElement('div');
	heading.className = 'external-data-bar';
	const sets = doc.createElement('select');
	sets.dataset.recordset = '';
	sets.setAttribute('aria-label', 'Recordset');
	const tools = doc.createElement('span');
	tools.className = 'external-data-tools';
	for (const [action, label, hint] of ACTIONS) {
		const button = doc.createElement('button');
		button.type = 'button';
		button.dataset.dataAction = action;
		button.textContent = label;
		button.title = hint;
		tools.append(button);
	}
	heading.append(sets, tools);
	const hint = doc.createElement('p');
	hint.className = 'external-data-hint';
	hint.dataset.dataHint = '';
	const grid = doc.createElement('div');
	grid.className = 'external-data-grid';
	const table = doc.createElement('table');
	table.setAttribute('role', 'grid');
	table.append(doc.createElement('thead'), doc.createElement('tbody'));
	grid.append(table);
	pane.append(heading, hint, grid);
	return pane;
}

export interface DataWindowView {
	recordsets: readonly VisioDataRecordset[];
	active: VisioDataRecordset | undefined;
	selectedRows: ReadonlySet<string>;
	/** Rows linked to the selected shapes, highlighted like Visio's linked-row marker. */
	currentRows: ReadonlySet<string>;
	editable: boolean;
	shapesSelected: boolean;
}
const drawn = new WeakMap<HTMLElement, VisioDataRecordset | undefined>();

/** Sync the pane with the drawing; the grid is rebuilt only when the recordset changes. */
export function renderExternalDataWindow(pane: HTMLElement, view: DataWindowView): void {
	const doc = pane.ownerDocument;
	const sets = pane.querySelector<HTMLSelectElement>('[data-recordset]')!;
	const ids = view.recordsets.map((set) => set.id).join(',');
	if (sets.dataset.ids !== ids) {
		sets.dataset.ids = ids;
		sets.replaceChildren(
			...view.recordsets.map((set) => {
				const option = doc.createElement('option');
				option.value = set.id;
				option.textContent = set.name;
				return option;
			}),
		);
	}
	sets.value = view.active?.id ?? '';
	sets.disabled = view.recordsets.length < 2;
	const enable = (action: DataWindowAction, on: boolean) => {
		const button = pane.querySelector<HTMLButtonElement>(`[data-data-action="${action}"]`)!;
		button.disabled = !on;
	};
	const active = !!view.active && view.editable;
	enable('link', active && view.selectedRows.size > 0 && view.shapesSelected);
	enable('auto-link', active);
	enable('unlink', active && view.shapesSelected);
	enable('refresh', active);
	enable('remove', active);
	const hint = pane.querySelector<HTMLElement>('[data-data-hint]')!;
	hint.textContent = !view.active
		? 'No external data. Use Data > Quick Import to bring in an Excel workbook or CSV file.'
		: `${view.active.rows.length} rows${view.active.rows.length > MAX_VISIBLE_ROWS ? ` (first ${MAX_VISIBLE_ROWS} shown)` : ''}. Drag a row onto a shape to link it.`;
	const table = pane.querySelector('table')!;
	if (drawn.get(pane) !== view.active) {
		drawn.set(pane, view.active);
		const head = doc.createElement('tr');
		const links = doc.createElement('th');
		links.textContent = 'Links';
		head.append(links);
		for (const column of view.active?.columns ?? []) {
			const cell = doc.createElement('th');
			cell.textContent = column.label;
			cell.title = `${column.name} (${column.type})`;
			head.append(cell);
		}
		table.tHead!.replaceChildren(head);
		const counts = new Map<string, number>();
		for (const link of view.active?.links ?? [])
			counts.set(link.rowId, (counts.get(link.rowId) ?? 0) + 1);
		table.tBodies[0]!.replaceChildren(
			...(view.active?.rows ?? []).slice(0, MAX_VISIBLE_ROWS).map((row) => {
				const tr = doc.createElement('tr');
				tr.dataset.rowId = row.id;
				tr.draggable = true;
				tr.tabIndex = -1;
				const count = doc.createElement('td');
				count.textContent = counts.get(row.id) ? String(counts.get(row.id)) : '';
				count.title = counts.get(row.id) ? `Linked to ${counts.get(row.id)} shapes` : 'Not linked';
				tr.append(count);
				for (const value of row.values) {
					const cell = doc.createElement('td');
					cell.textContent = value;
					tr.append(cell);
				}
				return tr;
			}),
		);
	}
	for (const tr of table.tBodies[0]!.rows) {
		const id = tr.dataset.rowId!;
		tr.setAttribute('aria-selected', String(view.selectedRows.has(id)));
		tr.toggleAttribute('data-current', view.currentRows.has(id));
		tr.draggable = view.editable;
	}
}
