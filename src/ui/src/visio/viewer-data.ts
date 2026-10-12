import type { VisioPage } from 'ooxml-core/visio';
import {
	VISIO_DATA_GRAPHIC_FILL_ROW,
	visioColorRules,
	visioDataGraphicEdits,
	visioDataGraphicFields,
	visioLegendEdits,
	visioRemoveDataGraphicEdits,
	visioShapeDataRow,
	type VisioDataGraphicKind,
} from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';
import type { VisioDataCommand } from './ribbon-action';
import type { RibbonCommand } from './ribbon-parts';
import { InsertDialog } from './viewer-insert-dialog';
import { ViewerDataSources } from './viewer-data-sources';
import { ViewerDataLinks } from './viewer-data-links';
import { ViewerShapeData } from './viewer-shape-data';

type Run = (action: () => Promise<void>, success: string) => void;
const KINDS: Record<string, VisioDataGraphicKind> = {
	'graphic-text': 'text',
	'graphic-bar': 'bar',
	'graphic-icon': 'icon',
	'graphic-color': 'color',
};
const KIND_LABELS = ['Text Callout', 'Data Bar', 'Icon Set', 'Color by Value'];

/**
 * Visio's Data tab: Quick and Custom Import of a local workbook or CSV into a saved recordset,
 * Refresh All, the External Data window with row linking, data graphics, a legend and the
 * Define Shape Data dialog. Documents stay local; nothing is fetched.
 */
