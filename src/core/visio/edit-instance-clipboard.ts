import { executableCellFormula } from './cell-formula';
import type { VisioClipboardSnapshot } from './clipboard-types';
import { VISIO_TEXT_REFERENCE_FUNCTIONS, visioFormulaFunctions } from './formula-functions';
import { unquotedVisioFormula } from './formula-source';
import type { VisioPackage } from './package';
import { fail } from './package-common';
import { indexedPart, related, visioXml } from './parts';
import { attribute, children } from './sheet';

const MASTER_RELATIONSHIP = 'http://schemas.microsoft.com/visio/2010/relationships/master';
const ELSEWHERE =
	'This stencil shape belongs to another drawing. Copying stencil shapes between drawings is not supported yet.';

/** The master IDs the top-level shapes of `root` are instances of. */
export function instanceMasterIds(root: Element): string[] {
	const ids = new Set<string>();
	for (const container of children(root, 'Shapes'))
		for (const shape of children(container, 'Shape')) {
			const id = attribute(shape, 'Master');
			if (id !== undefined) ids.add(id);
		}
	return [...ids];
}

async function masterEntry(pkg: VisioPackage, masterId: string) {
	const documentPart = await related(pkg, '', 'document');
	const mastersPart = documentPart && (await related(pkg, documentPart, 'masters', false));
	if (!mastersPart) return undefined;
	const matches = children(await visioXml(pkg, mastersPart, 'Masters'), 'Master').filter(
		(node) => attribute(node, 'ID') === masterId,
	);
	return matches.length === 1 ? { mastersPart, master: matches[0]! } : undefined;
}

/**
 * What tells one master from another under the same ID: Visio gives every master a UniqueID
 * and keeps the BaseID of the stencil master it was copied from.
 */
export async function masterIdentities(
	pkg: VisioPackage,
	masterIds: readonly string[],
): Promise<NonNullable<VisioClipboardSnapshot['masters']>> {
	const result: { id: string; identity: string }[] = [];
	for (const id of masterIds) {
		const entry = await masterEntry(pkg, id);
		if (!entry) fail('UNSUPPORTED_CLIPBOARD', 'The master of a stencil shape cannot be resolved.');
		result.push({
			id,
			identity: ['UniqueID', 'BaseID', 'NameU']
				.map((name) => attribute(entry!.master, name) ?? '')
				.join('|'),
		});
	}
	return result;
}

/**
 * A pasted stencil shape stays an instance of its master, so the target drawing must hold that
 * very master under the same ID and the page must already be related to it. Anything else is a
 * paste between drawings, which would have to bring the master along.
 */
export async function assertClipboardMasters(
	pkg: VisioPackage,
	pagePath: string,
	source: Element,
	captured: VisioClipboardSnapshot['masters'],
): Promise<void> {
	for (const id of instanceMasterIds(source)) {
		const known = captured?.find((master) => master.id === id);
		const entry = await masterEntry(pkg, id);
		if (!known || !entry) fail('CLIPBOARD_RESOURCE_MISMATCH', ELSEWHERE);
		const [actual] = await masterIdentities(pkg, [id]);
		if (actual!.identity !== known!.identity) fail('CLIPBOARD_RESOURCE_MISMATCH', ELSEWHERE);
		const masterPart = await indexedPart(pkg, entry!.mastersPart, entry!.master, 'master');
		const linked = [...(await pkg.relationships(pagePath)).values()].some(
			(rel) => rel.type === MASTER_RELATIONSHIP && rel.target === masterPart,
		);
		if (!linked)
			fail(
				'CLIPBOARD_RESOURCE_MISMATCH',
				'This page has no shape of that stencil master yet. Drop the master from the Document Stencil first.',
			);
	}
}

/**
 * Formula scope of a captured stencil shape, read by syntax because its formulas may use
 * functions the analyser does not parse: no reference to a sheet outside the capture, and no
 * reference built from text.
 */
export function assertInstanceClipboardScope(shape: Element, ids: ReadonlySet<string>): void {
	const own = new Set(ids);
	for (const node of Array.from(shape.getElementsByTagName('*')))
		if (node.localName === 'Shape' && attribute(node, 'ID') !== undefined)
			own.add(attribute(node, 'ID')!);
	for (const node of [shape, ...Array.from(shape.getElementsByTagName('*'))]) {
		const formula = executableCellFormula(attribute(node, 'F'));
		if (!formula) continue;
		if (
			visioFormulaFunctions(formula).some((name) => VISIO_TEXT_REFERENCE_FUNCTIONS.has(name)) ||
			[...unquotedVisioFormula(formula).matchAll(/\bSheet\.(\d+)\s*!/gi)].some(
				(match) => !own.has(String(Number(match[1]))),
			)
		)
			fail(
				'UNSUPPORTED_CLIPBOARD',
				'The stencil shape refers to other shapes on its page, so it cannot be copied alone.',
			);
	}
}
