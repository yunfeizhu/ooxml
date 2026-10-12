import { proveLocalGroupRotation } from './edit-group-rotation';
import { resizeVisioShapeAtAnchor } from './edit-resize-anchor';
import { executableCellFormula } from './cell-formula';
import { editableTransformCell } from './edit-transform-formula';
import { createRectangle, createEllipse, createLine } from './edit-shape-create';
import { createPath } from './edit-path-create';
import {
	glueNewConnector,
	glueParticipants,
	planConnector,
	proveConnector,
	releaseDeletedGlue,
	topShape,
	unglueConnector,
} from './edit-connector';
import {
	applyConnectorEdit,
	editRoutedConnector,
	isRoutedConnector,
	rerouteConnector,
} from './edit-connector-reroute';
import { isVisioConnectorEdit } from './edit-connector-commands';
import { attribute } from './sheet';
import { fail } from './package-common';
import { visioFormulaCachedValue } from './formula';
import {
	assertVisioShapeUnreferenced,
	recalculateVisioCells,
	type VisioCellKey,
} from './edit-recalculate';
import { geometryChangedCells, type VisioGeometryEdit } from './edit-commands';
import { emptyMasterMoveProof, type MasterMoveProof } from './edit-master-move';
import {
	moveLocalLine,
	moveLocalLineEndpoint,
	proveLocalLine,
	assertLineTranslation,
	sameLineCoordinate,
} from './edit-line-move';
import {
	numeric,
	editableCell,
	guardedCell,
	setCell,
	cells,
	isLineSheet,
	admitted,
	protectedShape,
	resizeGeometry,
} from './edit-geometry-admission';

