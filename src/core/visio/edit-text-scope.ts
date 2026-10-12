import type { VisioPackage } from './package';
import type { VisioTextEdit } from './edit-commands';
import { replacePlainText } from './edit-text';
import type { MasterTemplate } from './edit-text-instance';
import { assertFormattingDependencies } from './edit-formatting-scope';
import { masterShapes } from './edit-master-index';
import { fail } from './package-common';
import { indexedPart, related, visioXml } from './parts';
import { attribute, children } from './sheet';

/** The master shape a page instance inherits from: the master's root, or one of its sub-shapes. */
export function masterTemplate(pkg: VisioPackage): MasterTemplate {
	const missing = (): never =>
		fail('UNSUPPORTED_TEXT_EDIT', 'The master of this stencil shape cannot be resolved.');
	return async (masterId, masterShapeId) => {
		const documentPart = await related(pkg, '', 'document');
		const mastersPart = documentPart && (await related(pkg, documentPart, 'masters', false));
		if (!mastersPart) return missing();
		const definitions = children(await visioXml(pkg, mastersPart, 'Masters'), 'Master').filter(
			(node) => attribute(node, 'ID') === masterId,
		);
		if (definitions.length !== 1) return missing();
		const root = await visioXml(
			pkg,
			await indexedPart(pkg, mastersPart, definitions[0]!, 'master'),
			'MasterContents',
		);
		if (masterShapeId === undefined) {
			const tops = children(children(root, 'Shapes')[0], 'Shape');
			return tops.length === 1 ? tops[0]! : missing();
		}
		const matches = masterShapes(root).filter((shape) => attribute(shape, 'ID') === masterShapeId);
		return matches.length === 1 ? matches[0]! : missing();
	};
}

/** Plain text is not numeric: refuse affected or unknown dependencies instead of
 * retaining caches whose values would change after native text layout evaluation. A stencil
 * instance is the exception Visio itself makes: it gains a local Text element, and the master's
 * text-driven size is recalculated when Visio opens the file.
 */
export function replaceScopedPlainText(
	pkg: VisioPackage,
	pagePaths: ReadonlySet<string>,
	roots: ReadonlyMap<string, Element>,
	document: Element,
	edit: VisioTextEdit,
	check: () => void,
): Promise<boolean> {
	return replacePlainText(
		roots.get(edit.pageId)!,
		document,
		edit.shapeId,
		edit.text,
		check,
		(shape, text) =>
			assertFormattingDependencies(
				pkg,
				pagePaths,
				roots,
				edit.pageId,
				shape,
				new Map([['TheText', text]]),
				check,
			),
		masterTemplate(pkg),
	);
}
