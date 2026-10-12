// Shared helpers for command implementations: the selection target, the active cell's format and
// small guards. Commands only read the model here; every change goes through the EditSession.
import type {
	CellAddress,
	CellRange,
	CellStyle,
	EditSession,
	Workbook,
	Worksheet,
} from '../../index';
import { MAX_COL, MAX_ROW, currentRegion, getCell, normalizeRange, styleAt } from '../../index';
import type { Command } from '../commands';
import type { EditorContext } from '../context';

/** Everything an editing command needs: the session, sheet and normalized selection. */
export interface Target {
	session: EditSession;
	workbook: Workbook;
	sheet: number;
	ws: Worksheet;
	ranges: CellRange[];
	/** The first range (the one Excel's single-range commands act on). */
	range: CellRange;
	active: CellAddress;
}

export function target(ctx: EditorContext): Target | undefined {
	const session = ctx.session();
	if (!session) return undefined;
	const sheet = ctx.activeSheet();
	const ws = session.workbook.sheets[sheet];
	if (!ws) return undefined;
	const selection = ctx.selection.get();
	const ranges = (
		selection.ranges.length
			? selection.ranges
			: [{ start: selection.active, end: selection.active }]
	).map(normalizeRange);
	const range = ranges[0] ?? { start: selection.active, end: selection.active };
	return {
		session,
		workbook: session.workbook,
		sheet,
		ws,
		ranges,
		range,
		active: selection.active,
	};
}

/** Runs `fn` with the target when a workbook is open; a no-op otherwise. */
export function withTarget<T>(ctx: EditorContext, fn: (t: Target) => T): T | undefined {
	const t = target(ctx);
	return t ? fn(t) : undefined;
}

export const hasWorkbook = (ctx: EditorContext): boolean => ctx.session() !== undefined;

/** The resolved format of the active cell (or its row or column format when the cell is empty). */
export function activeStyle(ctx: EditorContext): CellStyle | undefined {
	const t = target(ctx);
	if (!t) return undefined;
	const { row, col } = t.active;
	const cell = getCell(t.ws, row, col);
	const styleId =
		cell?.styleId ??
		t.ws.rowInfo.get(row)?.styleId ??
		t.ws.columns.find((c) => col >= c.min && col <= c.max)?.styleId;
	return styleAt(t.workbook, styleId);
}

/** Whether a range spans whole columns (every row). */
export const wholeColumns = (r: CellRange): boolean => r.start.row === 0 && r.end.row >= MAX_ROW;
export const wholeRows = (r: CellRange): boolean => r.start.col === 0 && r.end.col >= MAX_COL;

/** Inclusive integer span. */
export function span(from: number, to: number): number[] {
	const out: number[] = [];
	for (let i = Math.min(from, to); i <= Math.max(from, to); i++) out.push(i);
	return out;
}

/** Distinct rows (or columns) covered by the ranges, sorted. */
export function rowsOf(ranges: CellRange[]): number[] {
	return [...new Set(ranges.flatMap((r) => span(r.start.row, r.end.row)))].sort((a, b) => a - b);
}
export function colsOf(ranges: CellRange[]): number[] {
	return [...new Set(ranges.flatMap((r) => span(r.start.col, r.end.col)))].sort((a, b) => a - b);
}

/** The selection, or its current region when only one cell is selected (Excel's sort / filter). */
export function regionOf(t: Target): CellRange {
	const r = t.range;
	if (r.start.row === r.end.row && r.start.col === r.end.col) return currentRegion(t.ws, r.start);
	return r;
}

/**
 * A simplified version of Excel's header guess for sort and tables: the first row is a header
 * when it holds text and nothing but text (blanks allowed).
 */
export function guessHeader(ws: Worksheet, range: CellRange): boolean {
	const r = normalizeRange(range);
	if (r.end.row <= r.start.row) return false;
	let anyText = false;
	for (let col = r.start.col; col <= r.end.col; col++) {
		const head = getCell(ws, r.start.row, col)?.value;
		if (head !== null && head !== undefined && typeof head !== 'string') return false;
		if (typeof head === 'string' && head !== '') anyText = true;
	}
	return anyText;
}

/** The table containing a cell. */
export function tableAt(ws: Worksheet, at: CellAddress) {
	return ws.tables.find(
		(t) =>
			at.row >= t.range.start.row &&
			at.row <= t.range.end.row &&
			at.col >= t.range.start.col &&
			at.col <= t.range.end.col,
	);
}

/** The sheet is protected and does not allow `action` (`formatCells`, `insertRows`, ...). */
export function sheetLocked(ctx: EditorContext, action?: string): boolean {
	const t = target(ctx);
	const protection = t?.ws.protection;
	if (!protection?.sheet) return false;
	return !(action && protection.allow?.includes(action));
}

/** The workbook structure is protected (no adding, deleting, moving or renaming sheets). */
export const structureLocked = (ctx: EditorContext): boolean =>
	ctx.workbook()?.structureLocked === true;

/** Builds an editing command (disabled in read-only and without a workbook). */
export function editing(command: Omit<Command, 'editing'> & { lock?: string | false }): Command {
	const { lock, enabled, ...rest } = command;
	return {
		...rest,
		editing: true,
		enabled: (ctx) =>
			hasWorkbook(ctx) &&
			(lock === false || !sheetLocked(ctx, lock)) &&
			(enabled ? enabled(ctx) : true),
	};
}

/** Builds a view command (allowed in read-only, needs a workbook). */
export function viewing(command: Command): Command {
	const { enabled } = command;
	return { ...command, enabled: (ctx) => hasWorkbook(ctx) && (enabled ? enabled(ctx) : true) };
}

/** Repaints after a change the session does not report (direct workbook-level edits). */
export function refresh(ctx: EditorContext): void {
	ctx.grid()?.invalidate();
	ctx.requestRender();
}

/** Picks the cell CSS font shorthand of a style for text measurement. */
export function styleCssFont(style: CellStyle): string {
	const size = Math.round(((style.font.size ?? 11) * 96) / 72);
	return `${style.font.italic ? 'italic ' : ''}${style.font.bold ? 'bold ' : ''}${size}px "${style.font.name ?? 'Calibri'}"`;
}

/** A text measure for `setColumnWidth('auto')`, backed by the grid when it is mounted. */
export function measure(
	ctx: EditorContext,
): ((text: string, style: CellStyle) => number) | undefined {
	const grid = ctx.grid();
	return grid ? (text, style) => grid.measureText(text, styleCssFont(style)) : undefined;
}

/**
 * Clears a key in a `StylePatch` (`patchStyle` drops keys patched to undefined). Typed `never` so
 * it satisfies `exactOptionalPropertyTypes`.
 */
export const UNSET = undefined as never;
