import { visioFormulaCachedValue } from './formula';
import { fail } from './package-common';
import { attribute, children } from './sheet';

/** One top-level shape of a master, placed in the group Visio makes when the master is dropped. */
export interface MasterGroupPart {
	shape: Element;
	/** Pin and size in the group's own coordinates, in inches. */
	pinX: number;
	pinY: number;
	width: number;
	height: number;
}

export interface MasterGroupLayout {
	width: number;
	height: number;
	parts: readonly MasterGroupPart[];
}

const REFUSAL = 'UNSUPPORTED_MASTER_INSTANCE';

function number(shape: Element, name: string, fallback?: number): number {
	const cell = children(shape, 'Cell').find((item) => attribute(item, 'N') === name);
	if (!cell) {
		if (fallback !== undefined) return fallback;
		return fail(REFUSAL, 'A shape of the master has no size or position.');
	}
	try {
		if (cell.hasAttribute('E')) throw new Error('error value');
		return visioFormulaCachedValue(attribute(cell, 'V') ?? '', attribute(cell, 'U')).value;
	} catch {
		return fail(REFUSAL, 'A shape of the master has a size or position that is not a number.');
	}
}

/**
 * A master with several top-level shapes has no shape of its own to instance. Visio drops it as a
 * group that names the master: the group is as large as the shapes together, and each shape
 * becomes a sub-shape whose pin and size follow the group's (`Sheet.N!Width*0.25`). Recorded with
 * `scripts/record-visio-group-instance.ps1` (multiroot.vsdx). Turned or flipped shapes are
 * refused: their bounds were not recorded.
 */
export function masterGroupLayout(roots: readonly Element[]): MasterGroupLayout {
	const boxes = roots.map((shape) => {
		const width = number(shape, 'Width'),
			height = number(shape, 'Height');
		if (
			number(shape, 'Angle', 0) !== 0 ||
			number(shape, 'FlipX', 0) !== 0 ||
			number(shape, 'FlipY', 0) !== 0
		)
			fail(REFUSAL, 'A master whose shapes are turned or flipped cannot be dropped yet.');
		if (!(width > 0) || !(height > 0)) fail(REFUSAL, 'A shape of the master has no positive size.');
		const left = number(shape, 'PinX') - number(shape, 'LocPinX', width / 2),
			bottom = number(shape, 'PinY') - number(shape, 'LocPinY', height / 2);
		return { shape, left, bottom, width, height };
	});
	const left = Math.min(...boxes.map((box) => box.left)),
		bottom = Math.min(...boxes.map((box) => box.bottom));
	const width = Math.max(...boxes.map((box) => box.left + box.width)) - left,
		height = Math.max(...boxes.map((box) => box.bottom + box.height)) - bottom;
	if (!(width > 0) || !(height > 0) || !Number.isFinite(width + height))
		fail(REFUSAL, 'The shapes of the master have no usable bounds.');
	return {
		width,
		height,
		parts: boxes.map((box) => ({
			shape: box.shape,
			pinX: box.left - left + number(box.shape, 'LocPinX', box.width / 2),
			pinY: box.bottom - bottom + number(box.shape, 'LocPinY', box.height / 2),
			width: box.width,
			height: box.height,
		})),
	};
}

/** A fraction of the group's size, as Visio writes it: `Sheet.4!Width*0.8125`. */
export function groupFraction(groupId: string, cell: 'Width' | 'Height', ratio: number): string {
	return `Sheet.${groupId}!${cell}*${Number(ratio.toPrecision(15))}`;
}
