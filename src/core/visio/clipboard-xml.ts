import { parseXml } from '../xml/index';
import { DEFAULTS, fail } from './package-common';
import { inspectXml, inspectNamespaces } from './xml-validation';
import { attribute, VISIO_NS, VISIO_LEGACY_NS } from './sheet';
import { analyzeVisioFormula } from './formula';
import { executableCellFormula } from './cell-formula';
import { mapVisioFormulaSyntax } from './formula-source';
import type { VisioClipboardSnapshot } from './clipboard-types';
import { assertInstanceClipboardScope } from './edit-instance-clipboard';

/** Count the entire payload before constructing any DOMs, including resources and context. */
export function assertClipboardXmlLimits(
	snapshot: VisioClipboardSnapshot,
	check: () => void,
): void {
	let nodes = 0;
	for (const xml of [
		snapshot.pageContext,
		...snapshot.resources.map((resource) => resource.xml),
		...snapshot.shapes.map((shape) => shape.xml),
	]) {
		if (nodes >= 100_000) fail('LIMIT_CLIPBOARD', 'Clipboard aggregate node limit exceeded.');
		nodes += inspectXml(
			xml,
			{ ...DEFAULTS, maxXmlChars: 8 * 1024 * 1024, maxXmlNodes: 100_000 - nodes },
			check,
		);
	}
}

export function clipboardXml(xml: string, check: () => void): Element {
	inspectXml(xml, { ...DEFAULTS, maxXmlChars: 8 * 1024 * 1024, maxXmlNodes: 100_000 }, check);
	const root = parseXml(xml).documentElement;
	inspectNamespaces(root, check);
	return root;
}
/** Prove captured formulas independent of uncaptured shape sheets and dynamic lookup. */
export function assertClipboardFormulaScope(
	root: Element,
	ids: ReadonlySet<string>,
	check: () => void,
): void {
	for (const node of [root, ...Array.from(root.getElementsByTagName('*'))]) {
		check();
		const formula = executableCellFormula(attribute(node, 'F'));
		if (!formula) continue;
		const analysis = analyzeVisioFormula(formula, { onStep: check });
		if (
			analysis.dynamic ||
			analysis.references.some((ref) => ref.shapeId !== undefined && !ids.has(ref.shapeId))
		)
			fail(
				'UNSUPPORTED_CLIPBOARD',
				'Clipboard formulas reference uncaptured shapes or dynamic lookup.',
			);
		let pageFunction = false;
		mapVisioFormulaSyntax(formula, (segment) => {
			pageFunction ||= /\b(?:PAGENUMBER|PAGECOUNT|PAGES)\s*\(/i.test(segment);
			return segment;
		});
		if (pageFunction)
			fail(
				'UNSUPPORTED_CLIPBOARD',
				'Page-context clipboard functions require native cache regeneration.',
			);
	}
}
export function clipboardShapeRoot(snapshot: VisioClipboardSnapshot, check: () => void): Element {
	assertClipboardXmlLimits(snapshot, check);
	const parseShape = (shape: VisioClipboardSnapshot['shapes'][number]) => {
		const node = clipboardXml(shape.xml, check);
		if (
			node.localName !== 'Shape' ||
			![VISIO_NS, VISIO_LEGACY_NS].includes(node.namespaceURI ?? '') ||
			attribute(node, 'ID') !== shape.shapeId
		)
			fail('INVALID_CLIPBOARD', 'Clipboard XML must contain the declared Visio Shape.');
		return node;
	};
	const first = parseShape(snapshot.shapes[0]!);
	const root = clipboardXml(
		`<PageContents xmlns="${first.namespaceURI}"><Shapes/></PageContents>`,
		check,
	);
	const container = root.firstChild!;
	container.appendChild(root.ownerDocument!.importNode(first, true));
	for (let index = 1; index < snapshot.shapes.length; index++) {
		check();
		container.appendChild(
			root.ownerDocument!.importNode(parseShape(snapshot.shapes[index]!), true),
		);
	}
	if (root.getElementsByTagName('*').length > 100_000)
		fail('LIMIT_CLIPBOARD', 'Clipboard node limit exceeded.');
	const ids = new Set(snapshot.selectionIds);
	// A stencil shape's formulas are read by syntax; the analyser does not parse all of them.
	for (let node = container.firstChild; node; node = node.nextSibling) {
		const shape = node as Element;
		if (shape.hasAttribute('Master')) assertInstanceClipboardScope(shape, ids);
		else assertClipboardFormulaScope(shape, ids, check);
	}
	return root;
}
