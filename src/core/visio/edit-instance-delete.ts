import { executableCellFormula } from './cell-formula';
import { connectRows, topShape } from './edit-connector';
import { isNativeGlueCell, visioGlueTriggerTarget } from './edit-connector-glue';
import { cells } from './edit-geometry-cells';
import { assertInstanceUnlocked, stencilInstance } from './edit-instance-shape';
import type { MasterTemplate } from './edit-text-instance';
import type { VisioPackage } from './package';
import { fail } from './package-common';
import { attribute } from './sheet';

/**
 * The stencil instances among deletion targets, each proved deletable: not protected against
 * deletion and not on a locked layer. Visio removes the shape with its sub-shapes and leaves the
 * master in the document stencil; so does this editor.
 */
export async function admitInstanceDeletes(
	pkg: VisioPackage,
	roots: ReadonlyMap<string, Element>,
	edits: readonly { pageId: string; shapeId: string }[],
	template: MasterTemplate,
	check: () => void,
): Promise<Set<Element>> {
	const admitted = new Set<Element>();
	for (const edit of edits) {
		check();
		const root = roots.get(edit.pageId);
		const target = root && (await stencilInstance(root, edit.shapeId, template));
		if (!target) continue;
		await assertInstanceUnlocked(pkg, edit.pageId, target, ['LockDelete'], 'deletion');
		admitted.add(target.instance);
	}
	return admitted;
}

const END_CELLS = {
	BeginX: ['BeginX', 'BeginY', 'BegTrigger'],
	EndX: ['EndX', 'EndY', 'EndTrigger'],
} as const;

/**
 * Before deletion: release the glue of stencil connectors (Visio's Dynamic connector is a master
 * instance). A deleted connector loses its Connect rows. A connector that stays and was glued to
 * a deleted shape keeps the end where it was: the glue formulas and the trigger become plain
 * values and the Connect row goes, which is what Visio saves.
 */
export function releaseStencilGlue(
	roots: ReadonlyMap<string, Element>,
	removed: ReadonlyMap<string, ReadonlySet<string>>,
): void {
	for (const [pageId, ids] of removed) {
		const root = roots.get(pageId);
		if (!root) continue;
		for (const row of connectRows(root)) {
			const from = attribute(row, 'FromSheet') ?? '',
				to = attribute(row, 'ToSheet') ?? '';
			if (!ids.has(from) && !ids.has(to)) continue;
			const connector = topShape(root, from);
			if (!connector?.hasAttribute('Master')) continue;
			const names = END_CELLS[attribute(row, 'FromCell') as keyof typeof END_CELLS];
			if (ids.has(from)) {
				// The connector goes as well; its glue must not outlive its Connect rows meanwhile.
				const local = cells(connector);
				for (const name of names ?? []) {
					const cell = local.get(name);
					const formula = executableCellFormula(attribute(cell, 'F'));
					if (cell && formula && isNativeGlueCell(name, formula)) cell.removeAttribute('F');
				}
			} else {
				if (!names)
					fail(
						'EDIT_REFERENCED_DELETE',
						'A stencil shape is glued to this shape in a way that cannot be released here.',
					);
				const local = cells(connector);
				for (const name of names) {
					const cell = local.get(name);
					const formula = executableCellFormula(attribute(cell, 'F'));
					if (!cell || !formula) continue;
					const trigger = name.endsWith('Trigger');
					if (
						trigger
							? visioGlueTriggerTarget(formula) !== to
							: !isNativeGlueCell(name, formula) || cell.hasAttribute('E')
					)
						fail(
							'EDIT_REFERENCED_DELETE',
							'A connector glued to this shape uses a formula that cannot be released here.',
						);
					cell.removeAttribute('F');
				}
			}
			row.parentNode!.removeChild(row);
		}
	}
}
