import type { VisioEdit } from '../edit-commands';
import type { VisioPage } from '../model';
import { visioMovementShape } from './shape-move';

export type VisioSizePositionField = 'x' | 'y' | 'width' | 'height' | 'angle';
export interface VisioSizePositionState {
	readonly pageId: string;
	readonly shapeId: string;
	/** Drawing inches, measured from the bottom-left page origin. */
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	/** Degrees, positive counterclockwise. */
	readonly angle: number;
}
const bounded = (value: number) => Number.isFinite(value) && Math.abs(value) <= 1e6;

/** Coarse scene eligibility only. Source formulas, locks and dependencies remain authoritative. */
export function visioSizePositionState(
	page: VisioPage,
	id: string,
): VisioSizePositionState | undefined {
	const shape = visioMovementShape(page, id),
		ratio = page.drawingToPageScale ?? 1;
	// Stencil shapes are edited on their stencil's layer; other layered shapes are not yet.
	const layered = !!shape?.layerIds?.length && !shape.masterId;
	if (!shape || layered || !Number.isFinite(ratio) || ratio <= 0) return undefined;
	const rotation = shape.rotation!;
	const state = {
		pageId: page.id,
		shapeId: id,
		x: rotation.pinX / ratio,
		y: rotation.pinY / ratio,
		width: shape.width / ratio,
		height: shape.height / ratio,
		angle: (rotation.angle * 180) / Math.PI,
	};
	if (
		![state.x, state.y, state.width, state.height, rotation.angle].every(bounded) ||
		!Number.isFinite(state.angle)
	)
		return undefined;
	return Object.freeze(state);
}

/** Numeric pane input already uses drawing inches/degrees. No-op input keeps formulas untouched. */
export function visioSizePositionCommand(
	page: VisioPage,
	id: string,
	field: VisioSizePositionField,
	value: number,
): VisioEdit[] | undefined {
	const state = visioSizePositionState(page, id);
	if (!state || !Number.isFinite(value)) return undefined;
	if (!['x', 'y', 'width', 'height', 'angle'].includes(field)) return undefined;
	// Compare before unit conversion, avoiding round-trip noise when leaving an input untouched.
	if (value === state[field]) return [];
	const target = { pageId: page.id, shapeId: id };
	if (field === 'angle') {
		const angle = (value * Math.PI) / 180;
		return bounded(angle) ? [{ type: 'rotate-shape', ...target, angle }] : undefined;
	}
	if (!bounded(value)) return undefined;
	if (field === 'x' || field === 'y')
		return [
			{
				type: 'move-shape',
				...target,
				x: field === 'x' ? value : state.x,
				y: field === 'y' ? value : state.y,
			},
		];
	if (value <= 0) return undefined;
	return [
		{
			type: 'resize-shape',
			...target,
			width: field === 'width' ? value : state.width,
			height: field === 'height' ? value : state.height,
		},
	];
}
