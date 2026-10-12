import { executableCellFormula } from './cell-formula';
import { VISIO_PARENT_FUNCTIONS } from './edit-instance-group';
import { analyzeVisioFormula } from './formula';
import type { VisioFormulaAnalysis } from './formula-evaluate';
import { visioFormulaFunctions } from './formula-functions';
import { unquotedVisioFormula } from './formula-source';
import { fail } from './package-common';
import { attribute, VISIO_LEGACY_NS, VISIO_NS } from './sheet';

export const isSheet = (node: Node | null): node is Element =>
	!!node &&
	node.nodeType === 1 &&
	(node as Element).localName === 'Shape' &&
	((node as Element).namespaceURI === VISIO_NS ||
		(node as Element).namespaceURI === VISIO_LEGACY_NS);

/** What a page formula reads, as far as grouping cares. */
export interface GroupFormulaFacts {
	references: readonly { shapeId?: string; cell: string }[];
	functions: readonly string[];
	/** Present when the formula parses; group-scaling recognition needs the full analysis. */
	analysis?: VisioFormulaAnalysis;
}

/**
 * Visit every executable formula on the page with its owning sheet. A formula the analyser cannot
 * parse (Visio's glue and event functions, a container lookup) is read by its syntax: the sheet
 * references it spells out, any transform cell it names without a sheet, and page or document
 * cells.
 */
export function eachGroupFormula(
	root: Element,
	check: () => void,
	visit: (node: Element, owner: Element | undefined, facts: GroupFormulaFacts) => void,
): void {
	for (const node of Array.from(root.getElementsByTagName('*'))) {
		check();
		const source = executableCellFormula(attribute(node, 'F'));
		if (!source) continue;
		const functions = visioFormulaFunctions(source);
		let facts: GroupFormulaFacts;
		try {
			const analysis = analyzeVisioFormula(source, { onStep: check });
			facts = { references: analysis.references, functions, analysis };
		} catch {
			const text = unquotedVisioFormula(source);
			facts = {
				functions,
				references: [
					...Array.from(text.matchAll(/\bSheet\.(\d+)\s*!\s*([A-Za-z_][A-Za-z_0-9.]*)/gi), (m) => ({
						shapeId: String(Number(m[1])),
						cell: m[2]!,
					})),
					...Array.from(
						text.matchAll(/(?<![!.\w])(PinX|PinY|Angle|FlipX|FlipY|Width|Height)\b/gi),
						(m) => ({ cell: m[1]! }),
					),
					// Page and document sheets, which the analyser names as `Sheet!Cell`.
					...Array.from(
						text.matchAll(/\b(ThePage|TheDoc|Pages\[[^\]]*\])\s*!\s*([A-Za-z_][A-Za-z_0-9.]*)/gi),
						(m) => ({ cell: `${m[1]}!${m[2]}` }),
					),
				],
			};
		}
		let owner: Node | null = node.parentNode;
		while (owner && !isSheet(owner)) owner = owner.parentNode;
		visit(node, owner ?? undefined, facts);
	}
}

/** A member whose own formulas read the sheet it sits in would change value with a new parent. */
export function assertParentIndependent(
	facts: GroupFormulaFacts,
	from: string | undefined,
	ids: ReadonlySet<string>,
): void {
	if (from && ids.has(from) && facts.functions.some((name) => VISIO_PARENT_FUNCTIONS.has(name)))
		fail('UNSUPPORTED_GROUP_EDIT', 'A member computes cells from the sheet it sits in.');
}