export class ViewerData {
	readonly sources: ViewerDataSources;
	readonly graphics: InsertDialog;
	readonly links: ViewerDataLinks;
	readonly shapeData: ViewerShapeData;
	constructor(
		private readonly root: ShadowRoot,
		private readonly controller: ViewerController,
		private readonly announce: (message: string) => void,
		private readonly run: Run,
	) {
		this.graphics = new InsertDialog(
			root,
			'data-graphics-dialog',
			'Data Graphics',
			[
				{ name: 'field', label: 'Data field', choices: true },
				{ name: 'kind', label: 'Display as', choices: true },
				{ name: 'min', label: 'Minimum (blank for automatic)', input: 'number' },
				{ name: 'max', label: 'Maximum (blank for automatic)', input: 'number' },
			],
			['Apply', 'Cancel'],
			(button) => this.#applyGraphic(button),
		);
		this.graphics.choices('kind', Object.values(KINDS), 'text', {
			labels: KIND_LABELS,
			none: false,
		});
		this.links = new ViewerDataLinks(root, controller, announce, run);
		this.sources = new ViewerDataSources(root, controller, announce, run, this.links);
		this.links.onRefresh = () => void this.sources.refresh();
		this.shapeData = new ViewerShapeData(root, controller, announce);
	}
	#editable(state: ViewerState): boolean {
		return state.edit.sourceAvailable && !state.loading && !state.edit.busy;
	}
	#page(): VisioPage | undefined {
		const state = this.controller.state;
		return state.document?.pages[state.pageIndex];
	}
	/** Selected top-level shapes, or every top-level shape on the page. */
	#targets(page: VisioPage): string[] {
		const selected = this.controller.state.selectedShapes
			.filter((shape) => !shape.pageId || shape.pageId === page.id)
			.map((shape) => shape.id)
			.filter((id) => page.shapes.some((shape) => shape.id === id));
		return selected.length ? selected : page.shapes.map((shape) => shape.id);
	}
	handle(command: VisioDataCommand): void {
		const state = this.controller.state;
		if (command === 'external-data-window') return this.links.toggle();
		if (!this.#editable(state)) return;
		if (command === 'define-shape-data') return this.shapeData.open();
		if (command === 'quick-import' || command === 'custom-import')
			return void this.sources.import(command === 'custom-import');
		if (command === 'refresh') return void this.sources.refresh();
		const page = this.#page();
		if (!page) return;
		if (command === 'graphic-remove') {
			const targets = this.#targets(page);
			const all = targets.length === page.shapes.length;
			const edits = visioRemoveDataGraphicEdits(page, all ? [...targets, 'legend'] : targets);
			if (!edits.length) return this.announce('No data graphics to remove.');
			return this.run(() => this.controller.applyEdits(edits), 'Removed data graphics.');
		}
		if (command === 'legend') return this.#legend(page, 'vertical');
		if (command === 'legend-horizontal') return this.#legend(page, 'horizontal');
		const fields = visioDataGraphicFields(page);
		if (!fields.length)
			return this.announce(
				'Link or define Shape Data first; data graphics display Shape Data fields.',
			);
		this.graphics.choices(
			'field',
			fields.map((field) => field.name),
			fields[0]!.name,
			{ labels: fields.map((field) => field.label), none: false },
		);
		(this.graphics.fields.get('kind') as HTMLSelectElement).value = KINDS[command] ?? 'text';
		for (const name of ['min', 'max'])
			(this.graphics.fields.get(name) as HTMLInputElement).value = '';
		this.graphics.error.textContent = '';
		this.graphics.dialog.show();
		this.graphics.fields.get('field')!.focus();
	}
	#applyGraphic(button: string): void {
		if (button === 'Cancel') return this.graphics.dialog.close();
		const page = this.#page();
		if (!page) return;
		const number = (name: string) => {
			const text = this.graphics.value(name).trim();
			return text === '' ? undefined : Number(text);
		};
		const [min, max] = [number('min'), number('max')];
		if ([min, max].some((value) => value !== undefined && !Number.isFinite(value)))
			return void (this.graphics.error.textContent = 'Type numbers for the minimum and maximum.');
		const kind = this.graphics.value('kind') as VisioDataGraphicKind;
		const edits = visioDataGraphicEdits(page, this.#targets(page), {
			kind,
			field: this.graphics.value('field'),
			...(min === undefined ? {} : { min }),
			...(max === undefined ? {} : { max }),
		});
		if (!edits.length)
			return void (this.graphics.error.textContent =
				'No shapes have a usable value for this field.');
		this.graphics.dialog.close();
		this.run(
			() => this.controller.applyEdits(edits),
			`Applied ${KIND_LABELS[Object.values(KINDS).indexOf(kind)]} data graphics.`,
		);
	}
	#legend(page: VisioPage, orientation: 'vertical' | 'horizontal'): void {
		const coloured = page.shapes.filter((shape) =>
			visioShapeDataRow(shape, VISIO_DATA_GRAPHIC_FILL_ROW),
		);
		if (!coloured.length)
			return this.announce('Apply Color by Value first; the legend describes it.');
		const field = visioShapeDataRow(coloured[0]!, VISIO_DATA_GRAPHIC_FILL_ROW)!.label ?? '';
		const title = visioDataGraphicFields(page).find((item) => item.name === field)?.label ?? field;
		const rules = visioColorRules(
			page,
			coloured.map((shape) => shape.id),
			field,
		).rules;
		// One edit: an earlier legend is replaced, so the legend stays a single undo step.
		const edits = [
			...visioRemoveDataGraphicEdits(page, ['legend']),
			...visioLegendEdits(page, title, rules, orientation),
		];
		this.run(() => this.controller.applyEdits(edits), 'Inserted a legend for Color by Value.');
	}
	wire(viewport: HTMLElement): () => void {
		const disposeLinks = this.links.wire(viewport);
		const Abort = this.root.ownerDocument.defaultView?.AbortController ?? AbortController;
		const events = new Abort();
		this.root.addEventListener(
			'click',
			(event) => {
				if ((event.target as Element)?.closest?.('[data-define-shape-data]')) this.shapeData.open();
			},
			{ signal: events.signal },
		);
		return () => {
			events.abort();
			disposeLinks();
			for (const dialog of [this.sources.importer, this.graphics, this.shapeData.form])
				dialog.dialog.close();
		};
	}
	render(state: ViewerState): void {
		const editing = this.#editable(state);
		const page = state.document?.pages[state.pageIndex];
		const button = (name: string) => this.root.querySelector<RibbonCommand>(`[command="${name}"]`);
		const set = (name: string, enabled: boolean, title?: string) => {
			const control = button(name);
			if (!control) return;
			control.disabled = !enabled;
			if (title) control.title = title;
		};
		const local = 'Open a .vsdx file to import data. Documents stay on this device.';
		set(
			'quick-import',
			editing && !!page,
			editing ? 'Import an Excel workbook or CSV file from this device.' : local,
		);
		set(
			'custom-import',
			editing && !!page,
			editing ? 'Choose the worksheet, range and header row to import.' : local,
		);
		const recordsets = state.document?.dataRecordsets?.length ?? 0;
		set(
			'refresh-all',
			editing && recordsets > 0,
			recordsets ? 'Read the source files again and update linked shapes.' : 'Import data first.',
		);
		const fields = page ? visioDataGraphicFields(page).length : 0;
		for (const id of [
			'graphic-text',
			'graphic-bar',
			'graphic-icon',
			'graphic-color',
			'graphic-remove',
		])
			set(id, editing && fields > 0);
		const menuButton = this.root.querySelector<RibbonCommand>('[data-menu="data-graphics"]');
		if (menuButton) menuButton.disabled = !editing || !fields;
		const coloured = !!page?.shapes.some((shape) =>
			visioShapeDataRow(shape, VISIO_DATA_GRAPHIC_FILL_ROW),
		);
		set('legend-vertical', editing && coloured);
		set('legend-horizontal', editing && coloured);
		const legend = this.root.querySelector<RibbonCommand>('[data-menu="insert-legend"]');
		if (legend) {
			legend.disabled = !editing || !coloured;
			legend.title = coloured ? 'Insert Legend' : 'Insert Legend: apply Color by Value first.';
		}
		this.links.render(state);
		this.shapeData.render(state);
		for (const dialog of [this.sources.importer, this.graphics])
			if (dialog.dialog.open && (!state.edit.sourceAvailable || state.loading))
				dialog.dialog.close();
	}
}
