import { visioPageLayout, type VisioEdit, type VisioPage } from 'ooxml-core/visio';
import {
	VISIO_PAPER_SIZES,
	visioFitToDrawingEdits,
	visioMatchingPaperSize,
	visioNewPageId,
	visioOrientationEdits,
	visioPageBreaks,
	visioPageDecorationState,
	visioPageSizePresetEdits,
} from 'ooxml-core/visio/ui';
import type { OfficeUiGallery } from '../ribbon/gallery';
import type { ViewerController, ViewerState } from './controller';
import type { VisioPageSetupCommand } from './page-setup-action';
import type { RibbonCommand } from './ribbon-parts';
import { backgroundsState, bordersState, syncDecorationGallery } from './ribbon-page-setup';
import { ViewerPageSetupDialog } from './viewer-page-setup-dialog';
import { drawPageBreaks } from './viewer-page-breaks';
import { ViewerRulerGrid } from './viewer-ruler-grid';
import { ViewerSnapGlue } from './viewer-snap-glue';

type Edit = (run: () => Promise<void>, message: string) => void;

/**
 * Design > Page Setup and Backgrounds, File > Page Setup and View > Page Breaks. Every change is
 * one source-backed core edit, so undo and redo come from the document history; locks, formulas
 * and unmanaged background pages are refused by the core with its reason.
 */
