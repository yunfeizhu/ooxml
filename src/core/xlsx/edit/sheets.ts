import type { Color, DefinedName, SheetState, Table, Workbook } from '../model';
import {
	createWorksheet,
	nextSheetId,
	nextSheetName,
	sheetByName,
	validateSheetName,
} from '../workbook';
import { type EditContext, sheetAt } from './context';
import { deleteSheetInFormula, renameSheetInFormula, renameTableInFormula } from './deps';
import { rewriteFormulas, rewriteSheetFormulas } from './shift-formulas';

function assertUnlocked(workbook: Workbook): void {
	if (workbook.structureLocked) throw new Error('The workbook structure is protected.');
}

/** Remaps sheet-scoped defined names and the active sheet after the sheet order changed. */
function remapSheets(workbook: Workbook, map: (index: number) => number | undefined): void {
	workbook.definedNames = workbook.definedNames.flatMap((name) => {
		if (name.localSheet === undefined) return [name];
		const next = map(name.localSheet);
		return next === undefined ? [] : [{ ...name, localSheet: next }];
	});
}

const visibleCount = (workbook: Workbook): number =>
	workbook.sheets.filter((s) => s.state === 'visible').length;

/** The nearest visible sheet to `index`, preferring the ones after it. */
function nearestVisible(workbook: Workbook, index: number): number {
	for (let i = index; i < workbook.sheets.length; i++)
		if (workbook.sheets[i]?.state === 'visible') return i;
	for (let i = index - 1; i >= 0; i--) if (workbook.sheets[i]?.state === 'visible') return i;
	return 0;
}

/** Adds an empty sheet (appended by default), makes it active and returns its index. */
export function addSheet(ctx: EditContext, name?: string, at?: number): number {
	const { workbook } = ctx;
	assertUnlocked(workbook);
	const sheetName = name ?? nextSheetName(workbook, ctx.defaultSheetBase);
	const problem = validateSheetName(workbook, sheetName);
	if (problem) throw new Error(problem);
	const index = Math.max(0, Math.min(at ?? workbook.sheets.length, workbook.sheets.length));
	return ctx.run(
		'Insert sheet',
		'sheets',
		[{ kind: 'workbook' }],
		() => {
			workbook.sheets.splice(index, 0, createWorksheet(sheetName, nextSheetId(workbook)));
			remapSheets(workbook, (i) => (i >= index ? i + 1 : i));
			workbook.activeSheet = index;
			return index;
		},
		{ sheet: index, structural: true },
	);
}

/**
 * Deletes a sheet. Its sheet-scoped names go with it; references to it (and to its tables) in
 * formulas, defined names, conditional formats, validations, chart series and hyperlink
 * locations elsewhere become `#REF!`, as in Excel.
 */
export function deleteSheet(ctx: EditContext, index: number): void {
	const { workbook } = ctx;
	assertUnlocked(workbook);
	const sheet = sheetAt(workbook, index);
	if (sheet.state === 'visible' && visibleCount(workbook) <= 1)
		throw new Error('A workbook must contain at least one visible sheet.');
	ctx.run(
		'Delete sheet',
		'sheets',
		[{ kind: 'workbook' }],
		() => {
			const tables = sheet.tables.map((t) => t.name);
			workbook.sheets.splice(index, 1);
			remapSheets(workbook, (i) => (i === index ? undefined : i > index ? i - 1 : i));
			rewriteFormulas(workbook, (formula) => deleteSheetInFormula(formula, sheet.name, tables));
			if (workbook.activeSheet > index) workbook.activeSheet--;
			else if (workbook.activeSheet === index)
				workbook.activeSheet = nearestVisible(
					workbook,
					Math.min(index, workbook.sheets.length - 1),
				);
		},
		{ structural: true },
	);
}

/** Renames a sheet and every formula, name, chart and link reference to it. */
export function renameSheet(ctx: EditContext, index: number, name: string): void {
	const { workbook } = ctx;
	assertUnlocked(workbook);
	const sheet = sheetAt(workbook, index);
	const old = sheet.name;
	if (old === name) return;
	const problem = validateSheetName(workbook, name, index);
	if (problem) throw new Error(problem);
	// A `refs` snapshot covers it: sheet metadata (the name), defined names and changed formulas.
	ctx.run(
		'Rename sheet',
		'sheets',
		[{ kind: 'refs' }],
		() => {
			rewriteFormulas(workbook, (formula) => renameSheetInFormula(formula, old, name));
			sheet.name = name;
		},
		{ sheet: index, structural: true, calc: { kind: 'rename', from: old, to: name } },
	);
}

/** Moves the sheet at `from` so it ends up at index `to`. */
export function moveSheet(ctx: EditContext, from: number, to: number): void {
	const { workbook } = ctx;
	assertUnlocked(workbook);
	sheetAt(workbook, from);
	const target = Math.max(0, Math.min(to, workbook.sheets.length - 1));
	if (target === from) return;
	ctx.run(
		'Move sheet',
		'sheets',
		[{ kind: 'workbook' }],
		() => {
			const order = workbook.sheets.map((_s, i) => i);
			const [moved] = order.splice(from, 1);
			if (moved === undefined) return;
			order.splice(target, 0, moved);
			const sheets = order.map((i) => workbook.sheets[i]).filter((s) => s !== undefined);
			workbook.sheets.splice(0, workbook.sheets.length, ...sheets);
			const newIndex = (old: number): number => order.indexOf(old);
			remapSheets(workbook, newIndex);
			workbook.activeSheet = newIndex(workbook.activeSheet);
		},
		{ sheet: target, structural: true },
	);
}

