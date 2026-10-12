import type { VisioEdit, VisioPage, VisioPageSetupEdit, VisioScaleUnit } from 'ooxml-core/visio';
import {
	VISIO_PAPER_SIZES,
	editErrorMessage,
	visioFitToDrawingEdits,
	visioKeepAutoSize,
	visioMatchingPaperSize,
	visioPaperSize,
} from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';
import type { VisioPageSetupTab } from './page-setup-action';
import {
	createPageSetupDialog,
	SETUP_TABS,
	UNIT_INCHES,
	type SetupField,
	type SetupSelect,
} from './page-setup-dialog-form';

const round = (value: number) => String(+value.toFixed(4));

/**
 * Visio's Page Setup dialog (Design > Page Setup launcher, File > Print > Page Setup). OK commits
 * one page transaction; Size to fit drawing contents follows as a second step because it also
 * moves shapes. The core refuses formulas and locks it cannot prove.
 */
export class ViewerPageSetupDialog {
	readonly #view;
	#pageId = '';
	#generation = -1;
	#tab: VisioPageSetupTab = 'print';
	constructor(
		root: ShadowRoot,
		private readonly controller: ViewerController,
		private readonly announce: (message: string) => void = () => {},
	) {
		this.#view = createPageSetupDialog(root.ownerDocument);
		const view = this.#view;
		for (const [id, tab] of view.tabs) tab.addEventListener('click', () => this.#select(id));
		view.ok.addEventListener('office-command', () => void this.#apply());
		view.cancel.addEventListener('office-command', () => this.close());
		view.dialog.addEventListener('keydown', (event) => {
			if (event.key !== 'Escape' && event.key !== 'Tab') event.stopPropagation();
		});
		this.#field('size-mode').addEventListener('change', () => this.#sizeMode());
		this.#field('scale-mode').addEventListener('change', () => this.#scaleMode());
		root.append(view.dialog);
	}
	get element(): HTMLElement {
		return this.#view.dialog;
	}
	#field<T extends HTMLInputElement | SetupSelect = HTMLInputElement & SetupSelect>(
		name: SetupField,
	): T {
		return this.#view.fields.get(name) as T;
	}
	#select(tab: VisioPageSetupTab): void {
		this.#tab = tab;
		for (const [id] of SETUP_TABS) {
			const selected = id === tab;
			this.#view.tabs.get(id)!.setAttribute('aria-selected', String(selected));
			this.#view.tabs.get(id)!.tabIndex = selected ? 0 : -1;
			this.#view.panels.get(id)!.hidden = !selected;
		}
	}
	#page(): VisioPage | undefined {
		const state = this.controller.state;
		return state.document?.pages.find((page) => page.id === this.#pageId);
	}
	show(tab: VisioPageSetupTab = this.#tab): void {
		const state = this.controller.state;
		const page = state.document?.pages[state.pageIndex];
		if (!page || !state.document || !state.edit.sourceAvailable || state.loading) return;
		this.#pageId = page.id;
		this.#generation = this.controller.documentGeneration;
		const setup = page.pageSetup;
		const f = (name: SetupField) => this.#field(name);
		f('paper').value =
			setup?.paperKind !== undefined && visioPaperSize(setup.paperKind)
				? String(setup.paperKind)
				: '';
		f('print-orientation').value =
			setup?.printPageOrientation === 1
				? 'portrait'
				: setup?.printPageOrientation === 2
					? 'landscape'
					: '';
		const match = visioMatchingPaperSize(page);
		f('size-mode').value = match ? `preset:${match.id}` : 'custom';
		f('width').value = round(page.width);
		f('height').value = round(page.height);
		const scaled = (setup?.pageScale ?? 1) !== (setup?.drawingScale ?? 1);
		const unit =
			setup?.drawingScaleUnit && UNIT_INCHES[setup.drawingScaleUnit]
				? setup.drawingScaleUnit
				: 'IN';
		f('scale-mode').value = scaled ? 'custom' : 'none';
		f('scale-page').value = round(setup?.pageScale ?? 1);
		f('scale-drawing').value = round((setup?.drawingScale ?? 1) / UNIT_INCHES[unit]!);
		f('scale-unit').value = unit;
		f('type').value = page.isBackground ? 'background' : 'foreground';
		f('name').value = page.name;
		const backs = state.document.pages.filter((item) => item.isBackground && item.id !== page.id);
		const back = f('back-page') as SetupSelect;
		back.options = [
			{ value: '', label: 'None' },
			...backs.map((item) => ({ value: item.id, label: item.name })),
		];
		back.value = page.backgroundPageId ?? '';
		this.#view.error.textContent = '';
		this.#sizeMode();
		this.#scaleMode();
		this.#select(tab);
		this.#view.dialog.show();
		this.render(state);
		this.#view.tabs.get(tab)!.focus();
	}
	close(): void {
		this.#view.dialog.close();
	}
	#sizeMode(): void {
		const mode = this.#field('size-mode').value;
		const page = this.#page();
		const preset = VISIO_PAPER_SIZES.find((size) => `preset:${size.id}` === mode);
		const width = this.#field('width'),
			height = this.#field('height');
		const landscape = Number(width.value) > Number(height.value);
		const paper =
			mode === 'printer' ? visioPaperSize(Number(this.#field('paper').value) || 1) : preset;
		if (paper) {
			const turned =
				mode === 'printer' ? this.#field('print-orientation').value === 'landscape' : landscape;
			const [short, long] = [
				Math.min(paper.width, paper.height),
				Math.max(paper.width, paper.height),
			];
			width.value = round(turned ? long : short);
			height.value = round(turned ? short : long);
		} else if (mode === 'fit' && page) {
			width.value = round(page.width);
			height.value = round(page.height);
		}
		width.disabled = height.disabled = mode !== 'custom';
	}
	#scaleMode(): void {
		const custom = this.#field('scale-mode').value === 'custom';
		for (const name of ['scale-page', 'scale-drawing', 'scale-unit'] as const)
			this.#field(name).disabled = !custom;
		if (!custom) {
			this.#field('scale-page').value = '1';
			this.#field('scale-drawing').value = '1';
			this.#field('scale-unit').value = 'IN';
		}
	}
	render(state: ViewerState): void {
		if (!this.#view.dialog.open) return;
		if (
			!state.edit.sourceAvailable ||
			state.loading ||
			this.controller.documentGeneration !== this.#generation ||
			!this.#page()
		)
			return this.close();
		this.#view.ok.disabled = state.edit.busy;
	}
	/** The page transaction the form describes, or a message for the first invalid field. */
	edits(page: VisioPage): VisioEdit[] | string {
		const f = (name: SetupField) => this.#field(name).value;
		const edits: VisioEdit[] = [];
		const setup = page.pageSetup;
		const unit = f('scale-unit') as VisioScaleUnit;
		const scalePage = Number(f('scale-page')),
			scaleDrawing = Number(f('scale-drawing')) * (UNIT_INCHES[unit] ?? 1);
		if (!(scalePage > 0 && scaleDrawing > 0)) return 'Enter a positive drawing scale.';
		if (
			Math.abs(scalePage - (setup?.pageScale ?? 1)) > 1e-9 ||
			Math.abs(scaleDrawing - (setup?.drawingScale ?? 1)) > 1e-9 ||
			(f('scale-mode') === 'custom' && unit !== (setup?.drawingScaleUnit ?? 'IN'))
		)
			edits.push({
				type: 'set-page-setup',
				pageId: page.id,
				scale: { page: scalePage, drawing: scaleDrawing, unit },
			});
		const name = f('name');
		if (!name.trim()) return 'Enter a page name.';
		if (name !== page.name) edits.push({ type: 'rename-page', pageId: page.id, name });
		const background = f('type') === 'background';
		const backPageId = f('back-page') || null;
		if (background !== page.isBackground || backPageId !== (page.backgroundPageId ?? null))
			edits.push({
				type: 'set-page-properties',
				pageId: page.id,
				...(background !== page.isBackground ? { background } : {}),
				...(backPageId !== (page.backgroundPageId ?? null) ? { backPageId } : {}),
			});
		if (f('size-mode') !== 'fit') {
			const width = Number(f('width')),
				height = Number(f('height'));
			if (!(width > 0 && height > 0 && width <= 1e5 && height <= 1e5))
				return 'Enter a positive page size.';
			if (Math.abs(width - page.width) > 1e-4 || Math.abs(height - page.height) > 1e-4)
				edits.push({ type: 'set-page-size', pageId: page.id, width, height });
		}
		const print: VisioPageSetupEdit = { type: 'set-page-setup', pageId: page.id };
		const paper = f('paper');
		if (paper && Number(paper) !== setup?.paperKind) print.paperKind = Number(paper);
		const orientation = f('print-orientation');
		const saved =
			setup?.printPageOrientation === 1
				? 'portrait'
				: setup?.printPageOrientation === 2
					? 'landscape'
					: '';
		if ((orientation === 'portrait' || orientation === 'landscape') && orientation !== saved)
			print.printOrientation = orientation;
		if (Object.keys(print).length > 2) edits.push(print);
		return visioKeepAutoSize(page, edits);
	}
	async #apply(): Promise<void> {
		const page = this.#page();
		if (!page || !this.#view.dialog.open || this.controller.documentGeneration !== this.#generation)
			return;
		const edits = this.edits(page);
		if (typeof edits === 'string') {
			this.#view.error.textContent = edits;
			return;
		}
		const fit = this.#field('size-mode').value === 'fit';
		try {
			if (edits.length) await this.controller.applyEdits(edits);
			if (fit) {
				const fitted = this.#page();
				const plan = fitted ? visioFitToDrawingEdits(fitted) : 'The page is no longer open.';
				if (typeof plan === 'string') throw new Error(plan);
				await this.controller.applyEdits(plan);
			}
			this.close();
		} catch (error) {
			if (this.#view.dialog.open) this.#view.error.textContent = editErrorMessage(error);
			else this.announce(editErrorMessage(error));
		}
	}
}
