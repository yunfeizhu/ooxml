import { VISIO_GLUE, VISIO_SNAP, visioSnapGlue, type VisioSnapGlue } from 'ooxml-core/visio';
import { editErrorMessage, isEditCancellation } from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';
import { ViewerDialog, choice, fieldset } from './viewer-dialog';

const LABEL = 'Snap & Glue';
/** Visio's lists, in its order: label and bit. */
const SNAP_TO: readonly (readonly [string, number])[] = [
	['Ruler subdivisions', VISIO_SNAP.rulerSubdivisions],
	['Grid', VISIO_SNAP.grid],
	['Alignment box', VISIO_SNAP.alignmentBox],
	['Shape extensions', VISIO_SNAP.extensions],
	['Shape geometry', VISIO_SNAP.geometry],
	['Guides', VISIO_SNAP.guides],
	['Shape intersections', VISIO_SNAP.intersections],
	['Shape handles', VISIO_SNAP.handles],
	['Shape vertices', VISIO_SNAP.vertices],
	['Connection points', VISIO_SNAP.connectionPoints],
];
const GLUE_TO: readonly (readonly [string, number])[] = [
	['Shape geometry', VISIO_GLUE.geometry],
	['Guides', VISIO_GLUE.guides],
	['Shape handles', VISIO_GLUE.handles],
	['Shape vertices', VISIO_GLUE.vertices],
	['Connection points', VISIO_GLUE.connectionPoints],
];

/**
 * View > Visual Aids > Snap & Glue, as Visio's dialog: whether snapping and gluing are active and
 * what they snap and glue to. OK saves the drawing's DocumentSettings as one `set-snap-glue`
 * edit. This editor acts on Snap (grid and guides), Glue and Glue to connection points; the
 * other choices are saved for Visio and say so in the dialog. View > Dynamic Grid stays a
 * per-viewer toggle and is not in this dialog.
 */
export class ViewerSnapGlue {
	readonly dialog: ViewerDialog;
	#boxes = new Map<string, HTMLInputElement>();
	#generation: number | undefined;
	constructor(
		private readonly root: ShadowRoot,
		private readonly controller: ViewerController,
		private readonly announce: (message: string) => void,
	) {
		const doc = root.ownerDocument;
		this.dialog = new ViewerDialog(root, 'snap-glue-dialog', LABEL, ['OK', 'Cancel'], (button) =>
			button === 'OK' ? void this.#apply() : this.dialog.close(),
		);
		const list = (legend: string, prefix: string, items: readonly (readonly [string, number])[]) =>
			fieldset(
				doc,
				legend,
				...items.map(([label, bit]) => this.#box(doc, `${prefix}:${bit}`, label)),
			);
		const columns = doc.createElement('div');
		columns.className = 'snap-glue-columns';
		columns.append(
			fieldset(
				doc,
				'Currently active',
				this.#box(doc, 'snap', 'Snap'),
				this.#box(doc, 'glue', 'Glue'),
			),
			list('Snap to', 'snap', SNAP_TO),
			list('Glue to', 'glue', GLUE_TO),
		);
		const note = doc.createElement('p');
		note.className = 'snap-glue-note';
		note.textContent =
			'This editor snaps to the grid and guides and glues to shapes and connection points. The other choices are saved for Visio.';
		this.dialog.body.append(columns, note);
	}
	#box(doc: Document, key: string, label: string): HTMLElement {
		const { row, input } = choice(doc, 'checkbox', 'snap-glue', key, label);
		input.dataset.option = key;
		this.#boxes.set(key, input);
		return row;
	}
	#refusal(state: ViewerState): string | undefined {
		if (!state.document) return 'Open a drawing first.';
		if (!state.edit.sourceAvailable) return 'Open a .vsdx file to change snap and glue.';
		if (state.loading || state.edit.busy) return 'Wait for the current edit to finish.';
		return undefined;
	}
	/** The drawing's settings, or Visio's defaults without a drawing. */
	settings(state: ViewerState = this.controller.state): VisioSnapGlue {
		return visioSnapGlue(state.document ?? {});
	}
	show(): void {
		const state = this.controller.state;
		const refusal = this.#refusal(state);
		if (refusal !== undefined) return this.announce(`${LABEL}: ${refusal}`);
		const current = this.settings(state);
		for (const [key, box] of this.#boxes) {
			const [kind, bit] = key.split(':');
			const value = kind === 'snap' ? current.snapSettings : current.glueSettings;
			box.checked =
				bit === undefined
					? !(value & (kind === 'snap' ? VISIO_SNAP.disabled : VISIO_GLUE.disabled))
					: !!(value & Number(bit));
		}
		this.#generation = this.controller.documentGeneration;
		this.dialog.show();
		this.#boxes.get('snap')!.focus();
	}
	#values(): Pick<VisioSnapGlue, 'snapSettings' | 'glueSettings'> {
		const mask = (prefix: 'snap' | 'glue', disabled: number) => {
			let value = this.#boxes.get(prefix)!.checked ? 0 : disabled;
			for (const [key, box] of this.#boxes)
				if (key.startsWith(`${prefix}:`) && box.checked) value |= Number(key.split(':')[1]);
			return value;
		};
		return {
			snapSettings: mask('snap', VISIO_SNAP.disabled),
			glueSettings: mask('glue', VISIO_GLUE.disabled),
		};
	}
	async #apply(): Promise<void> {
		const state = this.controller.state;
		if (!state.document || this.controller.documentGeneration !== this.#generation)
			return this.dialog.close();
		const current = this.settings(state);
		const next = this.#values();
		const changed = (Object.keys(next) as (keyof typeof next)[]).filter(
			(key) => next[key] !== current[key],
		);
		if (!changed.length) return this.dialog.close();
		this.dialog.busy(true);
		try {
			await this.controller.applyEdits([
				{ type: 'set-snap-glue', ...Object.fromEntries(changed.map((key) => [key, next[key]])) },
			]);
			this.dialog.close();
			this.announce('Updated snap and glue.');
		} catch (error) {
			if (this.dialog.open && !isEditCancellation(error))
				this.dialog.error.textContent = editErrorMessage(error);
		} finally {
			this.dialog.busy(false);
		}
	}
	wire(): () => void {
		const listener = (event: Event) => {
			if ((event as CustomEvent<{ command?: unknown }>).detail?.command === 'visual-aids-dialog')
				this.show();
		};
		this.root.addEventListener('office-command', listener);
		return () => {
			this.root.removeEventListener('office-command', listener);
			this.dialog.close();
		};
	}
	render(state: ViewerState): void {
		const refusal = this.#refusal(state);
		const group = this.root.querySelector<HTMLElement>(
			'office-ui-ribbon-group[launcher="visual-aids-dialog"]',
		);
		group?.toggleAttribute('launcher-disabled', refusal !== undefined);
		if (group) group.title = refusal === undefined ? LABEL : `${LABEL}: ${refusal}`;
		if (
			this.dialog.open &&
			(state.loading || this.controller.documentGeneration !== this.#generation)
		)
			this.dialog.close();
	}
}
