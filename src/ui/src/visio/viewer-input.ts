import { editErrorMessage, isEditCancellation, visioNudgeCommands } from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';
import { pointerShapeTarget } from './viewer-shape-target';
interface Controls {
	viewport: HTMLDivElement;
	zoomSlider: HTMLElement & { value: number };
}
const targetShape = (event: Event) =>
	(event.target as Element)?.closest?.<SVGGElement>('[data-shape-id]');
function selection(target: SVGGElement | undefined | null): ViewerState['selectedShape'] {
	return target
		? {
				id: target.dataset.shapeId!,
				name: target.dataset.shapeName ?? '',
				...(target.dataset.pageId ? { pageId: target.dataset.pageId } : {}),
			}
		: null;
}
/** Page inches an arrow key nudges the selection: the editor's 1/16-inch drawing snap. */
export const NUDGE_STEP = 1 / 16;
const editableTarget = (event: Event) =>
	(event.target as Element | null)?.closest?.('input, textarea, select, [contenteditable]');

/**
 * Arrow keys nudge the selection, as in Visio: by {@link NUDGE_STEP}, or by one screen pixel with
 * Shift. True when the key was a nudge (handled, even when refused or still busy).
 */
function nudge(
	event: KeyboardEvent,
	controller: ViewerController,
	announce: (message: string) => void,
): boolean {
	const state = controller.state;
	const page = state.document?.pages[state.pageIndex];
	if (
		!page ||
		!state.selectedShapes.length ||
		!state.edit.sourceAvailable ||
		state.loading ||
		event.ctrlKey ||
		event.metaKey ||
		event.altKey ||
		editableTarget(event)
	)
		return false;
	const step = event.shiftKey ? 1 / (96 * (state.zoom || 1)) : NUDGE_STEP;
	const ids = state.selectedShapes.map((shape) => shape.id);
	const edits = visioNudgeCommands(page, ids, event.key, step);
	if (edits === null) return false;
	event.preventDefault();
	// Key repeat while the previous nudge is still saving is dropped, not queued.
	if (state.edit.busy) return true;
	if (!edits) {
		announce('The selection cannot be nudged.');
		return true;
	}
	if (edits.length)
		controller.applySelectionEdits(edits).catch((error: unknown) => {
			if (!isEditCancellation(error)) announce(editErrorMessage(error));
		});
	return true;
}

/** Own every DOM listener and abort them together when the surface is disposed. */
export function wireViewerInputs(
	controls: Controls,
	controller: ViewerController,
	fit: (mode: 'page' | 'width') => void,
	announce: (message: string) => void = () => {},
	/** Typing a character with one shape selected starts editing its text; true when it did. */
	typeText: (character: string) => boolean = () => false,
): () => void {
	const { viewport, zoomSlider } = controls;
	const Abort = viewport.ownerDocument.defaultView?.AbortController ?? AbortController,
		events = new Abort();
	const options = { signal: events.signal };
	const activate = (target: SVGGElement | null | undefined, additive: boolean) => {
		const shape = selection(target);
		if (shape && additive) controller.toggleShapeSelection(shape);
		else controller.selectShape(shape);
	};
	zoomSlider.addEventListener('input', () => controller.setZoom(zoomSlider.value / 100), options);
	viewport.addEventListener(
		'click',
		(event) => {
			const additive = event.shiftKey || event.ctrlKey || event.metaKey;
			activate(
				pointerShapeTarget(event.target, controller.state.selectedShapes, additive),
				additive,
			);
		},
		options,
	);
	viewport.addEventListener(
		'keydown',
		(event) => {
			if (nudge(event, controller, announce)) return;
			if (
				event.key.length === 1 &&
				event.key !== ' ' &&
				!event.ctrlKey &&
				!event.metaKey &&
				!event.altKey &&
				!event.isComposing &&
				!editableTarget(event) &&
				controller.state.selectedShapes.length === 1 &&
				controller.state.edit.sourceAvailable &&
				typeText(event.key)
			) {
				event.preventDefault();
				event.stopPropagation();
				return;
			}
			const target = targetShape(event);
			if (
				target &&
				['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(event.key)
			) {
				event.preventDefault();
				const shapes = Array.from(viewport.querySelectorAll<SVGGElement>('[data-shape-id]')),
					index = shapes.indexOf(target);
				const next =
					event.key === 'Home'
						? 0
						: event.key === 'End'
							? shapes.length - 1
							: (index +
									(['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) +
									shapes.length) %
								shapes.length;
				for (const shape of shapes) shape.setAttribute('tabindex', '-1');
				shapes[next]?.setAttribute('tabindex', '0');
				shapes[next]?.focus();
				return;
			}
			if (target && (event.key === 'Enter' || event.key === ' ')) {
				event.preventDefault();
				activate(target, event.shiftKey || event.ctrlKey || event.metaKey);
				return;
			}
			if (event.key === 'Escape') controller.selectShape(null);
			if (event.key === '+' || event.key === '=') {
				event.preventDefault();
				controller.setZoom(controller.state.zoom * 1.25);
			}
			if (event.key === '-') {
				event.preventDefault();
				controller.setZoom(controller.state.zoom / 1.25);
			}
			if (event.key === '0') {
				event.preventDefault();
				fit('page');
			}
		},
		options,
	);
	return () => events.abort();
}
