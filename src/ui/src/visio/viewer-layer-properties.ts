import { getVisioPageLayers, type VisioEdit, type VisioLayer } from 'ooxml-core/visio';
import { editErrorMessage, isEditCancellation } from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';
import type { RibbonCommand } from './ribbon-parts';
import { ViewerDialog } from './viewer-dialog';
import { layerOverrideMaps, VIEWER_LAYER_LIMITS } from './viewer-layers';

const LABEL = 'Layer Properties';
const FLAGS = [
	['visible', 'Visible'],
	['print', 'Print'],
	['lock', 'Lock'],
] as const;
type Flag = (typeof FLAGS)[number][0];
const saved = (layer: VisioLayer, flag: Flag): boolean =>
	flag === 'visible' ? layer.visible : flag === 'print' ? layer.printable : layer.locked;

/**
 * Home > Editing > Layers > Layer Properties, as Visio's dialog: one row per layer of the page
 * (and of its background pages) with its shape count, Visible, Print and Lock boxes and colour.
 * OK saves the changed flags as one `set-layer-properties` edit. A read-only drawing can still
 * show or hide layers here, for this view only.
 */
export class ViewerLayerProperties {
	readonly dialog: ViewerDialog;
	#table: HTMLTableElement;
	#note: HTMLElement;
	#generation: number | undefined;
	constructor(
		private readonly root: ShadowRoot,
		private readonly controller: ViewerController,
		private readonly announce: (message: string) => void,
	) {
		const doc = root.ownerDocument;
		this.dialog = new ViewerDialog(root, 'layer-properties-dialog', LABEL, ['OK', 'Cancel'], (b) =>
			b === 'OK' ? void this.#apply() : this.dialog.close(),
		);
		this.#table = doc.createElement('table');
		this.#table.className = 'layer-table';
		this.#note = doc.createElement('p');
		this.#note.className = 'layer-note';
		this.dialog.body.append(this.#table, this.#note);
	}
	#sources(state: ViewerState) {
		const model = state.document;
		const page = model?.pages[state.pageIndex];
		return model && page ? getVisioPageLayers(model, page.id) : [];
	}
	open(): void {
		const state = this.controller.state;
		const model = state.document;
		const sources = this.#sources(state);
		if (!model || !sources.some((source) => source.layers?.length)) {
			this.announce(`${LABEL}: this page has no layers. Use Assign to Layer to add one.`);
			return;
		}
		const doc = this.root.ownerDocument;
		const editable = state.edit.sourceAvailable;
		const overrides = layerOverrideMaps(model, state.layerVisibilityOverrides);
		const cell = (tag: 'th' | 'td', text = '') =>
			Object.assign(doc.createElement(tag), { textContent: text });
		const head = doc.createElement('thead');
		const titles = doc.createElement('tr');
		for (const title of ['Name', '#', 'Visible', 'Print', 'Lock', 'Color'])
			titles.append(Object.assign(cell('th', title), { scope: 'col' }));
		head.append(titles);
		const body = doc.createElement('tbody');
		let shown = 0;
		for (const source of sources) {
			const page = model.pages.find((candidate) => candidate.id === source.id);
			const layers = source.layers ?? [];
			if (!layers.length) continue;
			if (sources.length > 1) {
				const caption = doc.createElement('tr');
				const label = cell(
					'th',
					source.id === sources[0]!.id ? source.name : `${source.name} (background)`,
				);
				label.colSpan = 6;
				label.scope = 'rowgroup';
				caption.className = 'layer-page';
				caption.append(label);
				body.append(caption);
			}
			for (const layer of layers) {
				if (shown >= VIEWER_LAYER_LIMITS.controls) break;
				++shown;
				const name = layer.name.slice(0, 256) || 'Layer';
				const row = doc.createElement('tr');
				row.dataset.pageId = source.id;
				row.dataset.layerId = layer.id;
				const count = (page?.shapes ?? []).filter((shape) =>
					shape.layerIds?.includes(layer.id),
				).length;
				row.append(Object.assign(cell('th', name), { scope: 'row' }), cell('td', String(count)));
				for (const [flag, title] of FLAGS) {
					const box = doc.createElement('input');
					box.type = 'checkbox';
					box.dataset.flag = flag;
					box.setAttribute('aria-label', `${name}: ${title}`);
					const override = flag === 'visible' ? overrides.get(source.id)?.get(layer.id) : undefined;
					box.checked = override ?? saved(layer, flag);
					// A read-only drawing can only be shown differently, not saved.
					box.disabled = !editable && flag !== 'visible';
					const holder = cell('td');
					holder.append(box);
					row.append(holder);
				}
				const colour = cell('td');
				if (layer.color) {
					const swatch = doc.createElement('span');
					swatch.className = 'layer-colour';
					swatch.style.background = layer.color;
					swatch.title = layer.color;
					colour.append(swatch);
				}
				row.append(colour);
				body.append(row);
			}
		}
		this.#table.replaceChildren(head, body);
		this.#note.textContent = editable
			? ''
			: 'This drawing is read-only: Visible changes how it is shown here and is not saved.';
		this.#generation = this.controller.documentGeneration;
		this.dialog.show();
		this.#table.querySelector<HTMLInputElement>('input:not([disabled])')?.focus();
	}
	async #apply(): Promise<void> {
		const state = this.controller.state;
		const model = state.document;
		if (!model || this.controller.documentGeneration !== this.#generation) {
			this.dialog.close();
			return;
		}
		const editable = state.edit.sourceAvailable;
		const sources = new Map(this.#sources(state).map((source) => [source.id, source]));
		const edits: VisioEdit[] = [];
		const shown: { pageId: string; layerId: string; visible: boolean | null }[] = [];
		for (const row of this.#table.querySelectorAll<HTMLTableRowElement>('tr[data-layer-id]')) {
			const pageId = row.dataset.pageId!,
				layerId = row.dataset.layerId!;
			const layer = sources.get(pageId)?.layers?.find((candidate) => candidate.id === layerId);
			if (!layer) continue;
			const value = (flag: Flag) =>
				row.querySelector<HTMLInputElement>(`input[data-flag="${flag}"]`)!.checked;
			if (!editable) {
				shown.push({
					pageId,
					layerId,
					visible: value('visible') === layer.visible ? null : value('visible'),
				});
				continue;
			}
			const changed = FLAGS.filter(([flag]) => value(flag) !== saved(layer, flag));
			if (changed.length)
				edits.push({
					type: 'set-layer-properties',
					pageId,
					layerId,
					...Object.fromEntries(changed.map(([flag]) => [flag, value(flag)])),
				});
			// The saved flag now says it; a display-only override would mask it.
			shown.push({ pageId, layerId, visible: null });
		}
		this.dialog.busy(true);
		try {
			if (edits.length) await this.controller.applyEdits(edits);
			for (const item of shown)
				this.controller.setLayerVisibility(item.pageId, item.layerId, item.visible);
			this.dialog.close();
			if (edits.length)
				this.announce(`Updated ${edits.length} layer${edits.length === 1 ? '' : 's'}.`);
		} catch (error) {
			if (this.dialog.open && !isEditCancellation(error))
				this.dialog.error.textContent = editErrorMessage(error);
		} finally {
			this.dialog.busy(false);
		}
	}
	render(state: ViewerState): void {
		const none = !this.#sources(state).some((source) => source.layers?.length);
		const command = this.root.querySelector<RibbonCommand>('[command="layer-properties"]');
		if (command) {
			command.disabled = none;
			command.title = none ? `${LABEL}: this page has no layers.` : `${LABEL}...`;
		}
		if (
			this.dialog.open &&
			(state.loading || this.controller.documentGeneration !== this.#generation)
		)
			this.dialog.close();
	}
}
