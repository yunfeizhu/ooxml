import { executableCellFormula } from './cell-formula';
import { isConnectedGlueCell } from './edit-connector-glue';
import type { InstanceCacheWrite } from './edit-instance-recalculate';
import type { InstanceScope } from './edit-instance-scope';
import { effectiveFormula } from './edit-instance-sheet';
import { analyzeVisioFormula } from './formula';
import { fail } from './package-common';
import { attribute } from './sheet';

/**
 * Formulas of other shapes on the page that read the cells this edit changes are not
 * recalculated. `changed` is keyed by page shape ID: the instance and, in a group, its sub-shapes.
 */
export function assertNoPageDependents(
	root: Element,
	instance: Element,
	changed: ReadonlyMap<string, ReadonlySet<string>>,
	check: () => void,
): void {
	// The instance's own cells were recalculated with it.
	const own = new Set<Element>(Array.from(instance.getElementsByTagName('*')));
	for (const node of Array.from(root.getElementsByTagName('*'))) {
		check();
		if (own.has(node)) continue;
		const source = executableCellFormula(attribute(node, 'F'));
		if (!source || !source.includes('!') || isConnectedGlueCell(node, source)) continue;
		if (![...source.matchAll(/\bSheet\.(\d+)!/gi)].some((match) => changed.has(match[1]!)))
			continue;
		let reads: boolean;
		try {
			const analysis = analyzeVisioFormula(source);
			reads =
				analysis.dynamic ||
				analysis.references.some(
					(ref) =>
						ref.shapeId !== undefined && !!changed.get(ref.shapeId)?.has(ref.cell.toLowerCase()),
				);
		} catch {
			reads = true;
		}
		if (reads)
			fail(
				'EDIT_UNSUPPORTED_DEPENDENCY',
				'Another shape computes its cells from this stencil shape; they cannot be recalculated.',
			);
	}
}

/**
 * A sub-shape that keeps a size or a place of its own, with no formula tying it to the group, is
 * scaled by Visio when the group is resized. That scaling is not reproduced here.
 */
export function assertPartsFollow(scope: InstanceScope): void {
	for (const sheet of scope.sheets.slice(1))
		for (const name of ['pinx', 'piny', 'width', 'height']) {
			const cell = sheet.byName.get(name);
			if (!cell || !effectiveFormula(cell))
				fail(
					'UNSUPPORTED_INSTANCE_EDIT',
					'A part of this stencil shape keeps its own size; it cannot be resized with the shape yet.',
				);
		}
}

/**
 * As Visio: a refreshed length whose master cell is tagged as a drawing length, or (outside the
 * data sections, where a bare number may be anything) not tagged at all, is tagged inches.
 */
export function inchTagged(write: InstanceCacheWrite): boolean {
	if (!write.length || write.cell.local) return false;
	const unit = attribute(write.cell.inherited, 'U');
	return (
		unit === 'DL' ||
		(unit === undefined &&
			!['User', 'Scratch', 'Property', 'Actions'].includes(write.cell.section?.name ?? ''))
	);
}
