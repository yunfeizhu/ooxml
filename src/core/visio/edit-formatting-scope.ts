import type { VisioPackage } from './package';
import { attribute, VISIO_NS, VISIO_LEGACY_NS } from './sheet';
import { executableCellFormula, inertDoubleClickFormula } from './cell-formula';
import { analyzeVisioFormula } from './formula';
import { indexCells } from './edit-recalculate-index';
import { fail } from './package-common';
import { isThemeLookupFormula } from './edit-formatting-cell-admission';
import { isConnectedGlueCell } from './edit-connector-glue';
import { textSizeFormula } from './edit-text-size-formula';

/** Nonnumeric font/color caches cannot be recalculated by the numeric engine.
 * Refuse every dependent formula, including metadata/styles/masters, before writes.
 */
export async function assertFormattingDependencies(
	pkg: VisioPackage,
	pagePaths: ReadonlySet<string>,
	roots: ReadonlyMap<string, Element>,
	pageId: string,
	shape: Element,
	changed: ReadonlyMap<string, Element | undefined>,
	check: () => void,
	/**
	 * The effective sheet of a stencil instance. Its own master's formulas are then judged as the
	 * instance's (through this view), and other masters, which cannot read this shape, are skipped.
	 */
	instanceView?: Element,
): Promise<void> {
	indexCells(roots, { check });
	const shapeId = attribute(shape, 'ID')!;
	const changedNames = new Set([...changed.keys()].map((name) => name.toLowerCase()));
	// Native ShapeSheet names differ from XML section/row names for text cells.
	// https://learn.microsoft.com/en-us/office/client-developer/visio/style-cell-character-section
	const canonical = (name: string) =>
		name
			.toLowerCase()
			.replace(/^char\.([a-z]+)$/, 'character.0.$1')
			.replace(/^para\.([a-z]+)$/, 'paragraph.0.$1');
	const replaced = new Set(changed.values());
	// Text, characters, paragraphs, margins and the text block decide what the text measures.
	const textEdit = [...changedNames].some((name) =>
		/^(thetext$|char\.|para\.|character\.|paragraph\.|(left|right|top|bottom)margin$|txt)/.test(
			name,
		),
	);
	const failure = (): never =>
		fail(
			'EDIT_UNSUPPORTED_FORMAT_DEPENDENCY',
			'Formatting has affected or unknown formula dependencies; dependent caches cannot be recalculated safely.',
		);
	// `named`: a formula this editor cannot follow counts only when it names a changed cell.
	// Stencil masters carry such formulas (menus, container lookups, text-driven sizes that
	// Visio recalculates when it opens the file) on every shape.
	const inspect = (root: Element, sourcePageId?: string, named = false) => {
		for (const node of [root, ...Array.from(root.getElementsByTagName('*'))]) {
			check();
			if (![VISIO_NS, VISIO_LEGACY_NS].includes(node.namespaceURI ?? '') || replaced.has(node))
				continue;
			const source = executableCellFormula(attribute(node, 'F'));
			if (!source || inertDoubleClickFormula(attribute(node, 'N') ?? '', source)) continue;
			// A 'Themed' cache is resolved from the current selectors on every read, so a
			// literal theme lookup never goes stale when Quick Style selectors change.
			if (attribute(node, 'V') === 'Themed' && isThemeLookupFormula(source)) continue;
			// Dynamic glue follows geometry only; text and formatting never feed it.
			if (isConnectedGlueCell(node, source)) continue;
			let localShapeId: string | undefined;
			let parent: Node | null = node;
			while (parent?.nodeType === 1) {
				if ((parent as Element).localName === 'Shape') {
					localShapeId = attribute(parent as Element, 'ID');
					break;
				}
				parent = parent.parentNode;
			}
			const mentions = () =>
				(source.match(/[A-Za-z_][A-Za-z_0-9.]*/g) ?? []).some((token) =>
					changedNames.has(canonical(token)),
				);
			let analysis: ReturnType<typeof analyzeVisioFormula>;
			try {
				analysis = analyzeVisioFormula(source);
			} catch (error) {
				if (!named) throw error;
				if (mentions()) failure();
				continue;
			}
			// A size taken from the shape's own text (TEXTWIDTH, TEXTHEIGHT) reads nothing hidden:
			// on the edited shape it is measured again after the edit (edit-text-size.ts), and
			// elsewhere it follows only the cells it names.
			const sized =
				analysis.dynamic && sourcePageId !== undefined ? textSizeFormula(source) : undefined;
			if (sized) {
				if (textEdit && localShapeId === shapeId && sourcePageId === pageId) continue;
				analysis = sized;
			}
			if (named && analysis.dynamic) {
				if (mentions()) failure();
				continue;
			}
			if (
				analysis.dynamic ||
				analysis.references.some(
					(ref) =>
						changedNames.has(canonical(ref.cell)) &&
						(sourcePageId === undefined || sourcePageId === pageId) &&
						(ref.shapeId === shapeId ||
							(ref.shapeId === undefined &&
								(localShapeId === shapeId || sourcePageId === undefined))),
				)
			)
				failure();
		}
	};
	for (const [id, root] of roots) inspect(root, id);
	if (instanceView) inspect(instanceView, pageId, true);
	for (const path of pkg.paths()) {
		if (!/^visio\/.*\.xml$/i.test(path) || pagePaths.has(path)) continue;
		const part = await pkg.readXml(path);
		const master = part.localName === 'MasterContents';
		if (instanceView && master) continue;
		inspect(part, undefined, master);
	}
}
