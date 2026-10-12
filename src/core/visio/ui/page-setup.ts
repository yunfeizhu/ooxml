import type { VisioEdit } from '../edit-commands';
import type { VisioDocument, VisioPage } from '../model';
import {
	VISIO_PAPER_SIZES,
	visioPaperSize,
	visioPrintTile,
	type VisioPaperSize,
} from '../paper-sizes';
import {
	VISIO_MANAGED_BACKGROUND,
	visioDecorationName,
	type VisioBackgroundStyle,
	type VisioBorderStyle,
} from '../page-decoration';
import { visioShapePageBox } from './marquee';
import { visioMoveCommands, visioMovementShape } from './shape-move';
import {
	visioPageOrientationCommand,
	visioPageSizePresetCommand,
	visioPageSizeState,
	type VisioPageOrientation,
} from './page-size';

export { VISIO_PAPER_SIZES, visioPaperSize, visioPrintTile } from '../paper-sizes';
export type { VisioPaperSize } from '../paper-sizes';

/** `set-page-size` selects a fixed page; a page whose Auto Size was on keeps it on. */
export function visioKeepAutoSize(page: VisioPage, edits: readonly VisioEdit[]): VisioEdit[] {
	return page.drawingResizeType === 1 && edits.some((edit) => edit.type === 'set-page-size')
		? [...edits, { type: 'set-page-setup', pageId: page.id, autoSize: true }]
		: [...edits];
}

/** Orientation swaps the page and sets the printer paper orientation, as Visio does. */
export function visioOrientationEdits(
	page: VisioPage,
	orientation: VisioPageOrientation,
): VisioEdit[] | undefined {
	const size = visioPageOrientationCommand(page, orientation);
	if (!size) return undefined;
	const wanted = orientation === 'portrait' ? 1 : 2;
	return visioKeepAutoSize(
		page,
		page.pageSetup?.printPageOrientation === wanted
			? size
			: [...size, { type: 'set-page-setup', pageId: page.id, printOrientation: orientation }],
	);
}

/** Design > Size: a standard size in the page's current orientation. */
export function visioPageSizePresetEdits(page: VisioPage, id: string): VisioEdit[] | undefined {
	const size = visioPageSizePresetCommand(page, id);
	return size && visioKeepAutoSize(page, size);
}

/** The standard size the page matches in either orientation, if any. */
export function visioMatchingPaperSize(page: VisioPage): VisioPaperSize | undefined {
	const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
	return VISIO_PAPER_SIZES.find(
		(size) =>
			(near(size.width, page.width) && near(size.height, page.height)) ||
			(near(size.height, page.width) && near(size.width, page.height)),
	);
}

/**
 * Design > Size > Fit to Drawing: the page shrinks or grows to the extent of its top-level
 * shapes and every movable shape shifts so that extent starts at the page origin. Returns the
 * reason when a shape cannot be moved (glued connectors follow their shapes).
 */
export function visioFitToDrawingEdits(page: VisioPage): VisioEdit[] | string {
	if (!visioPageSizeState(page)) return 'The page size is not usable.';
	const boxes = page.shapes
		.filter((shape) => !shape.hidden)
		.map((shape) => visioShapePageBox(page, shape))
		.filter((box) => !!box && box.width + box.height > 0);
	if (!boxes.length) return 'The page has no shapes to fit.';
	const left = Math.min(...boxes.map((box) => box!.x)),
		right = Math.max(...boxes.map((box) => box!.x + box!.width)),
		top = Math.min(...boxes.map((box) => box!.y)),
		bottom = Math.max(...boxes.map((box) => box!.y + box!.height));
	const width = right - left,
		height = bottom - top;
	if (!(width > 0.001 && height > 0.001)) return 'The drawing has no area to fit.';
	const glued = new Set(page.connectors.map((connection) => connection.fromShapeId));
	const movable: string[] = [];
	for (const shape of page.shapes) {
		if (glued.has(shape.id)) continue;
		if (!visioMovementShape(page, shape.id))
			return `${shape.name || `Shape ${shape.id}`} cannot be moved, so the drawing cannot be fitted.`;
		movable.push(shape.id);
	}
	// Upward-positive translation that puts the drawing's bottom-left corner at the origin.
	const delta = { x: -left, y: -(page.height - bottom) };
	const moves =
		Math.abs(delta.x) < 1e-9 && Math.abs(delta.y) < 1e-9
			? []
			: movable.length
				? visioMoveCommands(page, movable, delta)
				: [];
	if (!moves) return 'The shapes cannot be moved onto the fitted page.';
	return [{ type: 'set-page-size', pageId: page.id, width, height }, ...moves];
}

