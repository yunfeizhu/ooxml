import { executableCellFormula } from './cell-formula';
import type { VisioGeometryEdit } from './edit-commands';
import { glueParticipants } from './edit-connector';
import { rerouteConnector } from './edit-connector-reroute';
import { assertOverridable, recalculateInstanceCaches } from './edit-instance-recalculate';
import { assertNoPageDependents, assertPartsFollow, inchTagged } from './edit-instance-checks';
import { instanceScope, isGroupInstance } from './edit-instance-scope';
import {
	effectiveNode,
	writeInstanceCell,
	type InstanceCell,
	type InstanceSheet,
} from './edit-instance-sheet';
import type { MasterTemplate } from './edit-text-instance';
import { visioFormulaCachedValue } from './formula';
import { transform } from './geometry';
import { fail, VisioPackageError } from './package-common';
import { visioAnchoredResizeGeometry } from './resize-anchor';
import { attribute, children } from './sheet';

export type InstanceGeometryEdit = Extract<
	VisioGeometryEdit,
	{ type: 'move-shape' | 'resize-shape' | 'rotate-shape' | 'flip-shape' }
>;

/** A move, resize, rotation or flip whose target is a top-level stencil (master) instance. */
export function isInstanceGeometryEdit(
	roots: ReadonlyMap<string, Element>,
	edit: VisioGeometryEdit,
): edit is InstanceGeometryEdit {
	if (!['move-shape', 'resize-shape', 'rotate-shape', 'flip-shape'].includes(edit.type))
		return false;
	const root = roots.get(edit.pageId);
	const shapes = root ? children(children(root, 'Shapes')[0], 'Shape') : [];
	const target = shapes.filter((shape) => attribute(shape, 'ID') === edit.shapeId);
	return target.length === 1 && target[0]!.hasAttribute('Master');
}

/** Whether the target is an instance of a group master. */
export function isGroupInstanceEdit(
	roots: ReadonlyMap<string, Element>,
	edit: VisioGeometryEdit,
): boolean {
	const root = roots.get(edit.pageId);
	const shapes = root ? children(children(root, 'Shapes')[0], 'Shape') : [];
	return shapes.some(
		(shape) =>
			attribute(shape, 'ID') === edit.shapeId &&
			shape.hasAttribute('Master') &&
			isGroupInstance(shape),
	);
}

/** Whether a connector is glued to the shape: its move then has connectors to follow or leave. */
export function isGlueTarget(
	roots: ReadonlyMap<string, Element>,
	edit: VisioGeometryEdit,
): boolean {
	const root = roots.get(edit.pageId);
	return (
		!!root &&
		children(root, 'Connects').some((container) =>
			children(container, 'Connect').some((row) => attribute(row, 'ToSheet') === edit.shapeId),
		)
	);
}

const close = (a: number, b: number) =>
	Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

function reader(sheet: InstanceSheet) {
	const cell = (name: string) => sheet.byName.get(name.toLowerCase());
	const number = (name: string, fallback?: number): number => {
		const node = cell(name) && effectiveNode(cell(name)!);
		if (!node) {
			if (fallback !== undefined) return fallback;
			return fail('UNSUPPORTED_INSTANCE_EDIT', `The stencil shape has no ${name}.`);
		}
		if (node.hasAttribute('E'))
			fail('UNSUPPORTED_INSTANCE_EDIT', `${name} of the stencil shape has an error value.`);
		try {
			return visioFormulaCachedValue(attribute(node, 'V') ?? '', attribute(node, 'U')).value;
		} catch {
			return fail('UNSUPPORTED_INSTANCE_EDIT', `${name} of the stencil shape is not a number.`);
		}
	};
	return { cell, number };
}

/**
 * Glued connectors follow the shape. Visio does not lay a connector out again when it opens a
 * file, so one this editor cannot reroute (Visio's own Dynamic connector, today) refuses the
 * edit instead of being left behind.
 */