export function applyGeometryEdit(
	roots: ReadonlyMap<string, Element>,
	document: Element,
	edit: VisioGeometryEdit,
	check: () => void,
	masterMoveProof: MasterMoveProof = emptyMasterMoveProof(),
): readonly string[] {
	const masterMovePins = masterMoveProof.pins,
		masterDimensions = masterMoveProof.dimensions;
	check();
	const root = roots.get(edit.pageId);
	if (!root) fail('EDIT_TARGET_NOT_FOUND', 'Page does not exist.');
	if (isVisioConnectorEdit(edit)) return applyConnectorEdit(roots, root, edit, check);
	const own = edit.type.startsWith('create-') ? undefined : topShape(root, edit.shapeId);
	if (own && edit.type !== 'delete-shape' && isRoutedConnector(own))
		return editRoutedConnector(roots, edit, check);
	// Connectors glued to an edited 2D shape follow it; an edited connector is unglued first.
	const glue = edit.type.startsWith('create-')
		? { connectors: [] }
		: glueParticipants(root, edit.shapeId);
	const glueShapes = new Set<Element>(
		glue.connector
			? [glue.connector.shape]
			: glue.connectors.length
				? [glueTarget(root, edit.shapeId)]
				: [],
	);
	const reroute = (pages: readonly string[]): readonly string[] => {
		if (!pages.length) return pages;
		const result = new Set(pages);
		for (const connector of glue.connectors)
			for (const page of rerouteConnector(roots, edit.pageId, connector, check)) result.add(page);
		return [...result];
	};
	if (edit.type === 'resize-shape' && edit.anchor)
		return reroute(resizeVisioShapeAtAnchor(roots, document, edit, check, glueShapes));
	const groupRotation = proveLocalGroupRotation(root, edit, check);
	const changed: VisioCellKey[] = [];
	let expected: { width: number; height: number; x: number; y: number } | undefined;
	const lineEditShapes = new Set<Element>();
	let fixedLine: ReadonlyMap<string, number> | undefined;
	let expectedAngle: number | undefined;
	let expectedFlip: { cell: string; value: number } | undefined;
	const add = (cell: string) => changed.push({ pageId: edit.pageId, shapeId: edit.shapeId, cell });
	if (edit.type === 'create-line') {
		const line = planConnector(root, edit);
		const shape = createLine(root, document, line);
		glueNewConnector(root, shape, line);
		if (line.route && line.route !== 'straight')
			return rerouteConnector(roots, edit.pageId, proveConnector(root, edit.shapeId), check, {
				route: line.route,
			});
		if (line.connect) glueShapes.add(shape);
		lineEditShapes.add(shape);
		fixedLine = proveLocalLine(shape);
		expected = {
			width: Math.hypot(line.endX - line.beginX, line.endY - line.beginY),
			height: 0,
			x: (line.beginX + line.endX) / 2,
			y: (line.beginY + line.endY) / 2,
		};
		for (const name of geometryChangedCells(edit)) add(name);
	} else if (edit.type === 'create-path') {
		expected = createPath(root, document, edit);
		for (const name of ['Width', 'Height', 'PinX', 'PinY']) add(name);
	} else if (
		edit.type === 'create-rectangle' ||
		edit.type === 'create-ellipse' ||
		edit.type === 'create-text-box'
	) {
		if (edit.type === 'create-ellipse') createEllipse(root, document, edit);
		else createRectangle(root, document, edit);
		expected = { width: edit.width, height: edit.height, x: edit.x, y: edit.y };
		for (const name of ['Width', 'Height', 'PinX', 'PinY']) add(name);
		if (edit.type === 'create-text-box') {
			add('LinePattern');
			add('FillPattern');
		}
	} else {
		const shape = admitted(
			root,
			edit.shapeId,
			edit.type === 'move-shape' ? masterMovePins : new Set(),
			edit.type === 'move-shape' ? masterDimensions : new Map(),
			edit.type === 'move-shape' ? 'move' : edit.type === 'delete-shape' ? 'delete' : 'resize',
			groupRotation.groups,
		);
		const local = cells(shape);
		const lineMove = edit.type === 'move-shape' && isLineSheet(local);
		const rotationLocked = protectedShape(
			shape,
			document,
			edit.type === 'move-shape' ? masterMovePins : new Set(),
			lineMove
				? ['LockBegin', 'LockEnd']
				: edit.type === 'move-line-endpoint'
					? [edit.endpoint === 'begin' ? 'LockBegin' : 'LockEnd']
					: edit.type === 'flip-shape'
						? ['LockRotate']
						: edit.type === 'rotate-shape'
							? ['LockRotate']
							: [],
			edit.type === 'flip-shape',
		);
		if (glue.connector && edit.type !== 'delete-shape')
			unglueConnector(
				root,
				glue.connector,
				edit.type === 'move-line-endpoint' ? [edit.endpoint] : ['begin', 'end'],
			);
		const unlocked = (
			name:
				| 'LockMoveX'
				| 'LockMoveY'
				| 'LockWidth'
				| 'LockHeight'
				| 'LockAspect'
				| 'LockDelete'
				| 'LockRotate',
		) => {
			if (numeric(local.get(name), 0) !== 0)
				fail('EDIT_PROTECTED_CELL', `${name} prevents this operation.`);
		};
		if (edit.type === 'delete-shape') {
			unlocked('LockDelete');
			releaseDeletedGlue(roots, new Map([[edit.pageId, new Set([edit.shapeId])]]));
			assertVisioShapeUnreferenced(roots, edit.pageId, edit.shapeId, { check });
			shape.parentNode!.removeChild(shape);
			return [edit.pageId];
		}
		if (edit.type === 'rotate-shape' || edit.type === 'flip-shape') {
			if (isLineSheet(local))
				fail('UNSUPPORTED_GEOMETRY_EDIT', 'Line rotation requires endpoint proof.');
			const angle = local.get('Angle');
			if (angle?.hasAttribute('E'))
				fail('UNSUPPORTED_GEOMETRY_EDIT', 'Cannot transform an erroneous Angle cache.');
			if (
				angle?.hasAttribute('U') &&
				visioFormulaCachedValue('0', attribute(angle, 'U')).unit !== 'angle'
			)
				fail('EDIT_FORMULA_UNIT', 'Angle must use angular units.');
			const retainAngle = edit.type === 'flip-shape' && (rotationLocked || guardedCell(angle));
			if (!retainAngle) {
				unlocked('LockRotate');
				editableTransformCell(roots, edit, angle, check, {
					groupRotationCells: groupRotation.angleCells,
				});
			}
			const replaceAngleFormula =
				edit.type === 'rotate-shape' && !!executableCellFormula(attribute(angle, 'F'));
			const targetAngle =
				edit.type === 'flip-shape' ? numeric(angle, 0) * (retainAngle ? 1 : -1) : edit.angle;
			if (edit.type === 'flip-shape') {
				const name = edit.axis === 'horizontal' ? 'FlipX' : 'FlipY';
				const flag = local.get(name);
				if (flag?.hasAttribute('E'))
					fail('UNSUPPORTED_GEOMETRY_EDIT', 'Cannot transform an erroneous flip cache.');
				const retainFlag = guardedCell(flag);
				if (!retainFlag) editableTransformCell(roots, edit, flag, check);
				const value = numeric(flag, 0);
				if (
					(value !== 0 && value !== 1) ||
					(flag?.hasAttribute('U') &&
						visioFormulaCachedValue('0', attribute(flag, 'U')).unit !== 'scalar')
				)
					fail('EDIT_FORMULA_UNIT', 'Flip flags must be scalar booleans.');
				expectedFlip = { cell: name, value: retainFlag ? value : 1 - value };
				if (!retainFlag) {
					setCell(shape, name, expectedFlip.value);
					add(name);
				}
			} else if (numeric(angle, 0) === targetAngle && !replaceAngleFormula) return [];
			expected = {
				width: numeric(local.get('Width')),
				height: numeric(local.get('Height')),
				x: numeric(local.get('PinX'), numeric(local.get('Width')) / 2),
				y: numeric(local.get('PinY'), numeric(local.get('Height')) / 2),
			};
			expectedAngle = targetAngle;
			if (!retainAngle && (numeric(angle, 0) !== targetAngle || replaceAngleFormula)) {
				setCell(shape, 'Angle', targetAngle);
				cells(shape).get('Angle')!.setAttribute('U', 'RAD');
				add('Angle');
			}
		} else if (edit.type === 'move-shape') {
			const proven = masterDimensions.get(shape);
			expected = {
				width: numeric(local.get('Width'), proven?.width),
				height: numeric(local.get('Height'), proven?.height),
				x: edit.x,
				y: edit.y,
			};
			if (lineMove) {
				const translation = moveLocalLine(shape, edit.pageId, edit.shapeId, edit.x, edit.y);
				changed.push(...translation.changed);
				fixedLine = translation.fixed;
				lineEditShapes.add(shape);
			} else
				for (const [name, value, lock] of [
					['PinX', edit.x, 'LockMoveX'],
					['PinY', edit.y, 'LockMoveY'],
				] as const) {
					if (
						numeric(local.get(name), name === 'PinX' ? expected.width / 2 : expected.height / 2) ===
						value
					)
						continue;
					unlocked(lock);
					editableCell(local.get(name));
					setCell(shape, name, value);
					add(name);
				}
		} else if (edit.type === 'move-line-endpoint') {
			if (!isLineSheet(local))
				fail('UNSUPPORTED_GEOMETRY_EDIT', 'Endpoint editing requires a local line.');
			const endpoint = moveLocalLineEndpoint(shape, edit);
			changed.push(...endpoint.changed);
			expected = endpoint.expected;
			fixedLine = endpoint.fixed;
			lineEditShapes.add(shape);
			if (endpoint.expected.width !== numeric(local.get('Width')))
				resizeGeometry(shape, roots, edit, check, lineEditShapes, glueShapes);
		} else {
			const width = numeric(local.get('Width')),
				height = numeric(local.get('Height'));
			const lineResize = isLineSheet(local);
			if (lineResize) {
				if (edit.height !== 0)
					fail('UNSUPPORTED_GEOMETRY_EDIT', 'Line Width-cell resizing requires zero Height.');
				const proof = proveLocalLine(shape);
				fixedLine = new Map(
					[...proof].filter(([name]) => !['Width', 'LocPinX', 'LocPinY'].includes(name)),
				);
				lineEditShapes.add(shape);
			} else if (edit.height <= 0) fail('INVALID_EDIT', '2D resizing requires positive Height.');
			expected = {
				width: edit.width,
				height: edit.height,
				x: numeric(local.get('PinX'), width / 2),
				y: numeric(local.get('PinY'), height / 2),
			};
			if (width === edit.width && height === edit.height) return [];
			resizeGeometry(shape, roots, edit, check, lineEditShapes, glueShapes);
			if (
				numeric(local.get('LockAspect'), 0) !== 0 &&
				Math.abs(edit.width / width - edit.height / height) > 1e-9
			)
				fail('EDIT_PROTECTED_CELL', 'LockAspect prevents changing the aspect ratio.');
			// Make implicit pins explicit before dimensions change. Resizing holds the rotation pin fixed.
			for (const [name, value] of [
				['PinX', width / 2],
				['PinY', height / 2],
			] as const)
				if (!local.has(name)) setCell(shape, name, value);
			for (const [name, value, lock] of [
				['Width', edit.width, 'LockWidth'],
				['Height', edit.height, 'LockHeight'],
			] as const) {
				if (numeric(local.get(name)) === value) continue;
				unlocked(lock);
				if (!lineResize || name !== 'Width') editableCell(local.get(name));
				setCell(shape, name, value);
				add(name);
			}
			for (const [name, dimension, value] of [
				['LocPinX', 'Width', edit.width / 2],
				['LocPinY', 'Height', edit.height / 2],
			] as const)
				if (!local.has(name)) setCell(shape, name, value, `${dimension}*0.5`);
		}
	}
	if (!changed.length) return [];
	const affectedPages = recalculateVisioCells(roots, changed, {
		check,
		masterMovePins,
		lineEditShapes,
		glueShapes,
		groupRotationCells: groupRotation.angleCells,
	});
	const resultShape = admitted(
		root,
		edit.shapeId,
		edit.type === 'move-shape' ? masterMovePins : new Set(),
		edit.type === 'move-shape' ? masterDimensions : new Map(),
		fixedLine ? (edit.type === 'resize-shape' ? 'resize' : 'move') : undefined,
		groupRotation.groups,
	);
	if (fixedLine) assertLineTranslation(resultShape, fixedLine);
	if (edit.type === 'move-line-endpoint') proveLocalLine(resultShape);
	const result = cells(resultShape),
		provenResult = masterDimensions.get(resultShape);
	if (expectedAngle !== undefined && numeric(result.get('Angle')) !== expectedAngle)
		fail('EDIT_UNSUPPORTED_DEPENDENCY', 'Dependent formulas would violate the requested rotation.');
	if (expectedFlip && numeric(result.get(expectedFlip.cell), 0) !== expectedFlip.value)
		fail('EDIT_UNSUPPORTED_DEPENDENCY', 'Dependent formulas would violate the requested flip.');
	const equal = fixedLine ? sameLineCoordinate : (a: number, b: number) => a === b;
	if (
		expected &&
		(!equal(numeric(result.get('Width'), provenResult?.width), expected.width) ||
			!equal(numeric(result.get('Height'), provenResult?.height), expected.height) ||
			!equal(numeric(result.get('PinX'), expected.width / 2), expected.x) ||
			!equal(numeric(result.get('PinY'), expected.height / 2), expected.y))
	)
		fail(
			'EDIT_UNSUPPORTED_DEPENDENCY',
			'Dependent formulas would violate the requested geometry or fixed rotation pin.',
		);
	return reroute([...new Set([edit.pageId, ...affectedPages])]);
}

const glueTarget = (root: Element, shapeId: string): Element =>
	topShape(root, shapeId) ??
	fail('EDIT_TARGET_NOT_FOUND', 'A unique top-level local shape is required.');
