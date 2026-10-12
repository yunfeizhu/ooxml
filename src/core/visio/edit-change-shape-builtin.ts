import type { VisioEdit } from './edit-commands';
import { topShape } from './edit-connector';
import { ensureStencilMaster } from './edit-stencil-master';
import type { EditVsdxResult } from './edit';
import type { VisioPackage } from './package';
import { fail, type VisioPackageLimits } from './package-common';
import { related, visioXml } from './parts';
import { attribute, children } from './sheet';

/**
 * Home > Change Shape to a built-in shape, on a stencil shape. A drawn shape takes the built-in
 * outline; a stencil shape stays a stencil shape, so the built-in master is copied into the
 * drawing (once, as a drop does) and the shape becomes an instance of it through the same
 * `change-shape` by `masterId` that the Document Stencil masters use. Returns nothing when the
 * commands hold no such change.
 */
export async function changeStencilShapeToBuiltIn(
	source: Uint8Array,
	pkg: VisioPackage,
	pages: ReadonlyMap<string, string>,
	commands: readonly VisioEdit[],
	budget: { limits: VisioPackageLimits; maxOutput: number; deadline: number; check: () => void },
	apply: (bytes: Uint8Array, edits: readonly VisioEdit[]) => Promise<EditVsdxResult>,
): Promise<EditVsdxResult | undefined> {
	for (const command of commands) {
		if (command.type !== 'change-shape' || !('shape' in command)) continue;
		const path = pages.get(command.pageId);
		if (!path) continue;
		const shape = topShape(await visioXml(pkg, path, 'PageContents'), command.shapeId);
		if (!shape?.hasAttribute('Master')) continue;
		if (commands.length !== 1)
			fail(
				'EDIT_MIXED_MASTER_TRANSACTION',
				'Changing a stencil shape requires its own transaction.',
			);
		// Looked up first: adding the built-in master may reuse the ID of a master that is missing.
		const documentPart = (await related(pkg, '', 'document'))!;
		const mastersPart = await related(pkg, documentPart, 'masters', false);
		const current = attribute(shape, 'Master');
		if (
			!mastersPart ||
			!children(await visioXml(pkg, mastersPart, 'Masters'), 'Master').some(
				(node) => attribute(node, 'ID') === current,
			)
		)
			fail('EDIT_TARGET_NOT_FOUND', 'The master does not belong to this drawing.');
		const ensured = await ensureStencilMaster(
			source,
			command.shape,
			budget.limits,
			budget.maxOutput,
			budget.deadline,
			budget.check,
		);
		const result = await apply(ensured.bytes, [
			{
				type: 'change-shape',
				pageId: command.pageId,
				shapeId: command.shapeId,
				masterId: ensured.masterId,
			},
		]);
		// Already an instance of that master: the drawing stays as it was.
		if (!result.changedParts.length) return { bytes: source, changedParts: [], diagnostics: [] };
		return {
			...result,
			changedParts: [...new Set([...ensured.changedParts, ...result.changedParts])],
		};
	}
	return undefined;
}
