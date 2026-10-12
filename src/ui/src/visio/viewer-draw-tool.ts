import type { VisioPage, VisioEdit, VisioGeometryEdit } from 'ooxml-core/visio';
import {
	editErrorMessage,
	isEditCancellation,
	visioDrawPlan,
	visioPathDrawPlan,
	isVisioPathTool,
	type VisioPathTool,
	visioBoxCreationCommand,
	visioLineCreationCommand,
	type VisioDrawingPoint,
} from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';
import { ViewerDrawingGesture } from './viewer-drawing-gesture';
export { pagePoint } from './viewer-page-point';
export { visioNextShapeId as nextShapeId } from 'ooxml-core/visio/ui';

export async function insertRectangle(
	controller: ViewerController,
	page: VisioPage,
	centre: VisioDrawingPoint,
	size: { width: number; height: number },
): Promise<string> {
	return insertGeometry(controller, page, () =>
		visioBoxCreationCommand(page, 'rectangle', centre, size),
	);
}
/**
 * Quick Style a dropped master gets: variant colour 1 (Accent 1 in every built-in theme's first
 * variant, and in the theme-less Office colours), theme style 4, so drops follow Design > Variants.
 */
export const MASTER_QUICK_STYLE = { color: 100, matrix: 4 } as const;
export async function insertLine(
	controller: ViewerController,
	page: VisioPage,
	begin: VisioDrawingPoint,
	end: VisioDrawingPoint,
): Promise<string> {
	return insertGeometry(controller, page, () => visioLineCreationCommand(page, begin, end));
}
async function insertGeometry(
	controller: ViewerController,
	page: VisioPage,
	build: () => VisioGeometryEdit,
	style?: (shapeId: string) => VisioEdit[],
): Promise<string> {
	const state = controller.state;
	if (state.document?.pages[state.pageIndex] !== page)
		throw new DOMException('The drawing page changed.', 'AbortError');
	const token = controller.captureCreationToken(page.id);
	const command = build(),
		current = controller.state;
	if (
		current.document !== state.document ||
		current.document?.pages[current.pageIndex] !== page ||
		current.selectedShapes !== state.selectedShapes ||
		current.zoom !== state.zoom ||
		current.layerVisibilityOverrides !== state.layerVisibilityOverrides ||
		!controller.isCreationTokenCurrent(token)
	)
		throw new DOMException('The drawing intent changed.', 'AbortError');
	await controller.applyCreationEdits([command, ...(style?.(command.shapeId) ?? [])], token);
	return command.shapeId;
}

/** Core-backed ordinary shape drawing with one captured creation transaction. */
export class ShapeDrawTool {
	#gesture: ViewerDrawingGesture;
	#request = 0;
	#pendingDocument: ViewerState['document'] | undefined;
	constructor(
		viewport: HTMLElement,
		private readonly controller: ViewerController,
		options: {
			tool(): 'rectangle' | 'ellipse' | 'line' | VisioPathTool | undefined;
			announce(message: string): void;
		},
	) {
		this.#gesture = new ViewerDrawingGesture(viewport, controller, {
			...options,
			finish: async (drag, end) => {
				const request = ++this.#request;
				this.#pendingDocument = drag.document;
				try {
					const command = isVisioPathTool(drag.kind)
						? visioPathDrawPlan(drag.page, drag.kind, drag.points)
						: visioDrawPlan(drag.page, drag.kind, drag.start, end);
					if (!command && isVisioPathTool(drag.kind))
						options.announce(`Drag on the page to draw a ${drag.kind}.`);
					if (!command || !this.#gesture.current(drag)) return;
					await controller.applyCreationEdits([command], drag.token);
					if (request === this.#request) options.announce(`Shape ${command.shapeId} added.`);
				} catch (error) {
					if (request === this.#request && !isEditCancellation(error))
						options.announce(editErrorMessage(error));
				} finally {
					if (request === this.#request) this.#pendingDocument = undefined;
				}
			},
		});
	}
	get drawing(): boolean {
		return this.#gesture.drawing;
	}
	cancel(): void {
		++this.#request;
		this.#gesture.cancel();
		const document = this.#pendingDocument;
		this.#pendingDocument = undefined;
		if (document && this.controller.state.document === document && this.controller.state.edit.busy)
			this.controller.cancelEdit();
	}
	render(state: ViewerState): void {
		this.#gesture.render(state);
	}
	wire(): () => void {
		const dispose = this.#gesture.wire();
		return () => {
			this.cancel();
			dispose();
		};
	}
}
