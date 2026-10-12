import { selectionKey } from 'ooxml-core/visio/ui';
import type { ViewerController } from './controller';
import { contextMenu } from './ribbon-parts';
import { pointerShapeTarget } from './viewer-shape-target';

/** Visio's shape and page context menus; commands the core lacks are shown disabled. */
export function createContextMenus(doc: Document): HTMLElement[] {
	return [
		contextMenu(doc, 'shape', 'Shape', [
			{
				id: 'ctx-cut',
				label: 'Cut',
				icon: 'cut',
				action: { type: 'clipboard', operation: 'cut' },
				keys: ['Control+X', 'Ctrl+X'],
			},
			{
				id: 'ctx-copy',
				label: 'Copy',
				icon: 'copy',
				action: { type: 'clipboard', operation: 'copy' },
				keys: ['Control+C', 'Ctrl+C'],
			},
			{
				id: 'ctx-paste',
				label: 'Paste',
				icon: 'paste',
				action: { type: 'clipboard', operation: 'paste' },
				keys: ['Control+V', 'Ctrl+V'],
			},
			{
				id: 'ctx-duplicate',
				label: 'Duplicate',
				icon: 'copy',
				action: { type: 'duplicate' },
				keys: ['Control+D', 'Ctrl+D'],
			},
			'-',
			{
				id: 'ctx-edit-text',
				label: 'Edit Text',
				icon: 'pencil',
				action: { type: 'reveal', panel: 'edit', focusText: true },
			},
			'-',
			{
				id: 'ctx-group',
				label: 'Group',
				icon: 'group',
				action: { type: 'grouping', operation: 'group' },
				keys: ['Control+Shift+G', 'Ctrl+Shift+G'],
			},
			{
				id: 'ctx-ungroup',
				label: 'Ungroup',
				icon: 'group',
				action: { type: 'grouping', operation: 'ungroup' },
				keys: ['Control+Shift+U', 'Ctrl+Shift+U'],
			},
			{
				id: 'ctx-container',
				label: 'Container',
				icon: 'rectangle',
				action: { type: 'diagram-part', part: 'container', style: 'classic' },
			},
			{
				id: 'ctx-bring-to-front',
				label: 'Bring to Front',
				icon: 'bringToFront',
				action: { type: 'shape-order', order: 'front' },
			},
			{
				id: 'ctx-bring-forward',
				label: 'Bring Forward',
				icon: 'bringToFront',
				action: { type: 'shape-order', order: 'forward' },
			},
			{
				id: 'ctx-send-to-back',
				label: 'Send to Back',
				icon: 'sendToBack',
				action: { type: 'shape-order', order: 'back' },
			},
			{
				id: 'ctx-send-backward',
				label: 'Send Backward',
				icon: 'sendToBack',
				action: { type: 'shape-order', order: 'backward' },
			},
			'-',
			{
				id: 'ctx-hyperlink',
				label: 'Hyperlink...',
				icon: 'visioLink',
				action: { type: 'insert', item: 'link' },
				keys: ['Control+K', 'Ctrl+K'],
			},
			{
				id: 'ctx-shape-data',
				label: 'Shape Data',
				icon: 'visioShapeData',
				action: { type: 'reveal', panel: 'selection' },
			},
			{
				id: 'ctx-format',
				label: 'Format Shape',
				icon: 'fill',
				action: { type: 'format-shape-pane' },
			},
			'-',
			{
				id: 'ctx-comment',
				label: 'Add Comment',
				icon: 'message',
				action: { type: 'review', command: 'new-comment' },
			},
		]),
		contextMenu(doc, 'page', 'Page', [
			{
				id: 'ctx-page-paste',
				label: 'Paste',
				icon: 'paste',
				action: { type: 'clipboard', operation: 'paste' },
				keys: ['Control+V', 'Ctrl+V'],
			},
			'-',
			{
				id: 'ctx-fit',
				label: 'Fit to Window',
				icon: 'fitPage',
				action: { type: 'zoom', mode: 'fit' },
			},
			{ id: 'ctx-grid', label: 'Grid', icon: 'grid', action: { type: 'grid' } },
			{ id: 'ctx-ruler', label: 'Ruler', icon: 'ruler', action: { type: 'ruler' } },
			'-',
			{
				id: 'ctx-page-setup',
				label: 'Page Setup...',
				icon: 'visioPagesPane',
				unsupported: 'Needs core page setup edits.',
			},
			{
				id: 'ctx-page-comment',
				label: 'Add Comment',
				icon: 'message',
				action: { type: 'review', command: 'page-comment' },
			},
		]),
	];
}

type Menu = HTMLElement & { openAt(x: number, y: number): void };
const targetShape = (node: EventTarget | null) =>
	(node as Element | null)?.closest?.<SVGGElement>('[data-shape-id]');

/**
 * Right-click, Shift+F10 or the Menu key on the canvas: a shape menu for the shape under the
 * pointer (selecting it first, as Visio does) or a page menu on empty paper.
 */
export function wireContextMenus(
	root: ShadowRoot,
	viewport: HTMLElement,
	controller: ViewerController,
): () => void {
	const Abort = root.ownerDocument.defaultView?.AbortController ?? AbortController;
	const events = new Abort();
	const menu = (id: string) => root.querySelector<Menu>(`[data-context-menu="${id}"]`)!;
	const show = (shape: SVGGElement | null | undefined, x: number, y: number) => {
		const state = controller.state;
		if (!state.document?.pages[state.pageIndex]) return;
		if (shape) {
			const selected = {
				id: shape.dataset.shapeId!,
				name: shape.dataset.shapeName ?? '',
				...(shape.dataset.pageId ? { pageId: shape.dataset.pageId } : {}),
			};
			const pageId = state.document.pages[state.pageIndex]!.id;
			const containsTarget = () =>
				controller.state.selectedShapes.some(
					(item) => selectionKey(item, pageId) === selectionKey(selected, pageId),
				);
			if (!containsTarget()) controller.selectShape(selected);
			// Selection may be refused (for example a hidden layer); fall back to the page menu.
			if (containsTarget()) return menu('shape').openAt(x, y);
		}
		menu('page').openAt(x, y);
	};
	viewport.addEventListener(
		'contextmenu',
		(event) => {
			event.preventDefault();
			show(
				pointerShapeTarget(event.target, controller.state.selectedShapes),
				event.clientX,
				event.clientY,
			);
		},
		{ signal: events.signal },
	);
	viewport.addEventListener(
		'keydown',
		(event) => {
			if (!(event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey))) return;
			event.preventDefault();
			const shape = targetShape(event.target);
			const box = (shape ?? viewport).getBoundingClientRect();
			show(shape, box.left + Math.min(24, box.width / 2), box.top + Math.min(24, box.height / 2));
		},
		{ signal: events.signal },
	);
	return () => events.abort();
}
