import { describe, expect, it } from 'vitest';
import { arrowKeyDelta } from './nudge';

describe('arrowKeyDelta', () => {
	it('moves the given step in the arrow direction, y down', () => {
		expect(arrowKeyDelta('ArrowLeft', 2)).toEqual({ dx: -2, dy: 0 });
		expect(arrowKeyDelta('ArrowRight', 2)).toEqual({ dx: 2, dy: 0 });
		expect(arrowKeyDelta('ArrowUp', 0.5)).toEqual({ dx: 0, dy: -0.5 });
		expect(arrowKeyDelta('ArrowDown', 0.5)).toEqual({ dx: 0, dy: 0.5 });
	});

	it('ignores other keys', () => {
		expect(arrowKeyDelta('Home', 1)).toBeNull();
		expect(arrowKeyDelta('a', 1)).toBeNull();
	});
});
