import { DEFAULTS, fail } from './package-common';
import { parseVsdx } from './parser';
import { growAutoSizePages } from './edit-page-auto-size';
import { ensureStencilMaster } from './edit-stencil-master';
import { visioBuiltInMaster } from './stencil-masters';
import type { VisioMasterInstanceEdit } from './edit-master-instance';
import type { EditVsdxOptions, EditVsdxResult, VisioEdit } from './edit';

/**
 * Drop a master of a built-in stencil (Basic Shapes, Basic Flowchart Shapes, Arrow Shapes...) on
 * a page, as Visio does: the master is copied into the drawing's document stencil the first time,
 * and the page gets an instance of it. `master` is the stencil master id (`rectangle`,
 * `flowchart-process`); `x`/`y` is where its pin lands, in drawing inches from the bottom left.
 * Other edits of the same transaction run after every drop of it, so a drop can be styled or
 * connected in one call.
 */
export interface VisioStencilMasterDropEdit {
	type: 'drop-stencil-master';
	pageId: string;
	/** ID of the new shape. */
	shapeId: string;
	master: string;
	x: number;
	y: number;
}

type Drop = VisioMasterInstanceEdit | VisioStencilMasterDropEdit;
export const isVisioMasterDrop = (edit: { type: string }): edit is Drop =>
	edit.type === 'insert-master-instance' || edit.type === 'drop-stencil-master';

const ID = /^[1-9]\d{0,9}$/;

/** Copy and validate the command; page admission stays with the transaction. */
export function snapshotStencilMasterDrop(
	edit: VisioStencilMasterDropEdit,
): VisioStencilMasterDropEdit {
	if (typeof edit.pageId !== 'string' || !edit.pageId || edit.pageId.length > 256)
		fail('INVALID_EDIT', 'Invalid edit target.');
	if (typeof edit.shapeId !== 'string' || !ID.test(edit.shapeId) || Number(edit.shapeId) > 2 ** 31)
		fail('INVALID_EDIT', 'Invalid edit shape target.');
	if (typeof edit.master !== 'string' || !visioBuiltInMaster(edit.master))
		fail('INVALID_EDIT', 'The stencil has no such master.');
	for (const value of [edit.x, edit.y])
		if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e6)
			fail('INVALID_EDIT', 'The drop point must be finite drawing inches within limits.');
	return {
		type: 'drop-stencil-master',
		pageId: edit.pageId,
		shapeId: edit.shapeId,
		master: edit.master,
		x: edit.x,
		y: edit.y,
	};
}

/** Runs one `insert-master-instance` alone and reports the master's layers and kind. */
export type LoneMasterInstance = (
	bytes: Uint8Array,
	edit: VisioMasterInstanceEdit,
	info: { layers: string[]; group: boolean },
) => Promise<EditVsdxResult>;

/**
 * A transaction with master drops: each drop in order (the master added to the drawing when it
 * comes from a built-in stencil, the instance, then its layers), the remaining edits as one
 * transaction after them, and Auto Size last. Any refusal fails the whole call; the caller's
 * bytes are never changed.
 */
export async function editVsdxMasterDrops(
	source: Uint8Array,
	commands: readonly VisioEdit[],
	options: EditVsdxOptions,
	lone: LoneMasterInstance,
	apply: (bytes: Uint8Array, edits: readonly VisioEdit[]) => Promise<EditVsdxResult>,
): Promise<EditVsdxResult> {
	const limits = { ...DEFAULTS, ...options.limits };
	const maxOutput = options.maxOutputBytes ?? limits.maxInputBytes;
	const deadline = Date.now() + limits.maxRuntimeMs;
	const check = () => {
		if (Date.now() >= deadline) fail('LIMIT_RUNTIME', 'Visio edit deadline exceeded.');
	};
	let bytes = source;
	const changed = new Set<string>();
	const diagnostics: EditVsdxResult['diagnostics'][number][] = [];
	const keep = (result: EditVsdxResult): void => {
		bytes = result.bytes;
		for (const part of result.changedParts) changed.add(part);
		for (const item of result.diagnostics)
			if (!diagnostics.some((other) => other.code === item.code)) diagnostics.push(item);
	};
	const touched = new Set<string>();
	for (const drop of commands.filter(isVisioMasterDrop)) {
		check();
		let masterId: string;
		if (drop.type === 'drop-stencil-master') {
			const ensured = await ensureStencilMaster(
				bytes,
				drop.master,
				limits,
				maxOutput,
				deadline,
				check,
			);
			bytes = ensured.bytes;
			for (const part of ensured.changedParts) changed.add(part);
			masterId = ensured.masterId;
		} else masterId = drop.masterId;
		const info = { layers: [] as string[], group: false };
		keep(
			await lone(
				bytes,
				drop.type === 'insert-master-instance'
					? { ...drop }
					: {
							type: 'insert-master-instance',
							pageId: drop.pageId,
							shapeId: drop.shapeId,
							masterId,
							x: drop.x,
							y: drop.y,
						},
				info,
			),
		);
		touched.add(drop.pageId);
		// Visio maps the master's layers onto the page by name and adds the missing ones.
		if (info.layers.length && !info.group) {
			const page = (await parseVsdx(bytes)).pages.find((item) => item.id === drop.pageId);
			const known = new Map(
				(page?.layers ?? []).map((layer) => [layer.name.toLowerCase(), layer.id]),
			);
			const layerIds = info.layers.flatMap((name) => known.get(name.toLowerCase()) ?? []);
			const newLayers = info.layers.filter((name) => !known.has(name.toLowerCase()));
			try {
				keep(
					await apply(bytes, [
						{
							type: 'assign-layers',
							pageId: drop.pageId,
							shapeIds: [drop.shapeId],
							layerIds,
							...(newLayers.length ? { newLayers } : {}),
						},
					]),
				);
			} catch {
				// A locked or formula-driven layer keeps the drop; the shape inherits its membership.
			}
		}
	}
	const rest = commands.filter((command) => !isVisioMasterDrop(command));
	if (rest.length) keep(await apply(bytes, rest));
	const result = {
		bytes,
		changedParts: [...changed],
		diagnostics: diagnostics.filter((item) => item.code !== 'edit-layers-experimental'),
	};
	return growAutoSizePages(touched, result, apply);
}
