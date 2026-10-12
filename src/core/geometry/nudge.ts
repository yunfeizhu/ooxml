/** A selection move, in screen directions: x grows right and y grows down. */
export interface NudgeDelta {
	dx: number;
	dy: number;
}

/**
 * The move an arrow key nudges a selection by, `step` units in the arrow's screen direction, or
 * `null` for any other key. Each product picks its own units and steps (slide pixels in
 * PowerPoint, page inches in Visio); a y-up product negates `dy`.
 */
export function arrowKeyDelta(key: string, step: number): NudgeDelta | null {
	switch (key) {
		case 'ArrowLeft':
			return { dx: -step, dy: 0 };
		case 'ArrowRight':
			return { dx: step, dy: 0 };
		case 'ArrowUp':
			return { dx: 0, dy: -step };
		case 'ArrowDown':
			return { dx: 0, dy: step };
		default:
			return null;
	}
}
