import type { VisioMaster, VisioPage, VisioShape } from '../index';
import type { VisioMasterInstanceEdit } from '../edit-master-instance';
import type { VisioStencilMasterDropEdit } from '../edit-master-drop';
import { visioBuiltInMaster } from '../stencil-masters';
import { visioNextShapeId } from './shape-id';

/** Why a document-stencil master cannot be dropped as a shape, or nothing when it can. */
export function visioMasterDropRefusal(master: VisioMaster): string | undefined {
	if (master.rootCount < 1) return 'The master has no shapes to drop.';
	// Visio's Dynamic connector drops as a connector with two free ends, to be glued by its ends.
	if (master.oneDimensional)
		return master.dynamicConnector
			? undefined
			: "A line or connector master that is not built like Visio's Dynamic connector cannot be dropped; use the Connector tool.";
	if (master.shapes.some((shape) => shape.kind !== 'shape' && shape.kind !== 'group'))
		return 'A picture or connector master cannot be dropped.';
	// Several top-level shapes are dropped as one group; turned ones were not recorded from Visio.
	if (master.rootCount > 1 && master.shapes.some((shape) => shape.rotation?.angle))
		return 'A master whose shapes are turned cannot be dropped yet.';
	return undefined;
}

/** The size a dropped instance inherits from its master, in inches (1 x 1 when unknown). */
export function visioMasterDropSize(master: VisioMaster): { width: number; height: number } {
	if (master.rootCount > 1) {
		const box = visioMasterPreviewBox(master);
		if (box.width > 0 && box.height > 0) return { width: box.width, height: box.height };
	}
	const root = master.shapes[0];
	return root && root.width > 0 && root.height > 0
		? { width: root.width, height: root.height }
		: { width: 1, height: 1 };
}

/**
 * The master's shapes on its master page, y up, in inches: the part of the page a preview shows.
 * Master pages are usually larger than the shape they hold.
 */
export function visioMasterPreviewBox(master: VisioMaster): {
	x: number;
	y: number;
	width: number;
	height: number;
} {
	let left = Infinity,
		bottom = Infinity,
		right = -Infinity,
		top = -Infinity;
	const add = (shape: VisioShape): void => {
		const [a, b, c, d, e, f] = shape.transform;
		for (const [x, y] of [
			[0, 0],
			[shape.width, 0],
			[shape.width, shape.height],
			[0, shape.height],
		] as const) {
			const px = a * x + c * y + e,
				py = b * x + d * y + f;
			if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
			left = Math.min(left, px);
			right = Math.max(right, px);
			bottom = Math.min(bottom, py);
			top = Math.max(top, py);
		}
	};
	master.shapes.forEach(add);
	if (!(right > left) || !(top > bottom))
		return { x: 0, y: 0, width: master.width, height: master.height };
	return { x: left, y: bottom, width: right - left, height: top - bottom };
}

/**
 * Drop `master` with its pin at `centre` (page inches, y down, as pointer positions are), kept
 * on the page. Throws the refusal for a master that cannot be dropped.
 */
export function visioMasterDropCommand(
	page: VisioPage,
	master: VisioMaster,
	centre?: { x: number; y: number },
): VisioMasterInstanceEdit {
	const refusal = visioMasterDropRefusal(master);
	if (refusal) throw new Error(refusal);
	const ratio = page.drawingToPageScale ?? 1;
	if (!(ratio > 0) || !Number.isFinite(ratio) || !(page.width > 0) || !(page.height > 0))
		throw new Error('The page size or drawing scale is unusable for dropping a shape.');
	const size = visioMasterDropSize(master);
	const clamp = (value: number, half: number, extent: number) =>
		extent > 2 * half ? Math.min(extent - half, Math.max(half, value)) : extent / 2;
	const x = clamp(centre?.x ?? page.width / 2, (size.width * ratio) / 2, page.width);
	const y = clamp(centre?.y ?? page.height / 2, (size.height * ratio) / 2, page.height);
	if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Invalid drop point.');
	return {
		type: 'insert-master-instance',
		pageId: page.id,
		shapeId: visioNextShapeId(page),
		masterId: master.id,
		x: x / ratio,
		y: (page.height - y) / ratio,
	};
}

/**
 * Drop the built-in stencil master `master` (`rectangle`, `flowchart-process`...) with its pin at
 * `centre` (page inches, y down), kept on the page unless `keepOnPage` is off. The core copies the
 * master into the drawing the first time and drops an instance of it.
 */
export function visioStencilDropCommand(
	page: VisioPage,
	master: string,
	centre?: { x: number; y: number },
	keepOnPage = true,
): VisioStencilMasterDropEdit {
	const builtIn = visioBuiltInMaster(master);
	if (!builtIn) throw new Error('The stencil has no such master.');
	const ratio = page.drawingToPageScale ?? 1;
	if (!(ratio > 0) || !Number.isFinite(ratio) || !(page.width > 0) || !(page.height > 0))
		throw new Error('The page size or drawing scale is unusable for dropping a shape.');
	const { width, height } = builtIn.master.size;
	const clamp = (value: number, half: number, extent: number) =>
		!keepOnPage
			? value
			: extent > 2 * half
				? Math.min(extent - half, Math.max(half, value))
				: extent / 2;
	const x = clamp(centre?.x ?? page.width / 2, (width * ratio) / 2, page.width);
	const y = clamp(centre?.y ?? page.height / 2, (height * ratio) / 2, page.height);
	if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Invalid drop point.');
	return {
		type: 'drop-stencil-master',
		pageId: page.id,
		shapeId: visioNextShapeId(page),
		master,
		x: x / ratio,
		y: (page.height - y) / ratio,
	};
}
