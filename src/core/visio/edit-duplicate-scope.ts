import type { VisioPackage } from './package';
import { assertShapeOrderPackageScope } from './edit-shape-order';
import { attribute } from './sheet';
import { executableCellFormula } from './cell-formula';
import { unquotedVisioFormula } from './formula-source';
import { fail } from './package-common';

/**
 * Adding shapes can resolve formerly missing references. A formula that already names a new
 * sheet ID refuses the addition; formulas are read by their syntax, so the ones this editor
 * cannot parse are covered as well. `structural` is false when no added shape is a container
 * or a list (see `assertShapeOrderPackageScope`).
 */
export async function assertDuplicateScope(
	pkg: VisioPackage,
	pagePaths: ReadonlySet<string>,
	targetPage: Element,
	newIds: ReadonlySet<string>,
	check: () => void,
	structural = true,
): Promise<void> {
	const existing = new Set<string>();
	for (const node of Array.from(targetPage.getElementsByTagName('*'))) {
		check();
		if (node.localName !== 'Shape' || node.namespaceURI !== targetPage.namespaceURI) continue;
		const id = attribute(node, 'ID');
		if (!id || existing.has(id)) fail('INVALID_SHAPE_ID', 'Source shape IDs must be unique.');
		if (newIds.has(id)) fail('INVALID_SHAPE_ID', 'New shape ID already exists.');
		existing.add(id);
	}
	await assertShapeOrderPackageScope(pkg, check, structural);
	const inspect = (root: Element) => {
		for (const node of [root, ...Array.from(root.getElementsByTagName('*'))]) {
			check();
			const source = executableCellFormula(attribute(node, 'F'));
			if (!source) continue;
			for (const match of unquotedVisioFormula(source).matchAll(/\bSheet\.(\d+)\s*!/gi))
				if (newIds.has(String(Number(match[1]))))
					fail('EDIT_DUPLICATE_DEPENDENCY', 'New IDs are already referenced by existing formulas.');
		}
	};
	// Sheet IDs are page-local. Independent pages can already contain these IDs and references,
	// and a master's `Sheet.N!` names a shape of that master, never one of a page.
	inspect(targetPage);
	for (const path of pkg.paths())
		if (
			/^visio\/.*\.xml$/i.test(path) &&
			!pagePaths.has(path) &&
			!/^visio\/masters\/master\d+\.xml$/i.test(path)
		)
			inspect(await pkg.readXml(path));
}
