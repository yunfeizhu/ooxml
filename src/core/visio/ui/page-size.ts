import type { VisioPageSizeEdit } from '../edit-commands';
import type { VisioPage } from '../model';
import { VISIO_PAPER_SIZES } from '../paper-sizes';

export type VisioPageOrientation = 'portrait' | 'landscape';
export interface VisioPageSizeState {
	readonly pageId: string;
	/** Physical page inches, independent of the drawing scale and printer paper. */
	readonly width: number;
	readonly height: number;
	readonly orientation: VisioPageOrientation | 'square';
	readonly drawingSizeType?: number;
	readonly drawingResizeType?: number;
}
/** Every standard size of the Design > Size gallery, in portrait inches. */
export const VISIO_PAGE_SIZE_PRESETS = VISIO_PAPER_SIZES;
const dimension = (value: number) => Number.isFinite(value) && value > 0 && value <= 1e6;

/** Coarse scene state. Source formulas and mode protection remain authoritative. */
export function visioPageSizeState(page: VisioPage): VisioPageSizeState | undefined {
	const { id: pageId, width, height, drawingSizeType, drawingResizeType } = page;
	if (!dimension(width) || !dimension(height) || !pageId || pageId.length > 256) return undefined;
	return Object.freeze({
		pageId,
		width,
		height,
		orientation: width === height ? 'square' : width > height ? 'landscape' : 'portrait',
		...(drawingSizeType === undefined ? {} : { drawingSizeType }),
		...(drawingResizeType === undefined ? {} : { drawingResizeType }),
	});
}

/** Set fixed custom drawing dimensions. An absent mode never becomes an assumed no-op. */
export function visioPageSizeCommand(
	page: VisioPage,
	width: number,
	height: number,
): VisioPageSizeEdit[] | undefined {
	const state = visioPageSizeState(page);
	if (!state || !dimension(width) || !dimension(height)) return undefined;
	if (
		width === state.width &&
		height === state.height &&
		state.drawingSizeType === 3 &&
		state.drawingResizeType === 0
	)
		return [];
	return [{ type: 'set-page-size', pageId: state.pageId, width, height }];
}

export function visioPageOrientationCommand(
	page: VisioPage,
	orientation: VisioPageOrientation,
): VisioPageSizeEdit[] | undefined {
	const state = visioPageSizeState(page);
	if (!state || !['portrait', 'landscape'].includes(orientation)) return undefined;
	const short = Math.min(state.width, state.height),
		long = Math.max(state.width, state.height);
	return visioPageSizeCommand(
		page,
		orientation === 'portrait' ? short : long,
		orientation === 'portrait' ? long : short,
	);
}

/** Viewer policy: a preset preserves the current landscape orientation; square uses portrait. */
export function visioPageSizePresetCommand(
	page: VisioPage,
	id: string,
): VisioPageSizeEdit[] | undefined {
	const state = visioPageSizeState(page),
		preset = VISIO_PAGE_SIZE_PRESETS.find((item) => item.id === id);
	if (!state || !preset) return undefined;
	return visioPageSizeCommand(
		page,
		state.orientation === 'landscape' ? preset.height : preset.width,
		state.orientation === 'landscape' ? preset.width : preset.height,
	);
}
