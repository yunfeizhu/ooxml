import {
	inspectVisioRasterImage,
	VISIO_CLIPBOARD_MAGIC,
	VISIO_PICTURE_MAX_BYTES,
} from 'ooxml-core/visio';
import {
	editErrorMessage,
	isEditCancellation,
	visioPasteTextCommand,
	visioPictureInsertCommand,
} from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';
import type { RibbonCommand } from './ribbon-parts';
import { choice, fieldset, ViewerDialog } from './viewer-dialog';

type Format = 'shapes' | 'text' | 'picture';
const PICTURE_TYPES = ['image/png', 'image/jpeg', 'image/gif'];

/**
 * Home > Clipboard > Paste Special: paste the clipboard as Visio shapes (the viewer's own shape
 * clipboard), as unformatted text in a new text box, or as a picture (PNG, JPEG or GIF through
 * the picture insertion edit). Reading the clipboard needs the browser's permission.
 */
export class ViewerPasteSpecial {
	readonly dialog: ViewerDialog;
	#inputs = new Map<Format, HTMLInputElement>();
	constructor(
		private readonly root: ShadowRoot,
		private readonly controller: ViewerController,
		private readonly announce: (message: string) => void,
		private readonly pasteShapes: () => Promise<void>,
	) {
		const doc = root.ownerDocument;
		this.dialog = new ViewerDialog(
			root,
			'paste-special-dialog',
			'Paste Special',
			['OK', 'Cancel'],
			(b) => (b === 'OK' ? void this.#apply() : this.dialog.close()),
		);
		const rows = (
			[
				['shapes', 'Visio shapes'],
				['text', 'Unformatted text'],
				['picture', 'Picture (PNG, JPEG or GIF)'],
			] as const
		).map(([format, label]) => {
			const item = choice(doc, 'radio', 'paste-as', format, label);
			this.#inputs.set(format, item.input);
			return item.row;
		});
		this.dialog.body.append(fieldset(doc, 'As', ...rows));
	}
	get #clipboard(): Clipboard | undefined {
		return this.root.ownerDocument.defaultView?.navigator.clipboard;
	}
	#reason(state: ViewerState): string | undefined {
		if (!state.edit.sourceAvailable) return 'Open a .vsdx file to paste.';
		if (state.loading || state.edit.busy) return 'Wait for the current edit to finish.';
		if (!state.document?.pages[state.pageIndex]) return 'Open a page first.';
		if (typeof this.#clipboard?.readText !== 'function')
			return 'This browser does not let the page read the clipboard.';
		return undefined;
	}
	open(): void {
		const reason = this.#reason(this.controller.state);
		if (reason) {
			this.announce(`Paste Special: ${reason}`);
			return;
		}
		const picture = this.#inputs.get('picture')!;
		const canRead = typeof this.#clipboard?.read === 'function';
		picture.disabled = !canRead;
		picture.toggleAttribute('data-unavailable', !canRead);
		picture.parentElement!.title = canRead
			? ''
			: 'This browser cannot read pictures from the clipboard.';
		this.#inputs.get('shapes')!.checked = true;
		this.dialog.show();
		this.#inputs.get('shapes')!.focus();
	}
	async #apply(): Promise<void> {
		const format = [...this.#inputs].find(([, input]) => input.checked)?.[0] ?? 'shapes';
		const clipboard = this.#clipboard;
		if (!clipboard) return;
		this.dialog.busy(true);
		try {
			if (format === 'shapes') await this.pasteShapes();
			else if (format === 'text') await this.#text(await clipboard.readText());
			else await this.#picture(clipboard);
			this.dialog.close();
		} catch (error) {
			if (!isEditCancellation(error) && this.dialog.open)
				this.dialog.error.textContent =
					error instanceof DOMException && error.name === 'NotAllowedError'
						? 'The browser did not allow reading the clipboard.'
						: editErrorMessage(error);
		} finally {
			this.dialog.busy(false);
		}
	}
	async #text(text: string): Promise<void> {
		if (text.startsWith(VISIO_CLIPBOARD_MAGIC))
			throw new Error('The clipboard holds Visio shapes: choose Visio shapes to paste them.');
		const state = this.controller.state;
		const page = state.document?.pages[state.pageIndex];
		const command = page && visioPasteTextCommand(page, text);
		if (!page || !command) throw new Error('The clipboard has no text to paste (or too much).');
		const token = this.controller.captureCreationToken(page.id);
		await this.controller.applyCreationEdits([command], token);
		this.announce('Pasted the clipboard text as a text box.');
	}
	async #picture(clipboard: Clipboard): Promise<void> {
		const items = await clipboard.read();
		let blob: Blob | undefined;
		for (const item of items) {
			const type = item.types.find((candidate) => PICTURE_TYPES.includes(candidate));
			if (type) {
				blob = await item.getType(type);
				break;
			}
		}
		if (!blob) throw new Error('The clipboard holds no PNG, JPEG or GIF picture.');
		if (blob.size > VISIO_PICTURE_MAX_BYTES)
			throw new Error('The clipboard picture is larger than the 8 MB picture limit.');
		const bytes = new Uint8Array(await blob.arrayBuffer());
		const state = this.controller.state;
		const page = state.document?.pages[state.pageIndex];
		if (!page) throw new Error('Open a page first.');
		const command = visioPictureInsertCommand(page, inspectVisioRasterImage(bytes), bytes);
		const token = this.controller.captureCreationToken(page.id);
		await this.controller.applyCreationEdits([command], token);
		this.announce('Pasted the clipboard picture.');
	}
	render(state: ViewerState): void {
		const reason = this.#reason(state);
		const command = this.root.querySelector<RibbonCommand>('[command="paste-special"]');
		if (command) {
			command.disabled = reason !== undefined;
			command.title = reason
				? `Paste Special...: ${reason}`
				: 'Paste Special...: paste as Visio shapes, unformatted text or a picture.';
		}
		if (this.dialog.open && reason && !state.edit.busy) this.dialog.close();
	}
}
