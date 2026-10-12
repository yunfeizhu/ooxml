import { visioWalkPath } from './connector-route-walk';
import { setCell } from './edit-geometry-cells';
import type { VisioMasterInstanceEdit } from './edit-master-instance';
import { registerStencilShape } from './edit-stencil-connector';
import { writeStencilConnector } from './edit-stencil-connector-write';
import { visioFormulaCachedValue } from './formula';
import { fail, VisioPackageError } from './package-common';
import { attribute, children } from './sheet';

const number = (shape: Element, name: string): number => {
	const node = children(shape, 'Cell').find((cell) => attribute(cell, 'N') === name);
	const value = node
		? visioFormulaCachedValue(attribute(node, 'V') ?? '', attribute(node, 'U')).value
		: NaN;
	if (!Number.isFinite(value))
		fail('UNSUPPORTED_MASTER_INSTANCE', `The connector master has no usable ${name}.`);
	return value;
};

/**
 * Fill a new instance of a connector master (Visio's Dynamic connector) dropped on a page, as
 * Visio saves one: the two free ends, the transform that follows them, the one-bend path and the
 * triggers Visio gives an unglued connector (they name the connector's own sheet). The ends are
 * the edit's, or the master's own ends carried to the drop point.
 */
export function dropStencilConnector(
	shape: Element,
	master: Element,
	edit: VisioMasterInstanceEdit,
): void {
	const dx = edit.x - number(master, 'PinX'),
		dy = edit.y - number(master, 'PinY');
	const begin = edit.begin ?? {
		x: number(master, 'BeginX') + dx,
		y: number(master, 'BeginY') + dy,
	};
	const end = edit.end ?? { x: number(master, 'EndX') + dx, y: number(master, 'EndY') + dy };
	if (Math.hypot(end.x - begin.x, end.y - begin.y) < 1e-6)
		fail('INVALID_EDIT', 'The ends of a connector cannot be in the same place.');
	registerStencilShape(shape, master);
	try {
		writeStencilConnector(
			shape,
			'right-angle',
			visioWalkPath({ point: begin }, { point: end }) ?? [begin, end],
		);
	} catch (error) {
		if (error instanceof VisioPackageError && error.code === 'UNSUPPORTED_GEOMETRY_EDIT')
			fail(
				'UNSUPPORTED_MASTER_INSTANCE',
				"Only a connector master built like Visio's Dynamic connector can be dropped; other lines and connectors from a stencil cannot.",
			);
		throw error;
	}
	const trigger = `_XFTRIGGER(Sheet.${attribute(shape, 'ID')}!EventXFMod)`;
	// Visio's cell order: the triggers sit before the text pin.
	const text = children(shape, 'Cell').find((cell) => attribute(cell, 'N') === 'TxtPinX');
	for (const name of ['BegTrigger', 'EndTrigger']) {
		setCell(shape, name, 1, trigger);
		const node = children(shape, 'Cell').find((cell) => attribute(cell, 'N') === name)!;
		if (text) shape.insertBefore(node, text);
	}
}