function copyName(workbook: Workbook, base: string): string {
	for (let n = 2; ; n++) {
		const suffix = ` (${n})`;
		const name = base.slice(0, 31 - suffix.length) + suffix;
		if (!sheetByName(workbook, name)) return name;
	}
}

/** A table name unused by tables and defined names (`Sales` gives `Sales_2`, `Sales_3`, ...). */
function uniqueTableName(workbook: Workbook, base: string, extra: ReadonlySet<string>): string {
	const taken = new Set([
		...workbook.sheets.flatMap((s) => s.tables.map((t) => t.name.toLowerCase())),
		...workbook.definedNames.map((n) => n.name.toLowerCase()),
		...extra,
	]);
	const stem = base.replace(/_\d+$/, '') || 'Table';
	for (let n = 2; ; n++) if (!taken.has(`${stem}_${n}`.toLowerCase())) return `${stem}_${n}`;
}

/**
 * The names a copied sheet gets, as Excel 16 makes them: every name scoped to the source sheet
 * (including `_xlnm.Print_Titles`, `_xlnm.Print_Area` and `_xlnm._FilterDatabase`), and a
 * sheet-scoped copy of each workbook name that refers to the source sheet, all re-pointed from
 * the source sheet to the copy.
 */
function namesForCopy(workbook: Workbook, index: number, from: string, to: string): DefinedName[] {
	const local = workbook.definedNames.filter((n) => n.localSheet === index);
	const taken = new Set(local.map((n) => n.name.toLowerCase()));
	const global = workbook.definedNames.filter(
		(n) =>
			n.localSheet === undefined &&
			!taken.has(n.name.toLowerCase()) &&
			renameSheetInFormula(n.formula, from, to) !== n.formula,
	);
	return [...local, ...global].map((n) => ({
		...structuredClone(n),
		formula: renameSheetInFormula(n.formula, from, to),
	}));
}

/** Copies a sheet next to the original (named `Name (2)`) and returns the copy's index. */
export function duplicateSheet(ctx: EditContext, index: number): number {
	const { workbook } = ctx;
	assertUnlocked(workbook);
	const sheet = sheetAt(workbook, index);
	const at = index + 1;
	return ctx.run(
		'Duplicate sheet',
		'sheets',
		[{ kind: 'workbook' }],
		() => {
			const copy = structuredClone(sheet);
			copy.name = copyName(workbook, sheet.name);
			copy.sheetId = nextSheetId(workbook);
			delete copy.partName;
			let nextTableId =
				Math.max(0, ...workbook.sheets.flatMap((s) => s.tables.map((t) => t.id))) + 1;
			const used = new Set<string>();
			const renames: [string, string][] = [];
			copy.tables = copy.tables.map((t): Table => {
				const name = uniqueTableName(workbook, t.name, used);
				used.add(name.toLowerCase());
				renames.push([t.name, name]);
				const next: Table = { ...t, id: nextTableId++, name, displayName: name };
				delete next.partName;
				return next;
			});
			/** Rebinds source-sheet and source-table references inside the copy only. */
			const rewrite = (formula: string): string =>
				renames.reduce(
					(f, [from, to]) => renameTableInFormula(f, from, to),
					renameSheetInFormula(formula, sheet.name, copy.name),
				);
			rewriteSheetFormulas(copy, rewrite);
			for (const drawing of copy.drawings) if (drawing.kind === 'chart') delete drawing.partName;
			const copiedNames = namesForCopy(workbook, index, sheet.name, copy.name);
			for (const name of copiedNames) name.formula = rewrite(name.formula);
			workbook.sheets.splice(at, 0, copy);
			remapSheets(workbook, (i) => (i >= at ? i + 1 : i));
			for (const n of copiedNames) workbook.definedNames.push({ ...n, localSheet: at });
			workbook.activeSheet = at;
			return at;
		},
		{ sheet: at, structural: true },
	);
}

export function setSheetState(ctx: EditContext, index: number, state: SheetState): void {
	const { workbook } = ctx;
	const sheet = sheetAt(workbook, index);
	if (sheet.state === state) return;
	assertUnlocked(workbook);
	if (state !== 'visible') {
		if (sheet.state === 'visible' && visibleCount(workbook) <= 1)
			throw new Error('A workbook must contain at least one visible sheet.');
	}
	ctx.run(
		state === 'visible' ? 'Unhide sheet' : 'Hide sheet',
		'sheets',
		[{ kind: 'sheet', sheet: index }, { kind: 'meta' }],
		() => {
			sheet.state = state;
			if (state !== 'visible' && workbook.activeSheet === index)
				workbook.activeSheet = nearestVisible(workbook, index);
		},
		{ sheet: index, structural: true },
	);
}

export function setTabColor(ctx: EditContext, index: number, color?: Color): void {
	const sheet = sheetAt(ctx.workbook, index);
	ctx.run(
		'Tab color',
		'sheets',
		[{ kind: 'sheet', sheet: index }],
		() => {
			if (color) sheet.tabColor = { ...color };
			else Reflect.deleteProperty(sheet, 'tabColor');
		},
		{ sheet: index },
	);
}
