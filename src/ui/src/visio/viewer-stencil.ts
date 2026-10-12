import type { ViewerController } from './controller';
import { editErrorMessage, isEditCancellation } from 'ooxml-core/visio/ui';
import type { VisioDocument } from 'ooxml-core/visio';
import {
	visioMasterDropCommand,
	visioMasterDropRefusal,
	visioStencilDropCommand,
} from 'ooxml-core/visio/ui';
import { MASTER_MIME, findMaster, masterCreation, setShapesDocument } from './shapes-window';
import {
	DOCUMENT_STENCIL_NAME,
	documentMaster,
	shapesDocument,
	type ShapesDocument,
} from './shapes-document';
import { MASTER_QUICK_STYLE, pagePoint } from './viewer-draw-tool';

/**
 * Shapes window interaction: drag a master onto the page to drop it there, or activate it to add
 * it at the page centre. Either way the page gets an instance of a master, as in Visio: a master
 * of a built-in stencil is first copied into the drawing's own Document Stencil, and a master
 * that is already there is instanced directly. The window follows the open drawing: its Document
 * Stencil and the stencils it docks.
 */
export function wireStencil(
	pane: HTMLElement,
	viewport: HTMLElement,
	controller: ViewerController,
	announce: (message: string) => void,
): () => void {
	const Abort = pane.ownerDocument.defaultView?.AbortController ?? AbortController;
	const events = new Abort();
	const options = { signal: events.signal };
	// A drop is accepted while an earlier edit is still saving; the shape is added once it is done.
	const editable = () => {
		const { edit, loading } = controller.state;
		return edit.sourceAvailable && !loading;
	};
	const idle = () =>
		new Promise<void>((resolve) => {
			let stop: (() => void) | undefined;
			let done = false;
			stop = controller.subscribe((state) => {
				if (done || state.edit.busy) return;
				done = true;
				resolve();
				stop?.();
			});
			if (done) stop();
		});
	// Drawing the masters is the costly part, so it is done once per parsed drawing.
	const drawings = new WeakMap<VisioDocument, ShapesDocument>();
	let shown: VisioDocument | null | undefined;
	let generation: number | undefined;
	const follow = (model: VisioDocument | null): void => {
		if (model === shown) return;
		// Edits, undo and redo keep the source epoch; opening or replacing a drawing changes it.
		// No drawing (closed, or still loading) is never an edit of the one that was showing.
		const opened = !model || !shown || controller.sourceGeneration !== generation;
		generation = controller.sourceGeneration;
		shown = model;
		let next = model ? drawings.get(model) : undefined;
		if (!next) {
			next = shapesDocument(model);
			if (model) drawings.set(model, next);
		}
		setShapesDocument(pane, next, opened);
	};
	follow(controller.state.document);
	const unfollow = controller.subscribe((state) => follow(state.document));
	// Drops are added one at a time, in the order they were made, each where it was released.
	let queue = Promise.resolve();
	/** Drop a master of the drawing's own stencil as an instance of it. */
	const addInstance = (id: string, centre?: { clientX: number; clientY: number }) => {
		const state = controller.state;
		const page = state.document?.pages[state.pageIndex];
		const master = documentMaster(state.document, id);
		if (!master || !page) return queue;
		const refusal = visioMasterDropRefusal(master);
		if (refusal || !editable()) {
			announce(refusal ? `${master.name}: ${refusal}` : 'Open a .vsdx file to add shapes.');
			return queue;
		}
		const svg = viewport.querySelector<SVGSVGElement>('svg.paper');
		const point = centre && svg ? pagePoint(svg, page, centre) : undefined;
		queue = queue.then(async () => {
			try {
				if (controller.state.edit.busy) await idle();
				const current = controller.state;
				const target = current.document?.pages[current.pageIndex];
				const live = documentMaster(current.document, id);
				if (!target || target.id !== page.id || !live || !editable()) return;
				const command = visioMasterDropCommand(target, live, point);
				const token = controller.captureCreationToken(target.id);
				await controller.applyCreationEdits([command], token);
				announce(`${live.name} ${command.shapeId} added from ${DOCUMENT_STENCIL_NAME}.`);
			} catch (error) {
				if (!isEditCancellation(error) && !controller.state.edit.error)
					announce(editErrorMessage(error));
			}
		});
		return queue;
	};
	const known = (id: string): boolean =>
		!!masterCreation(id) || !!documentMaster(controller.state.document, id);
	const add = (id: string, centre?: { clientX: number; clientY: number }) => {
		if (documentMaster(controller.state.document, id)) return addInstance(id, centre);
		const master = masterCreation(id);
		const state = controller.state;
		const page = state.document?.pages[state.pageIndex];
		if (!master || !page) return queue;
		if (!editable()) {
			announce('Open a .vsdx file to add shapes.');
			return queue;
		}
		const svg = viewport.querySelector<SVGSVGElement>('svg.paper');
		const point = centre && svg ? pagePoint(svg, page, centre) : undefined;
		queue = queue.then(async () => {
			try {
				if (controller.state.edit.busy) await idle();
				const current = controller.state;
				const target = current.document?.pages[current.pageIndex];
				if (!target || target.id !== page.id || !editable()) return;
				// As in Visio: the master joins the drawing's own stencil and the page gets an instance
				// of it, kept whole on the page, in the theme's default look.
				const command = visioStencilDropCommand(target, id, point);
				const token = controller.captureCreationToken(target.id);
				await controller.applyCreationEdits(
					[
						command,
						{
							type: 'format-shape',
							pageId: target.id,
							shapeId: command.shapeId,
							quickStyle: MASTER_QUICK_STYLE,
						},
					],
					token,
				);
				const found = findMaster(id);
				announce(
					`${found?.master.name ?? 'Shape'} ${command.shapeId} added from ${found?.stencil.name}.`,
				);
			} catch (error) {
				if (!isEditCancellation(error) && !controller.state.edit.error)
					announce(editErrorMessage(error));
			}
		});
		return queue;
	};
	pane.addEventListener(
		'dragstart',
		(event) => {
			const master = (event.target as Element).closest?.<HTMLElement>('[data-master]');
			if (!master || !known(master.dataset.master!) || !event.dataTransfer) return;
			if ('unsupported' in master.dataset) return event.preventDefault();
			event.dataTransfer.setData(MASTER_MIME, master.dataset.master!);
			event.dataTransfer.effectAllowed = 'copy';
		},
		options,
	);
	pane.addEventListener(
		'click',
		(event) => {
			const master = (event.target as Element).closest?.<HTMLElement>('[data-master]');
			if (master) void add(master.dataset.master!);
		},
		options,
	);
	viewport.addEventListener(
		'dragover',
		(event) => {
			if (!event.dataTransfer?.types.includes(MASTER_MIME) || !editable()) return;
			event.preventDefault();
			event.dataTransfer.dropEffect = 'copy';
		},
		options,
	);
	viewport.addEventListener(
		'drop',
		(event) => {
			const id = event.dataTransfer?.getData(MASTER_MIME);
			if (!id) return;
			event.preventDefault();
			void add(id, event);
		},
		options,
	);
	return () => {
		unfollow();
		events.abort();
	};
}
