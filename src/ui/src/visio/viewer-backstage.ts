import type { ViewerState } from './controller';
import type { VsdxSource } from 'ooxml-core/visio/ui';
import { backstageItems, type BackstagePage } from './backstage';
import { wireNewDrawing } from './viewer-new-drawing';

/** What the backstage needs from the element; every action delegates to existing APIs. */
export interface BackstageHost {
	root: ShadowRoot;
	viewport: HTMLElement;
	fileName(): string;
	load(source: VsdxSource): Promise<void>;
	createBlankDrawing(): Promise<void>;
	exportVsdx(): { bytes: Uint8Array; dirty: boolean };
	exportSvg(): { svg: string; pageIndex: number };
	/** Raster PDF of the foreground pages, or a PNG of the current page (viewer-export). */
	exportPicture(format: 'pdf' | 'png'): Promise<{ blob: Blob; pageIndex: number }>;
	closeDocument(): void;
	showOptions(): void;
	announce(message: string): void;
	noteCount(): number;
	/** File > Print > Page Setup. */
	pageSetup?(): void;
}

/**
 * Visio's File backstage: opened from the File tab, closed with Back or Escape (focus returns to
 * File). New, Open, Save, Save As, Export, Print and Close delegate to shared source APIs.
 */
type Backstage = HTMLElement & {
	items: unknown;
	open: boolean;
	show(page?: string): void;
	close(): void;
};
type Ribbon = HTMLElement & { focusFile(): void };