export class ViewerPageSetup {
	#breaks = false;
	readonly dialog: ViewerPageSetupDialog;
	/** View > Show > Ruler & Grid, and the page's grid and ruler values. */
	readonly rulerGrid: ViewerRulerGrid;
	/** View > Visual Aids > Snap & Glue. */
	readonly snapGlue: ViewerSnapGlue;
	constructor(
		private readonly root: ShadowRoot,
		private readonly controller: ViewerController,
		private readonly edit: Edit,
		private readonly announce: (message: string) => void,
	) {
		this.dialog = new ViewerPageSetupDialog(root, controller, announce);
		this.rulerGrid = new ViewerRulerGrid(root, controller, announce);
		this.snapGlue = new ViewerSnapGlue(root, controller, announce);
	}
	get pageBreaks(): boolean {
		return this.#breaks;
	}
	#refusal(state: ViewerState): string | undefined {
		if (!state.document?.pages[state.pageIndex]) return 'Open a drawing first.';
		if (!state.edit.sourceAvailable) return 'Open a .vsdx file to change the page setup.';
		if (state.loading || state.edit.busy) return 'Wait for the current edit to finish.';
		return undefined;
	}
	#apply(edits: VisioEdit[] | undefined | string, message: string): void {
		if (typeof edits === 'string') return this.announce(edits);
		if (!edits) return this.announce('The page size is not usable.');
		if (!edits.length) return this.announce('No changes were made.');
		this.edit(() => this.controller.applyEdits(edits), message);
	}
	run(command: VisioPageSetupCommand): void {
		const state = this.controller.state;
		const page = state.document?.pages[state.pageIndex];
		if (command.op === 'page-breaks') {
			this.#breaks = !this.#breaks;
			return this.render(state);
		}
		if (command.op === 'dialog') return this.dialog.show(command.tab);
		const refusal = this.#refusal(state);
		if (refusal !== undefined || !page || !state.document) return this.announce(refusal ?? '');
		switch (command.op) {
			case 'orientation':
				return this.#apply(
					visioOrientationEdits(page, command.value),
					`Orientation set to ${command.value}.`,
				);
			case 'size': {
				const size = VISIO_PAPER_SIZES.find((item) => item.id === command.id);
				return this.#apply(
					visioPageSizePresetEdits(page, command.id),
					`Page size set to ${size?.label}.`,
				);
			}
			case 'fit':
				return this.#apply(visioFitToDrawingEdits(page), 'Fitted the page to the drawing.');
			case 'line-jumps': {
				const on = visioPageLayout(page).lineJumpCode !== 0;
				// Visio's toggle: horizontal lines jump (its default) or nothing does.
				return this.#apply(
					[{ type: 'set-page-layout', pageId: page.id, lineJumpCode: on ? 0 : 1 }],
					on ? 'Line jumps are hidden.' : 'Line jumps are shown.',
				);
			}
			case 'auto-size':
				return this.#apply(
					[{ type: 'set-page-setup', pageId: page.id, autoSize: page.drawingResizeType !== 1 }],
					page.drawingResizeType === 1 ? 'Auto Size is off.' : 'Auto Size is on.',
				);
			default:
				return this.#decorate(page, command);
		}
	}
	#decorate(
		page: VisioPage,
		command: Extract<VisioPageSetupCommand, { op: 'background' | 'background-color' | 'border' }>,
	): void {
		const document = this.controller.state.document!;
		const decoration = visioPageDecorationState(document, page);
		if (decoration.refusal) return this.announce(decoration.refusal);
		const backgroundPageId = decoration.backgroundPage ? undefined : visioNewPageId(document);
		const target = {
			type: 'set-page-decoration' as const,
			pageId: page.id,
			...(backgroundPageId ? { backgroundPageId } : {}),
		};
		if (command.op === 'border')
			return this.#apply(
				[
					{
						...target,
						kind: 'border',
						style: command.style,
						...(command.style ? { title: decoration.border?.title ?? page.name } : {}),
					},
				],
				command.style ? 'Applied the border and title.' : 'Removed the border and title.',
			);
		if (command.op === 'background')
			return this.#apply(
				[{ ...target, kind: 'background', style: command.style }],
				command.style ? 'Applied the background.' : 'Removed the background.',
			);
		const style = decoration.background?.style;
		if (!style) return this.announce('Apply a background first.');
		this.#apply(
			[{ ...target, kind: 'background', style, color: command.color }],
			'Changed the background color.',
		);
	}
	wire(): () => void {
		const listener = (event: Event) => {
			if ((event as CustomEvent<{ command?: unknown }>).detail?.command === 'page-setup-dialog')
				this.dialog.show();
		};
		this.root.addEventListener('office-command', listener);
		const disposeRulerGrid = this.rulerGrid.wire();
		const disposeSnapGlue = this.snapGlue.wire();
		return () => {
			this.root.removeEventListener('office-command', listener);
			this.dialog.close();
			disposeRulerGrid();
			disposeSnapGlue();
		};
	}
	render(state: ViewerState): void {
		this.dialog.render(state);
		this.rulerGrid.render(state);
		this.snapGlue.render(state);
		const page = state.document?.pages[state.pageIndex];
		const refusal = this.#refusal(state);
		const query = <T extends Element = RibbonCommand>(selector: string) =>
			this.root.querySelector<T & RibbonCommand>(selector);
		for (const id of ['orientation', 'size']) {
			const menu = query(`[data-menu="${id}"]`);
			if (menu) {
				menu.disabled = refusal !== undefined;
				menu.title =
					refusal === undefined
						? id === 'size'
							? 'Size'
							: 'Orientation'
						: `${id === 'size' ? 'Size' : 'Orientation'}: ${refusal}`;
			}
		}
		const portrait = !!page && page.height >= page.width;
		query('[command="orientation-portrait"]')?.setAttribute('checked', String(!!page && portrait));
		query('[command="orientation-landscape"]')?.setAttribute(
			'checked',
			String(!!page && !portrait),
		);
		const match = page ? visioMatchingPaperSize(page) : undefined;
		for (const size of VISIO_PAPER_SIZES)
			query(`[command="size-${size.id}"]`)?.setAttribute('checked', String(match === size));
		const auto = query('[command="auto-size"]');
		if (auto) {
			auto.disabled = refusal !== undefined;
			auto.setAttribute('pressed', String(page?.drawingResizeType === 1));
			auto.title =
				refusal ??
				'Auto Size: grow the page right and up in page tiles when shapes leave it. Shapes past the left or bottom edge do not grow it.';
		}
		const jumps = query('[command="line-jumps"]');
		if (jumps) {
			jumps.disabled = refusal !== undefined;
			jumps.setAttribute('checked', String(!!page && visioPageLayout(page).lineJumpCode !== 0));
			jumps.title =
				refusal === undefined
					? 'Show Line Jumps: draw a jump where one connector crosses another.'
					: `Show Line Jumps: ${refusal}`;
		}
		const group = query<HTMLElement>('office-ui-ribbon-group[launcher="page-setup-dialog"]');
		group?.toggleAttribute('launcher-disabled', refusal !== undefined);
		this.#renderDecorations(state, page, refusal);
		this.#renderBreaks(page);
	}
	#renderDecorations(
		state: ViewerState,
		page: VisioPage | undefined,
		refusal: string | undefined,
	): void {
		const decoration =
			page && state.document && refusal === undefined
				? visioPageDecorationState(state.document, page)
				: undefined;
		const reason = refusal ?? decoration?.refusal;
		const backgrounds = this.root.querySelector<OfficeUiGallery>(
			'office-ui-gallery[command="backgrounds"]',
		);
		if (backgrounds)
			syncDecorationGallery(
				backgrounds,
				backgroundsState(reason, decoration?.background?.style ?? null),
				reason,
			);
		const borders = this.root.querySelector<OfficeUiGallery>(
			'office-ui-gallery[command="borders-titles"]',
		);
		if (borders)
			syncDecorationGallery(
				borders,
				bordersState(reason, decoration?.border?.style ?? null),
				reason,
			);
		const color = this.root.querySelector<RibbonCommand>('[data-menu="background-color"]');
		if (color) {
			const colorReason =
				reason ?? (decoration?.background?.style ? undefined : 'Apply a background first.');
			color.disabled = colorReason !== undefined;
			color.title =
				colorReason === undefined ? 'Background Color' : `Background Color: ${colorReason}`;
		}
	}
	#renderBreaks(page: VisioPage | undefined): void {
		const box = this.root.querySelector<HTMLElement & { checked: boolean; disabled: boolean }>(
			'[data-check="page-breaks"]',
		);
		const breaks = page && this.#breaks ? visioPageBreaks(page) : undefined;
		if (box) {
			box.checked = this.#breaks;
			box.disabled = !page;
			(box.parentElement as HTMLElement).title = breaks?.assumedPaper
				? 'Page Breaks: no printer paper is saved, so Letter is assumed.'
				: 'Page Breaks: show where the page is split into printed sheets.';
		}
		const svg = this.root.querySelector<SVGSVGElement>('.viewport svg.paper');
		if (svg) drawPageBreaks(svg, breaks);
	}
}
