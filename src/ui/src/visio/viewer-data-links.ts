import type { VisioDataRecordset, VisioPage, VisioShape } from 'ooxml-core/visio';
import { visioDataGraphicMarker } from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';
import { InsertDialog } from './viewer-insert-dialog';
import {
	createExternalDataWindow,
	DATA_ROW_MIME,
	renderExternalDataWindow,
	type DataWindowAction,
} from './viewer-data-window';

type Run = (action: () => Promise<void>, success: string) => void;

/**
 * The External Data window and its links: drag rows onto shapes, link selected rows to selected
 * shapes, link automatically by a key column, unlink and remove recordsets.
 */
export class ViewerDataLinks {
	readonly pane: HTMLElement;
	readonly autoLink: InsertDialog;
	/** Refresh All, supplied by the Data tab. */
	onRefresh: () => void = () => {};
	#activeId: string | undefined;
	#selected = new Set<string>();
	#anchor: string | undefined;
	constructor(
		private readonly root: ShadowRoot,
		private readonly controller: ViewerController,
		private readonly announce: (message: string) => void,
		private readonly run: Run,
	) {
		this.pane = createExternalDataWindow(root.ownerDocument);
		(root.querySelector('.workspace') ?? root).append(this.pane);
		this.autoLink = new InsertDialog(
			root,
			'data-link-dialog',
			'Automatically Link',
			[
				{ name: 'column', label: 'Data column', choices: true },
				{ name: 'shapeField', label: 'Matches shape', choices: true },
			],
			['Link', 'Cancel'],
			(button) => this.#auto(button),
		);
		this.autoLink.choices('shapeField', ['text', 'name'], 'text', {
			labels: ['Shape text', 'Shape name'],
			none: false,
		});
	}
	get activeId(): string | undefined {
		return this.#active()?.id;
	}
	#active(): VisioDataRecordset | undefined {
		const sets = this.controller.state.document?.dataRecordsets ?? [];
		return sets.find((set) => set.id === this.#activeId) ?? sets[0];
	}
	#page(): VisioPage | undefined {
		const state = this.controller.state;
		return state.document?.pages[state.pageIndex];
	}
	#editable(): boolean {
		const { edit, loading } = this.controller.state;
		return edit.sourceAvailable && !loading && !edit.busy;
	}
	toggle(): void {
		this.pane.hidden = !this.pane.hidden;
		this.render(this.controller.state);
	}
	show(id?: string): void {
		if (id !== undefined && id !== this.#activeId) {
			this.#activeId = id;
			this.#selected.clear();
		}
		this.pane.hidden = false;
		this.render(this.controller.state);
	}
	#link(shapeIds: readonly string[], rowIds: readonly string[], pageId: string): void {
		const set = this.#active();
		if (!set || !shapeIds.length || !rowIds.length || !this.#editable()) return;
		const links = shapeIds.map((shapeId, index) => ({
			shapeId,
			rowId: rowIds[Math.min(index, rowIds.length - 1)]!,
		}));
		this.run(
			() =>
				this.controller.applyEdits([
					{ type: 'link-data-rows', pageId, recordsetId: set.id, links },
				]),
			links.length === 1
				? `Linked shape ${links[0]!.shapeId} to row ${links[0]!.rowId} of ${set.name}.`
				: `Linked ${links.length} shapes to ${set.name}.`,
		);
	}
	#selectedShapes(page: VisioPage): string[] {
		return this.controller.state.selectedShapes
			.filter((shape) => !shape.pageId || shape.pageId === page.id)
			.map((shape) => shape.id);
	}
	#act(action: DataWindowAction): void {
		if (action === 'close') {
			this.pane.hidden = true;
			return this.render(this.controller.state);
		}
		const set = this.#active();
		const page = this.#page();
		if (!set || !page || !this.#editable()) return;
		if (action === 'refresh') return this.onRefresh();
		if (action === 'link')
			return this.#link(this.#selectedShapes(page), [...this.#selected], page.id);
		if (action === 'unlink') {
			const shapeIds = this.#selectedShapes(page);
			if (!shapeIds.length) return;
			return this.run(
				() =>
					this.controller.applyEdits([
						{ type: 'unlink-data-rows', pageId: page.id, recordsetId: set.id, shapeIds },
					]),
				`Unlinked ${shapeIds.length === 1 ? 'the shape' : `${shapeIds.length} shapes`} from ${set.name}.`,
			);
		}
		if (action === 'remove')
			return this.run(
				() =>
					this.controller.applyEdits([
						{ type: 'delete-data-recordset', pageId: page.id, recordsetId: set.id },
					]),
				`Removed ${set.name}. Linked shapes keep their Shape Data.`,
			);
		this.autoLink.choices(
			'column',
			set.columns.map((_, index) => String(index)),
			'0',
			{ labels: set.columns.map((column) => column.label), none: false },
		);
		this.autoLink.error.textContent = '';
		this.autoLink.dialog.show();
	}
	#auto(button: string): void {
		if (button === 'Cancel') return this.autoLink.dialog.close();
		const set = this.#active();
		const page = this.#page();
		if (!set || !page) return;
		const column = Number(this.autoLink.value('column'));
		const byName = this.autoLink.value('shapeField') === 'name';
		const keys = new Map<string, string>();
		for (const row of set.rows) {
			const key = (row.values[column] ?? '').trim().toLowerCase();
			if (key && !keys.has(key)) keys.set(key, row.id);
		}
		const shapes: VisioShape[] = [];
		const visit = (items: readonly VisioShape[]) => {
			for (const shape of items) {
				if (!visioDataGraphicMarker(shape)) shapes.push(shape);
				visit(shape.children);
			}
		};
		visit(page.shapes);
		const matches = shapes.flatMap((shape) => {
			const key = (byName ? shape.name : shape.text.plainText).trim().toLowerCase();
			const rowId = keys.get(key);
			return rowId ? [{ shapeId: shape.id, rowId }] : [];
		});
		if (!matches.length) {
			this.autoLink.error.textContent = `No shape ${byName ? 'name' : 'text'} matches a value in ${set.columns[column]?.label ?? 'that column'}.`;
			return;
		}
		this.autoLink.dialog.close();
		this.run(
			() =>
				this.controller.applyEdits([
					{
						type: 'link-data-rows',
						pageId: page.id,
						recordsetId: set.id,
						links: matches.slice(0, 10_000),
					},
				]),
			`Linked ${matches.length} shapes automatically.`,
		);
	}
	wire(viewport: HTMLElement): () => void {
		const Abort = this.root.ownerDocument.defaultView?.AbortController ?? AbortController;
		const events = new Abort();
		const options = { signal: events.signal };
		// The shared task pane's close button.
		this.pane.addEventListener('office-pane-close', () => this.#act('close'), options);
		this.pane.addEventListener(
			'click',
			(event) => {
				const button = (event.target as Element).closest?.<HTMLButtonElement>('[data-data-action]');
				if (button && !button.disabled)
					return this.#act(button.dataset.dataAction as DataWindowAction);
				const row = (event.target as Element).closest?.<HTMLElement>('tr[data-row-id]');
				if (!row) return;
				const id = row.dataset.rowId!;
				const ids = [...this.pane.querySelectorAll<HTMLElement>('tbody tr')].map(
					(tr) => tr.dataset.rowId!,
				);
				if (event.shiftKey && this.#anchor) {
					const [a, b] = [ids.indexOf(this.#anchor), ids.indexOf(id)].sort((x, y) => x - y);
					this.#selected = new Set(ids.slice(a, b! + 1));
				} else if (event.ctrlKey || event.metaKey) {
					if (!this.#selected.delete(id)) this.#selected.add(id);
					this.#anchor = id;
				} else {
					this.#selected = new Set([id]);
					this.#anchor = id;
				}
				this.render(this.controller.state);
			},
			options,
		);
		this.pane.addEventListener(
			'change',
			(event) => {
				if (!(event.target as Element).matches('[data-recordset]')) return;
				this.show((event.target as HTMLSelectElement).value);
			},
			options,
		);
		this.pane.addEventListener(
			'dragstart',
			(event) => {
				const row = (event.target as Element).closest?.<HTMLElement>('tr[data-row-id]');
				const set = this.#active();
				if (!row || !set || !event.dataTransfer) return;
				const rowIds = this.#selected.has(row.dataset.rowId!)
					? [...this.#selected]
					: [row.dataset.rowId!];
				event.dataTransfer.setData(DATA_ROW_MIME, JSON.stringify({ recordsetId: set.id, rowIds }));
				event.dataTransfer.effectAllowed = 'link';
			},
			options,
		);
		viewport.addEventListener(
			'dragover',
			(event) => {
				if (!event.dataTransfer?.types.includes(DATA_ROW_MIME) || !this.#editable()) return;
				event.preventDefault();
				event.dataTransfer.dropEffect = 'link';
			},
			options,
		);
		viewport.addEventListener(
			'drop',
			(event) => {
				const payload = event.dataTransfer?.getData(DATA_ROW_MIME);
				if (!payload) return;
				event.preventDefault();
				let data: { recordsetId?: unknown; rowIds?: unknown };
				try {
					data = JSON.parse(payload);
				} catch {
					return;
				}
				const target = (event.target as Element)?.closest?.<SVGGElement>('[data-shape-id]');
				const page = this.#page();
				if (!target || !page) return this.announce('Drop the row onto a shape to link it.');
				if (typeof data.recordsetId === 'string') this.#activeId = data.recordsetId;
				const rowIds = Array.isArray(data.rowIds)
					? data.rowIds.filter((id): id is string => typeof id === 'string')
					: [];
				this.#link([target.dataset.shapeId!], rowIds.slice(0, 1), target.dataset.pageId ?? page.id);
			},
			options,
		);
		return () => {
			events.abort();
			this.autoLink.dialog.close();
		};
	}
	render(state: ViewerState): void {
		const box = this.root.querySelector<HTMLElement & { checked: boolean; disabled: boolean }>(
			'[data-check="external-data-window"]',
		);
		if (box) {
			box.checked = !this.pane.hidden;
			box.disabled = !state.document;
		}
		if (this.pane.hidden) return;
		const sets = state.document?.dataRecordsets ?? [];
		const active = sets.find((set) => set.id === this.#activeId) ?? sets[0];
		const rows = new Set(active?.rows.map((row) => row.id));
		for (const id of this.#selected) if (!rows.has(id)) this.#selected.delete(id);
		const page = state.document?.pages[state.pageIndex];
		const selected = new Set(state.selectedShapes.map((shape) => shape.id));
		const current = new Set(
			(active?.links ?? [])
				.filter((link) => link.pageId === page?.id && selected.has(link.shapeId))
				.map((link) => link.rowId),
		);
		renderExternalDataWindow(this.pane, {
			recordsets: sets,
			active,
			selectedRows: this.#selected,
			currentRows: current,
			editable: state.edit.sourceAvailable && !state.loading && !state.edit.busy,
			shapesSelected: selected.size > 0,
		});
		if (this.autoLink.dialog.open && (!active || !state.edit.sourceAvailable))
			this.autoLink.dialog.close();
	}
}