export class ViewerBackstage {
	readonly #root: Backstage;
	readonly #ribbon: Ribbon;
	readonly #input: HTMLInputElement;
	#state: ViewerState | undefined;
	#items = '';
	#urls = new Set<string>();
	#newDrawing: ReturnType<typeof wireNewDrawing> | undefined;
	constructor(private readonly host: BackstageHost) {
		this.#root = host.root.querySelector<Backstage>('office-ui-backstage')!;
		this.#ribbon = host.root.querySelector<Ribbon>('office-ui-ribbon')!;
		this.#input = this.#root.querySelector('.backstage-file-input')!;
	}
	get open(): boolean {
		return this.#root.open;
	}
	show(page: BackstagePage = 'info'): void {
		this.#ribbon.setAttribute('file-expanded', 'true');
		this.#root.show(page);
		if (page === 'print') this.#preview();
	}
	hide(): void {
		this.#root.close();
	}
	wire(): () => void {
		const Abort = this.host.root.ownerDocument.defaultView?.AbortController ?? AbortController;
		const events = new Abort();
		const options = { signal: events.signal };
		this.#newDrawing = wireNewDrawing(
			this.host.root,
			() => this.host.createBlankDrawing(),
			() => !!(this.#state?.loading || this.#state?.edit.busy),
			this.host.announce,
		);
		this.#ribbon.addEventListener(
			'office-ribbon-file',
			() => (this.open ? this.hide() : this.show()),
			options,
		);
		this.#root.addEventListener(
			'office-backstage-select',
			(event) => {
				const id = (event as CustomEvent<{ id: string }>).detail.id;
				if (id === 'save') this.#download();
				else if (id === 'close') this.#close();
				else if (id === 'options') {
					// Visio opens its Options dialog over the drawing, not a backstage page.
					this.hide();
					this.host.showOptions();
				} else if (id === 'print') this.#preview();
			},
			options,
		);
		// Back, Escape or a command closed the backstage: return focus to File.
		this.#root.addEventListener(
			'office-backstage-close',
			() => {
				this.#ribbon.setAttribute('file-expanded', 'false');
				this.#ribbon.focusFile();
			},
			options,
		);
		this.#root.addEventListener(
			'click',
			(event) => {
				const action = (event.target as Element).closest?.<HTMLButtonElement>(
					'[data-backstage-action]',
				);
				if (action && !action.disabled) this.#run(action.dataset.backstageAction!);
			},
			options,
		);
		this.#input.addEventListener(
			'change',
			() => {
				const file = this.#input.files?.[0];
				this.#input.value = '';
				if (!file) return;
				this.hide();
				this.host
					.load(file)
					.catch((error: unknown) =>
						this.host.announce(error instanceof Error ? error.message : String(error)),
					);
			},
			options,
		);
		return () => {
			this.#newDrawing?.dispose();
			events.abort();
			for (const url of this.#urls) URL.revokeObjectURL(url);
			this.#urls.clear();
		};
	}
	#run(action: string): void {
		if (action === 'open') this.#input.click();
		else if (action === 'new-blank') this.#newDrawing?.run();
		else if (action === 'download') this.#download();
		else if (action === 'export-svg') this.#exportSvg();
		else if (action === 'export-pdf' || action === 'export-png')
			void this.#exportPicture(action === 'export-pdf' ? 'pdf' : 'png');
		else if (action === 'print') this.#print();
		else if (action === 'page-setup') {
			this.hide();
			this.host.pageSetup?.();
		}
	}
	#save(blob: Blob, name: string): void {
		const doc = this.host.root.ownerDocument;
		const url = URL.createObjectURL(blob);
		this.#urls.add(url);
		const anchor = doc.createElement('a');
		anchor.href = url;
		anchor.download = name;
		anchor.hidden = true;
		this.host.root.append(anchor);
		anchor.click();
		anchor.remove();
		// Keep the URL alive through browser download dispatch, then release it.
		doc.defaultView?.setTimeout(() => {
			if (this.#urls.delete(url)) URL.revokeObjectURL(url);
		}, 1000);
	}
	#base(): string {
		return this.host.fileName().replace(/\.vsdx?$/i, '') || 'Drawing';
	}
	/** Save: download the edited drawing as a copy (File > Save and the Quick Access Toolbar). */
	download(): void {
		this.#download();
	}
	#download(): void {
		if (!this.#state?.edit.sourceAvailable) return;
		try {
			const result = this.host.exportVsdx();
			this.#save(
				new Blob([new Uint8Array(result.bytes)], { type: 'application/vnd.ms-visio.drawing' }),
				`${this.#base()}-${result.dirty ? 'edited' : 'original'}-copy.vsdx`,
			);
			this.hide();
			this.host.announce('Downloaded a copy of the drawing.');
		} catch (error) {
			this.host.announce(error instanceof Error ? error.message : String(error));
		}
	}
	#exportSvg(): void {
		try {
			const result = this.host.exportSvg();
			this.#save(
				new Blob([result.svg], { type: 'image/svg+xml;charset=utf-8' }),
				`${this.#base()}-page-${result.pageIndex + 1}.svg`,
			);
			this.hide();
			this.host.announce('SVG export requested. This is an approximate snapshot.');
		} catch (error) {
			this.host.announce(error instanceof Error ? error.message : String(error));
		}
	}
	async #exportPicture(format: 'pdf' | 'png'): Promise<void> {
		this.hide();
		this.host.announce(`Preparing the ${format.toUpperCase()}...`);
		try {
			const { blob, pageIndex } = await this.host.exportPicture(format);
			const name = format === 'pdf' ? this.#base() : `${this.#base()}-page-${pageIndex + 1}`;
			this.#save(blob, `${name}.${format}`);
			this.host.announce(
				`${format.toUpperCase()} export requested. Pages are pictures of the approximate rendering.`,
			);
		} catch (error) {
			this.host.announce(error instanceof Error ? error.message : String(error));
		}
	}
	/** The shared print preview shows an inert clone of the rendered page, never parsed markup. */
	#preview(): void {
		const preview = this.#root.querySelector<HTMLElement & { pages: Node[] }>(
			'office-ui-print-preview',
		)!;
		const paper = this.host.viewport.querySelector('svg.paper');
		preview.pages = paper ? [paper] : [];
	}
	#print(): void {
		const doc = this.host.root.ownerDocument;
		const paper = this.host.viewport.querySelector('svg.paper');
		if (!paper || !doc.body) return;
		const frame = doc.createElement('iframe');
		frame.setAttribute('aria-hidden', 'true');
		frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
		doc.body.append(frame);
		const target = frame.contentDocument;
		const view = frame.contentWindow;
		if (!target || !view) return frame.remove();
		const clone = target.importNode(paper, true) as SVGSVGElement;
		clone.removeAttribute('style');
		clone.setAttribute('width', '100%');
		target.body.style.margin = '0';
		target.body.append(clone);
		view.addEventListener('afterprint', () => frame.remove(), { once: true });
		view.focus();
		view.print();
	}
	#close(): void {
		if (!this.#state?.document) return;
		this.hide();
		this.host.closeDocument();
	}
	render(state: ViewerState): void {
		this.#state = state;
		const page = state.document?.pages[state.pageIndex];
		const set = (key: string, value: string) => {
			const node = this.#root.querySelector(`[data-info="${key}"]`);
			if (node) node.textContent = value;
		};
		set('name', state.document ? this.host.fileName() || 'Untitled drawing' : 'No drawing open');
		set('pages', String(state.document?.pages.length ?? 0));
		set('page', page?.name ?? 'None');
		set('size', page ? `${page.width} × ${page.height} in` : 'None');
		set('shapes', page ? `${page.shapes.length} top-level` : 'None');
		set(
			'state',
			state.document?.format === 'vsd'
				? 'Legacy VSD preview (read only)'
				: !state.edit.sourceAvailable
					? state.document
						? 'Preview (read-only)'
						: 'None'
					: state.edit.dirty
						? 'Edited copy (not saved)'
						: 'Original',
		);
		const notes = this.host.noteCount();
		this.#root.querySelector('.backstage-note-count')!.textContent = notes
			? `${notes === 1 ? 'One part' : `${notes} parts`} of this drawing ${notes === 1 ? 'is' : 'are'} shown approximately or not at all:`
			: 'No compatibility notes.';
		const busy = state.loading || state.edit.busy;
		const blank = this.#root.querySelector<HTMLButtonElement>(
			'[data-backstage-action="new-blank"]',
		)!;
		blank.disabled = busy;
		blank.title = busy ? 'Wait for the current document operation.' : '';
		const saveReason =
			state.document?.format === 'vsd'
				? 'Legacy VSD drawings are read only here.'
				: 'Open a .vsdx file to save a copy.';
		const saveDisabled = !state.edit.sourceAvailable || busy;
		for (const download of this.#root.querySelectorAll<HTMLButtonElement>(
			'[data-backstage-action="download"]',
		)) {
			download.disabled = saveDisabled;
			download.title = saveDisabled ? saveReason : '';
		}
		const setup = this.#root.querySelector<HTMLButtonElement>(
			'[data-backstage-action="page-setup"]',
		);
		if (setup) {
			setup.disabled = !state.edit.sourceAvailable || busy || !page;
			setup.title = setup.disabled ? 'Open a .vsdx file to change the page setup.' : '';
		}
		// Rebuild the navigation only when Save or Close change, so focus stays put.
		const items = backstageItems({
			save: { disabled: saveDisabled, ...(saveDisabled ? { title: saveReason } : {}) },
			close: { disabled: !state.document },
		});
		const key = JSON.stringify(items);
		if (key !== this.#items) {
			this.#items = key;
			this.#root.items = items;
		}
		for (const node of this.#root.querySelectorAll<HTMLButtonElement>(
			'[data-backstage-action^="export-"], [data-backstage-action="print"]',
		))
			node.disabled = !page || busy;
	}
}
