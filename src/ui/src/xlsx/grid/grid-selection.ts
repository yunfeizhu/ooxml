// Selection actions shared by keyboard and pointer: moving the active cell with the core's
// `navigate` (Excel Ctrl+arrow semantics, hidden rows skipped), extending, header selections and
// moving within a selection after Enter / Tab.
import { navigate, type CellAddress, type CellRange, type NavigationKey } from 'ooxml-core/xlsx';
import type { Selection } from 'ooxml-core/xlsx/ui';
import type { GridView } from './grid-view';
import {
	ALL_RANGE,
	clampAddress,
	colsRange,
	extendSelection,
	moveWithinSelection,
	movingEnd,
	rowsRange,
	selectCell,
} from 'ooxml-core/xlsx/ui';

export class GridSelection {
	#view: GridView;

	constructor(view: GridView) {
		this.#view = view;
	}

	get(): Selection {
		return this.#view.ctx.selection.get();
	}

	/** Replaces the selection; `reveal` scrolls a cell into view. */
	set(next: Selection, reveal?: CellAddress): void {
		this.#view.ctx.selection.set(next);
		if (reveal) this.#view.reveal(reveal.row, reveal.col);
	}

	/** Visible rows per page in the scrolling pane (PageUp/PageDown). */
	pageRows(): number {
		const g = this.#view.geometry;
		const rowH = this.#view.metrics.rowHeight(this.get().active.row) || 20;
		return Math.max(1, Math.floor((g.cellsH - g.frozenH) / rowH) - 1);
	}

	cellAt(at: CellAddress): void {
		const view = this.#view;
		const clamped = clampAddress(at);
		this.set(selectCell(view.sheetIndex(), view.sheet(), clamped), clamped);
	}

	/** Arrow-like movement; with `extend` the moving corner moves and the active cell stays. */
	move(key: NavigationKey, extend: boolean): void {
		const view = this.#view;
		const sheet = view.sheet();
		if (!sheet) return;
		const selection = this.get();
		if (extend) {
			const from = movingEnd(selection);
			const to = navigate(sheet, from, key, this.pageRows());
			this.set(extendSelection(selection, sheet, to), to);
			return;
		}
		// Moving out of a merge starts from its far edge (Excel skips the merged block).
		const range = view.activeRange();
		let from = selection.active;
		if (key === 'down' || key === 'ctrlDown') from = { row: range.end.row, col: from.col };
		else if (key === 'right' || key === 'ctrlRight') from = { row: from.row, col: range.end.col };
		const to = navigate(sheet, from, key, this.pageRows());
		this.cellAt(to);
	}

	/** Enter / Tab: walk the selection when it has several cells, else move one cell. */
	advance(direction: 'down' | 'up' | 'right' | 'left'): void {
		const next = moveWithinSelection(this.get(), direction);
		if (next) {
			this.set(next, next.active);
			return;
		}
		this.move(direction, false);
	}

	rows(r1: number, r2: number, add = false): void {
		const selection = this.get();
		const range = rowsRange(r1, r2);
		const active = { row: Math.min(r1, r2), col: this.firstVisibleCol() };
		const anchor = { row: r1, col: 0 };
		this.#replace(selection, range, active, anchor, add);
	}

	cols(c1: number, c2: number, add = false): void {
		const selection = this.get();
		const range = colsRange(c1, c2);
		const active = { row: this.firstVisibleRow(), col: Math.min(c1, c2) };
		const anchor = { row: 0, col: c1 };
		this.#replace(selection, range, active, anchor, add);
	}

	all(): void {
		const active = { row: this.firstVisibleRow(), col: this.firstVisibleCol() };
		this.set({
			sheet: this.#view.sheetIndex(),
			active,
			anchor: { row: 0, col: 0 },
			ranges: [ALL_RANGE],
		});
	}

	#replace(
		selection: Selection,
		range: CellRange,
		active: CellAddress,
		anchor: CellAddress,
		add: boolean,
	): void {
		this.set({
			sheet: this.#view.sheetIndex(),
			active,
			anchor,
			ranges: add ? [...selection.ranges, range] : [range],
		});
	}

	firstVisibleRow(): number {
		const g = this.#view.geometry;
		return g.fRows > 0 ? 0 : this.#view.metrics.rowAt(g.scrollTop);
	}

	firstVisibleCol(): number {
		const g = this.#view.geometry;
		return g.fCols > 0 ? 0 : this.#view.metrics.colAt(g.scrollLeft);
	}
}