/** View > Page Breaks: printed tile edges in page inches from the top-left corner. */
export interface VisioPageBreaks {
	readonly tileWidth: number;
	readonly tileHeight: number;
	/** Vertical break lines (x) and horizontal break lines (y, downward). */
	readonly columns: readonly number[];
	readonly rows: readonly number[];
	/** True when no printer paper is saved and Letter was assumed. */
	readonly assumedPaper: boolean;
}
export function visioPageBreaks(page: VisioPage): VisioPageBreaks | undefined {
	const saved = page.pageSetup?.paperKind;
	const known = saved === undefined ? undefined : visioPaperSize(saved);
	const tile = visioPrintTile(page, known ?? VISIO_PAPER_SIZES[0]!);
	if (!tile || !(page.width > 0 && page.height > 0)) return undefined;
	const lines = (size: number, step: number) => {
		const result: number[] = [];
		for (let edge = step; edge < size - 1e-6 && result.length < 200; edge += step)
			result.push(edge);
		return result;
	};
	return {
		tileWidth: tile.width,
		tileHeight: tile.height,
		columns: lines(page.width, tile.width),
		rows: lines(page.height, tile.height),
		assumedPaper: !known,
	};
}

/** What the Backgrounds and Borders & Titles galleries show for the current page. */
export interface VisioPageDecorationState {
	/** Why decorations cannot be changed here, if they cannot. */
	readonly refusal?: string;
	readonly backgroundPage?: VisioPage;
	readonly background?: { readonly style?: VisioBackgroundStyle; readonly color?: string };
	readonly border?: { readonly style?: VisioBorderStyle; readonly title?: string };
}
export function visioPageDecorationState(
	document: VisioDocument,
	page: VisioPage,
): VisioPageDecorationState {
	if (page.isBackground) return { refusal: 'Backgrounds and borders decorate foreground pages.' };
	const backgroundPage =
		page.backgroundPageId === undefined
			? undefined
			: document.pages.find((item) => item.id === page.backgroundPageId);
	if (!backgroundPage) return {};
	if (!VISIO_MANAGED_BACKGROUND.test(backgroundPage.name))
		return {
			backgroundPage,
			refusal: `This page uses its own background page "${backgroundPage.name}". Backgrounds manage only a VBackground page.`,
		};
	let background: { style?: VisioBackgroundStyle; color?: string } | undefined;
	let border: { style?: VisioBorderStyle; title?: string } | undefined;
	for (const shape of backgroundPage.shapes) {
		const found = visioDecorationName(shape.name);
		if (found?.kind === 'background' && found.style)
			background = {
				style: found.style,
				...(/^#[0-9a-f]{6}$/i.test(shape.style.fill)
					? { color: shape.style.fill.toUpperCase() }
					: {}),
			};
		if (found?.kind === 'border' && 'style' in found && found.style)
			border = { ...border, style: found.style };
		if (found?.kind === 'border' && 'title' in found)
			border = { ...border, title: shape.text.plainText };
	}
	return {
		backgroundPage,
		...(background ? { background } : {}),
		...(border?.style ? { border } : {}),
	};
}

/** A new page ID for a background page: one past the largest numeric page ID. */
export function visioNewPageId(document: VisioDocument): string | undefined {
	let largest = -1;
	for (const page of document.pages)
		if (/^(0|[1-9]\d{0,9})$/.test(page.id)) largest = Math.max(largest, Number(page.id));
	return largest >= 0xffffffff ? undefined : String(largest + 1);
}
