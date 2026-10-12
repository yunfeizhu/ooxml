import type { VisioShapeStructure } from './model';
import { sectionRows, type Sheet } from './sheet';
import {
	VISIO_CALLOUT_LEADER_ROW,
	VISIO_CALLOUT_TARGET_ROW,
	VISIO_CONTAINER_MEMBERS_ROW,
} from './edit-diagram-parts-commands';
export type { VisioShapeStructure } from './model';

const ID = /^[1-9]\d{0,9}$/;
const MAX_MEMBERS = 1000;
/** Strip the quotes Visio writes around string results of formulas. */
const unquote = (value: string | undefined) => value?.replace(/^"(.*)"$/s, '$1').trim();
/** Sheet IDs listed as `Sheet.N!SheetRef()` arguments of `DEPENDSON(kind, ...)`. Never evaluated. */
function dependsOn(formula: string | undefined, kind: number): string[] {
	if (!formula || formula.length > 100_000) return [];
	const ids: string[] = [];
	for (const call of formula.matchAll(/DEPENDSON\(\s*(\d+)\s*,([^()]*(?:\([^()]*\)[^()]*)*)\)/gi))
		if (Number(call[1]) === kind)
			for (const ref of call[2]!.matchAll(/Sheet\.(\d+)!SheetRef\(\)/gi))
				if (ID.test(ref[1]!) && ids.length < MAX_MEMBERS) ids.push(ref[1]!);
	return ids;
}
const idList = (value: string | undefined) =>
	(value ?? '')
		.split(',')
		.map((id) => id.trim())
		.filter((id) => ID.test(id))
		.slice(0, MAX_MEMBERS);

/**
 * Read a resolved sheet's User.msvStructureType. Members come from the editor's own User row, or
 * from Visio's Relationships cell (DEPENDSON 1 for container members, 6 for a callout's target),
 * read as text only: the formulas are never run. Lists and other structures are not modelled.
 */
export function visioShapeStructure(sheet: Sheet): VisioShapeStructure | undefined {
	const rows = new Map(
		sectionRows(sheet, 'User').map((row) => [row.name ?? '', row.cells.get('Value')?.value]),
	);
	const type = unquote(rows.get('msvStructureType'))?.toLowerCase();
	const relationships = sheet.cells.get('Relationships')?.formula;
	if (type === 'container') {
		const own = rows.get(VISIO_CONTAINER_MEMBERS_ROW);
		return {
			type,
			memberIds: [
				...new Set(own !== undefined ? idList(unquote(own)) : dependsOn(relationships, 1)),
			],
		};
	}
	if (type === 'callout') {
		const target = unquote(rows.get(VISIO_CALLOUT_TARGET_ROW)) ?? dependsOn(relationships, 6)[0];
		const leader = unquote(rows.get(VISIO_CALLOUT_LEADER_ROW));
		return {
			type,
			...(target && ID.test(target) ? { targetId: target } : {}),
			...(leader && ID.test(leader) ? { leaderId: leader } : {}),
		};
	}
	return undefined;
}
