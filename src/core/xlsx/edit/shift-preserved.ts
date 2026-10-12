// Shifts the references inside worksheet XML the model keeps verbatim (`Worksheet.preserved`):
// manual page breaks and the Excel 2010 extension list (sparklines, x14 conditional formats and
// data validations), so inserting or deleting rows and columns keeps them on the cells they
// belong to.
import type { CellRange } from '../address';
import { formatRange } from '../address';
import type { Worksheet } from '../model';
import { parseSqref } from '../read/sheet-props';
import { buildXml, elements, parseXml, type XmlElement } from '../../xml/index';
import { type AxisShift, shiftIndex } from './range-math';

const XM = 'http://schemas.microsoft.com/office/excel/2006/main';

/** Reports page breaks and extension ranges that an insertion would push beyond the grid. */
export function hasPreservedOverflow(
	sheet: Worksheet,
	shift: AxisShift,
	clipped: (range: CellRange) => boolean,
	banded: boolean,
): boolean {
	const keys = banded ? ['extLst'] : [shift.axis === 'row' ? 'rowBreaks' : 'colBreaks', 'extLst'];
	for (const key of keys)
		for (const xml of sheet.preserved.get(key) ?? []) {
			if (!xml.includes(key === 'extLst' ? 'sqref' : 'brk')) continue;
			let root: XmlElement;
			try {
				root = parseXml(xml).documentElement;
			} catch {
				// Malformed, unhandled markup remains verbatim, as it does in the shift writer.
				continue;
			}
			if (key === 'extLst') {
				if (
					descendants(root, XM, 'sqref').some((node) =>
						parseSqref(node.textContent ?? '').some(clipped),
					)
				)
					return true;
			} else if (
				elements(root).some(
					(node) =>
						node.localName === 'brk' &&
						shiftIndex(Number(node.getAttribute('id') ?? '0'), shift) === undefined,
				)
			)
				return true;
		}
	return false;
}

/** Rewrites one formula; `formulaSheet` is the sheet unqualified references point at. */
type Rewrite = (formula: string, formulaSheet: string) => string;

function descendants(root: XmlElement, ns: string, local: string): XmlElement[] {
	return Array.from(root.getElementsByTagNameNS(ns, local));
}

/** What an edit did to one preserved element. */
type Outcome = 'same' | 'changed' | 'drop';

/** Rewrites each preserved entry of `key` through `edit`; unchanged entries keep their text. */
function editEntries(
	sheet: Worksheet,
	key: string,
	edit: (root: XmlElement) => Outcome,
	quick: (xml: string) => boolean,
): void {
	const list = sheet.preserved.get(key);
	if (!list) return;
	const next: string[] = [];
	for (const xml of list) {
		if (!quick(xml)) {
			next.push(xml);
			continue;
		}
		let doc;
		try {
			doc = parseXml(xml);
		} catch {
			next.push(xml);
			continue;
		}
		const outcome = edit(doc.documentElement);
		if (outcome === 'same') next.push(xml);
		else if (outcome === 'changed') next.push(buildXml(doc));
	}
	if (next.length) sheet.preserved.set(key, next);
	else sheet.preserved.delete(key);
}

/** Moves manual page breaks: a break sits before row (column) `id` and moves with it. */
function shiftBreaks(root: XmlElement, shift: AxisShift): Outcome {
	let changed = false;
	for (const brk of elements(root).filter((e) => e.localName === 'brk')) {
		const id = Number(brk.getAttribute('id') ?? '0');
		const moved = shiftIndex(id, shift);
		if (moved === id) continue;
		changed = true;
		// Deleting the row (column) a break sits before removes the break, as in Excel.
		if (moved === undefined || moved === 0) root.removeChild(brk);
		else brk.setAttribute('id', String(moved));
	}
	if (!changed) return 'same';
	const left = elements(root).filter((e) => e.localName === 'brk');
	if (!left.length) return 'drop';
	if (root.hasAttribute('count')) root.setAttribute('count', String(left.length));
	if (root.hasAttribute('manualBreakCount')) {
		const manual = left.filter((b) => /^(1|true)$/.test(b.getAttribute('man') ?? '')).length;
		root.setAttribute('manualBreakCount', String(manual));
	}
	return 'changed';
}

/** Removes `node` and every ancestor (below `root`) the removal leaves without elements. */
function removeUpwards(node: XmlElement, root: XmlElement): void {
	let current: XmlElement | null = node;
	while (current && current !== root) {
		const parent: XmlElement | null = current.parentNode as XmlElement | null;
		parent?.removeChild(current);
		if (!parent) break;
		// A sparkline group without sparklines still holds its colours; it goes too.
		const emptied =
			elements(parent).length === 0 ||
			(parent.localName === 'sparklineGroup' &&
				!elements(parent).some((e) => e.localName === 'sparklines'));
		if (!emptied) break;
		current = parent;
	}
}

/**
 * Shifts every `xm:sqref` in an extension list. A sparkline, conditional format or validation
 * whose cells were all deleted is removed, with any container it leaves empty.
 */
function shiftSqrefs(
	root: XmlElement,
	moveRange: (range: CellRange) => CellRange | undefined,
): Outcome {
	let changed = false;
	for (const sqref of descendants(root, XM, 'sqref')) {
		const old = sqref.textContent ?? '';
		const ranges = parseSqref(old)
			.map(moveRange)
			.filter((r): r is CellRange => !!r);
		const text = ranges.map(formatRange).join(' ');
		if (text === old.trim()) continue;
		changed = true;
		const owner = sqref.parentNode as XmlElement | null;
		if (ranges.length) sqref.textContent = text;
		else if (owner) removeUpwards(owner, root);
	}
	if (!changed) return 'same';
	for (const list of elements(root).flatMap((ext) => elements(ext)))
		if (list.localName === 'dataValidations' && list.hasAttribute('count'))
			list.setAttribute('count', String(elements(list).length));
	return elements(root).length > 0 ? 'changed' : 'drop';
}

/**
 * Moves the references in a sheet's preserved XML for a row or column insert/delete. With a band
 * (insert/delete cells) page breaks stay put, as in Excel.
 */
export function shiftPreservedXml(
	sheet: Worksheet,
	shift: AxisShift,
	moveRange: (range: CellRange) => CellRange | undefined,
	banded: boolean,
): void {
	if (!banded)
		editEntries(
			sheet,
			shift.axis === 'row' ? 'rowBreaks' : 'colBreaks',
			(root) => shiftBreaks(root, shift),
			(xml) => xml.includes('brk'),
		);
	editEntries(
		sheet,
		'extLst',
		(root) => shiftSqrefs(root, moveRange),
		(xml) => xml.includes('sqref'),
	);
}

/**
 * Rewrites the formulas (`xm:f`) of a sheet's preserved extension list: sparkline sources and x14
 * conditional-format and validation formulas.
 */
export function rewritePreservedFormulas(sheet: Worksheet, rewrite: Rewrite): void {
	editEntries(
		sheet,
		'extLst',
		(root) => {
			let changed = false;
			for (const f of descendants(root, XM, 'f')) {
				const text = f.textContent ?? '';
				let next = text;
				try {
					next = rewrite(text, sheet.name);
				} catch {
					next = text;
				}
				if (next === text) continue;
				f.textContent = next;
				changed = true;
			}
			return changed ? 'changed' : 'same';
		},
		(xml) => xml.includes(':f>'),
	);
}