function followConnectors(
	roots: ReadonlyMap<string, Element>,
	pageId: string,
	shapeId: string,
	check: () => void,
): string[] {
	const root = roots.get(pageId)!;
	const pages = new Set<string>();
	try {
		for (const connector of glueParticipants(root, shapeId).connectors)
			for (const page of rerouteConnector(roots, pageId, connector, check)) pages.add(page);
	} catch (error) {
		if (!(error instanceof VisioPackageError) || error.code.startsWith('LIMIT_')) throw error;
		fail(
			'UNSUPPORTED_INSTANCE_EDIT',
			'A connector glued to this stencil shape cannot follow it yet.',
		);
	}
	return [...pages];
}

const format = (value: number) => String(Object.is(value, -0) ? 0 : value);

/**
 * Resize, rotate or flip a stencil instance the way Visio saves it: the changed cells become
 * local values on the instance, and every inherited cell whose value follows from them (geometry
 * rows, the text block, connection points and, in an instance of a group master, the sub-shapes'
 * pins, sizes and geometry) gets a refreshed cache marked `F="Inh"`, so the master's formulas
 * stay in effect. Recorded with `scripts/record-visio-instance-geometry.ps1` and
 * `scripts/record-visio-group-instance.ps1`.
 */
export async function applyInstanceGeometryEdit(
	roots: ReadonlyMap<string, Element>,
	edit: InstanceGeometryEdit,
	template: MasterTemplate,
	check: () => void,
): Promise<readonly string[]> {
	const root = roots.get(edit.pageId);
	if (!root) fail('EDIT_TARGET_NOT_FOUND', 'Page does not exist.');
	const scope = await instanceScope(root, edit.shapeId, template);
	if (!scope) fail('EDIT_TARGET_NOT_FOUND', 'A unique top-level stencil shape is required.');
	check();
	const sheet = scope.root;
	const target = { instance: sheet.instance };
	const { cell, number } = reader(sheet);
	if (['BeginX', 'BeginY', 'EndX', 'EndY'].some((name) => cell(name)) || number('OneD', 0) !== 0)
		fail(
			'UNSUPPORTED_INSTANCE_EDIT',
			'Stencil connectors and lines cannot be resized or rotated yet.',
		);
	const unlocked = (name: string, what: string) => {
		if (number(name, 0) !== 0)
			fail('EDIT_PROTECTED_CELL', `The stencil shape is protected against ${what}.`);
	};
	const width = number('Width'),
		height = number('Height');
	if (!(width > 0) || !(height > 0))
		fail('UNSUPPORTED_INSTANCE_EDIT', 'The stencil shape has no positive size.');
	const overrides = new Map<InstanceCell, number>();
	const local = new Map<string, number>();
	const set = (name: string, value: number, what: string) => {
		const item = cell(name);
		if (item) assertOverridable(item, what);
		local.set(name, value);
		if (item) overrides.set(item, value);
	};
	let pins: InstanceCell[] = [];
	let expectedLocPin: { x: number; y: number } | undefined;
	if (edit.type === 'resize-shape') {
		if (!(edit.width > 0) || !(edit.height > 0))
			fail('INVALID_EDIT', 'A stencil shape needs a positive width and height.');
		const wider = !close(width, edit.width),
			taller = !close(height, edit.height);
		if (!wider && !taller) return [];
		if (wider) unlocked('LockWidth', 'changing its width');
		if (taller) unlocked('LockHeight', 'changing its height');
		if (number('LockAspect', 0) !== 0 && !close(edit.width / width, edit.height / height))
			fail('EDIT_PROTECTED_CELL', 'The stencil shape keeps its aspect ratio.');
		assertPartsFollow(scope);
		if (wider) set('Width', edit.width, 'The width');
		if (taller) set('Height', edit.height, 'The height');
		// A dimension that stays but follows the other one (or the text) keeps the size asked for.
		pins = ['Width', 'Height'].flatMap((name) => (cell(name) ? [cell(name)!] : []));
		if (edit.anchor) {
			const pinX = number('PinX'),
				pinY = number('PinY');
			const next = visioAnchoredResizeGeometry(
				{
					width,
					height,
					pinX,
					pinY,
					transform: transform(
						pinX,
						pinY,
						number('LocPinX', width / 2),
						number('LocPinY', height / 2),
						number('Angle', 0),
						number('FlipX', 0) !== 0,
						number('FlipY', 0) !== 0,
					),
				},
				{ width: edit.width, height: edit.height },
				edit.anchor,
			);
			if (!next)
				fail('UNSUPPORTED_INSTANCE_EDIT', 'The stencil shape cannot be resized from that side.');
			if (!close(next.pinX, pinX)) set('PinX', next.pinX, 'The position');
			if (!close(next.pinY, pinY)) set('PinY', next.pinY, 'The position');
			expectedLocPin = { x: next.locPinX, y: next.locPinY };
		}
	} else if (edit.type === 'move-shape') {
		const pinX = number('PinX'),
			pinY = number('PinY');
		if (close(pinX, edit.x) && close(pinY, edit.y)) return [];
		if (!close(pinX, edit.x)) {
			unlocked('LockMoveX', 'moving sideways');
			set('PinX', edit.x, 'The position');
		}
		if (!close(pinY, edit.y)) {
			unlocked('LockMoveY', 'moving up or down');
			set('PinY', edit.y, 'The position');
		}
	} else {
		unlocked('LockRotate', 'rotation');
		const angle = number('Angle', 0);
		if (edit.type === 'rotate-shape') {
			if (close(angle, edit.angle)) return [];
			set('Angle', edit.angle, 'The angle');
		} else {
			const name = edit.axis === 'horizontal' ? 'FlipX' : 'FlipY';
			const flag = number(name, 0);
			if (flag !== 0 && flag !== 1)
				fail('UNSUPPORTED_INSTANCE_EDIT', 'The stencil shape has an invalid flip state.');
			set(name, 1 - flag, 'The flip state');
			// As for local shapes: a flip mirrors the rotation.
			if (angle !== 0) set('Angle', -angle, 'The angle');
		}
	}
	const { writes, pinned } = recalculateInstanceCaches(
		scope,
		overrides,
		check,
		new Map(pins.map((item) => [item, item === cell('Width') ? width : height])),
	);
	for (const [item, value] of pinned) {
		assertOverridable(item, 'The size');
		local.set(item.name, value);
	}
	if (expectedLocPin) {
		const value = (name: string, fallback: number) => {
			const written = writes.find((write) => write.cell === cell(name));
			return written ? written.value : number(name, fallback);
		};
		if (
			!close(value('LocPinX', width / 2), expectedLocPin.x) ||
			!close(value('LocPinY', height / 2), expectedLocPin.y)
		)
			fail(
				'EDIT_UNSUPPORTED_DEPENDENCY',
				'The stencil shape places its pin with a formula that does not follow its size.',
			);
	}
	const changed = new Map<string, Set<string>>();
	const touch = (owner: InstanceSheet, names: readonly string[]) => {
		const id = attribute(owner.instance, 'ID') ?? '';
		const set = changed.get(id) ?? new Set<string>();
		for (const name of names) set.add(name.toLowerCase());
		changed.set(id, set);
	};
	touch(sheet, [...local.keys()]);
	for (const write of writes) touch(write.sheet, write.cell.names);
	assertNoPageDependents(root, target.instance, changed, check);
	for (const [name, value] of local) {
		const item: InstanceCell = cell(name) ?? { names: [name.toLowerCase()], name, relative: false };
		const sized = name === 'Width' || name === 'Height';
		const created = !item.local;
		const node = writeInstanceCell(sheet, item, format(value));
		// Visio tags a new local size with inches and leaves pins, angles and flags bare.
		if (created && sized && !node.hasAttribute('U')) node.setAttribute('U', 'IN');
		if (created && !sized) node.removeAttribute('U');
	}
	for (const write of writes) {
		check();
		const own = write.cell.local;
		if (own && executableCellFormula(attribute(own, 'F'))) {
			own.setAttribute('V', format(write.value));
			own.removeAttribute('E');
		} else
			writeInstanceCell(write.sheet, write.cell, format(write.value), {
				formula: 'Inh',
				...(inchTagged(write) ? { unit: 'IN' } : {}),
			});
	}
	return [...new Set([edit.pageId, ...followConnectors(roots, edit.pageId, edit.shapeId, check)])];
}
