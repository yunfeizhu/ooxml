import {
	VISIO_SELECT_TYPES,
	VISIO_SELECT_TYPE_LABELS,
	visioPageMasters,
	visioSelectByType,
	type VisioSelectByTypeQuery,
	type VisioSelectType,
} from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';
import type { RibbonCommand } from './ribbon-parts';
import { choice, fieldset, ViewerDialog } from './viewer-dialog';

type Mode = VisioSelectByTypeQuery['by'];

/**
 * Home > Editing > Select > Select by Type: select the page's shapes by shape type, by layer or
 * by master. Selection only: nothing is edited, so this works on read-only drawings too.
 */
export class ViewerSelectType {
	readonly dialog: ViewerDialog;
	#lists = new Map<Mode, HTMLElement>();
	constructor(
		private readonly root: ShadowRoot,
		private readonly controller: ViewerController,
		private readonly announce: (message: string) => void,
	) {
		const doc = root.ownerDocument;
		this.dialog = new ViewerDialog(
			root,
			'select-type-dialog',
			'Select by Type',
			['OK', 'Cancel'],
			(b) => (b === 'OK' ? this.#apply() : this.dialog.close()),
		);
		const modes: [Mode, string][] = [
			['type', 'Shape type'],
			['layer', 'Layer'],
			['master', 'Master'],
		];
		const radios = modes.map(([mode, label]) => {
			const item = choice(doc, 'radio', 'select-by', mode, label);
			item.input.addEventListener('change', () => this.#mode(mode));
			return item.row;
		});
		this.dialog.body.append(fieldset(doc, 'Select by', ...radios));
		for (const [mode, label] of modes) {
			const list = doc.createElement('div');
			list.className = 'select-type-list';
			list.dataset.mode = mode;
			this.#lists.set(mode, list);
			this.dialog.body.append(fieldset(doc, label, list));
		}
	}
	#mode(mode: Mode): void {
		for (const [key, list] of this.#lists) {
			const set = list.parentElement as HTMLFieldSetElement;
			set.hidden = key !== mode;
		}
		this.dialog.body.querySelector<HTMLInputElement>(
			`input[name="select-by"][value="${mode}"]`,
		)!.checked = true;
	}
	open(): void {
		const state = this.controller.state;
		const page = state.document?.pages[state.pageIndex];
		if (!page || state.loading) return;
		const doc = this.root.ownerDocument;
		const fill = (
			mode: Mode,
			entries: readonly [string, string][],
			checked: (id: string) => boolean,
		) => {
			const list = this.#lists.get(mode)!;
			list.replaceChildren(
				...(entries.length
					? entries.map(([value, label]) => {
							const item = choice(doc, 'checkbox', mode, value, label);
							item.input.checked = checked(value);
							return item.row;
						})
					: [Object.assign(doc.createElement('p'), { textContent: 'None on this page.' })]),
			);
		};
		fill(
			'type',
			VISIO_SELECT_TYPES.map((type) => [type, VISIO_SELECT_TYPE_LABELS[type]]),
			(type) => type === 'shape',
		);
		const layers = [...new Map((page.layers ?? []).map((layer) => [layer.id, layer])).values()];
		fill(
			'layer',
			[
				...layers.map((layer): [string, string] => [
					layer.id,
					layer.name.slice(0, 256) || `Layer ${layer.id}`,
				]),
				['', 'No layer'],
			],
			() => false,
		);
		const masters = visioPageMasters(page);
		fill(
			'master',
			[
				...masters.map((master): [string, string] => [
					master.id,
					`Master ${master.id} (${master.example.slice(0, 80)}, ${master.count})`,
				]),
				['', 'No master'],
			],
			() => false,
		);
		this.#mode('type');
		this.dialog.show();
		this.#lists.get('type')!.querySelector<HTMLInputElement>('input')?.focus();
	}
	#apply(): void {
		const state = this.controller.state;
		const page = state.document?.pages[state.pageIndex];
		if (!page) return this.dialog.close();
		const mode = (this.dialog.body.querySelector<HTMLInputElement>(
			'input[name="select-by"]:checked',
		)?.value ?? 'type') as Mode;
		const values = [
			...this.#lists.get(mode)!.querySelectorAll<HTMLInputElement>('input:checked'),
		].map((input) => input.value);
		if (!values.length) {
			this.dialog.error.textContent = 'Choose at least one option.';
			return;
		}
		const query: VisioSelectByTypeQuery =
			mode === 'type'
				? { by: 'type', types: values as VisioSelectType[] }
				: mode === 'layer'
					? { by: 'layer', layerIds: values }
					: { by: 'master', masterIds: values };
		this.controller.selectShapes(visioSelectByType(page, query));
		this.dialog.close();
		const count = this.controller.state.selectedShapes.length;
		this.announce(count ? `Selected ${count} shape${count === 1 ? '' : 's'}.` : 'No shapes match.');
	}
	render(state: ViewerState): void {
		const page = state.document?.pages[state.pageIndex];
		const command = this.root.querySelector<RibbonCommand>('[command="select-by-type"]');
		if (command) {
			command.disabled = !page || state.loading;
			command.title = page
				? 'Select by Type...: select shapes by type, layer or master.'
				: 'Select by Type...: open a drawing first.';
		}
		if (this.dialog.open && (!page || state.loading)) this.dialog.close();
	}
}
