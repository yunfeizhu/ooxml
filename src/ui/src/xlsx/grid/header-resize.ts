// Column / row resizing by dragging a header border (with a guide line), and double-click
// AutoFit through the core's `autoFitColumnWidth` and `setRowHeight(..., 'auto')`.
import { autoFitColumnWidth, MAX_COL, MAX_ROW, pixelsToColumnWidth } from 'ooxml-core/xlsx';
import { h, place } from './dom';
import type { GridView } from './grid-view';

/** The indices a resize applies to: every fully selected row/column when `index` is one of them. */
export function resizeTargets(view: GridView, axis: 'row' | 'col', index: number): number[] {
	const ranges = view.ctx.selection.get().ranges;
	const out = new Set<number>();
	for (const r of ranges) {
		const full =
			axis === 'col'
				? r.start.row === 0 && r.end.row === MAX_ROW
				: r.start.col === 0 && r.end.col === MAX_COL;
		const from = axis === 'col' ? r.start.col : r.start.row;
		const to = axis === 'col' ? r.end.col : r.end.row;
		if (full && index >= from && index <= to && to - from < 5000)
			for (let i = from; i <= to; i++) out.add(i);
	}
	if (!out.has(index)) return [index];
	return [...out].sort((a, b) => a - b);
}

/** Pixels at the current zoom to a file size (characters for columns, points for rows). */
export function toFileSize(view: GridView, axis: 'row' | 'col', px: number): number {
	const factor = view.metrics.zoom / 100;
	const base = Math.max(0, px / factor);
	return axis === 'col' ? pixelsToColumnWidth(base) : Math.round(base * 0.75 * 4) / 4;
}

export function startHeaderResize(
	view: GridView,
	axis: 'row' | 'col',
	index: number,
	event: PointerEvent,
): void {
	const session = view.ctx.session();
	if (!session) return;
	event.preventDefault();
	const g = view.geometry;
	const start = axis === 'col' ? g.colX(index) : g.rowY(index);
	const guide = h(view.doc, 'div', 'xg-resize-guide');
	view.view.append(guide);
	let size = axis === 'col' ? view.metrics.colWidth(index) : view.metrics.rowHeight(index);
	const draw = () => {
		if (axis === 'col') {
			place(guide, start + size - 1, 0, 0, g.height);
			guide.style.borderLeftWidth = '1px';
		} else {
			place(guide, 0, start + size - 1, g.width, 0);
			guide.style.borderTopWidth = '1px';
		}
	};
	draw();
	const target = view.view;
	target.setPointerCapture?.(event.pointerId);
	const move = (e: PointerEvent) => {
		const { x, y } = view.clientToView(e.clientX, e.clientY);
		size = Math.max(0, Math.round((axis === 'col' ? x : y) - start));
		draw();
		guide.title = String(toFileSize(view, axis, size));
	};
	const up = (e: PointerEvent) => {
		target.removeEventListener('pointermove', move, true);
		target.removeEventListener('pointerup', up, true);
		target.releasePointerCapture?.(e.pointerId);
		guide.remove();
		const indices = resizeTargets(view, axis, index);
		const sheet = view.sheetIndex();
		if (size <= 0) session.setHidden(sheet, axis, indices, true);
		else if (axis === 'col') session.setColumnWidth(sheet, indices, toFileSize(view, 'col', size));
		else session.setRowHeight(sheet, indices, toFileSize(view, 'row', size));
	};
	target.addEventListener('pointermove', move, true);
	target.addEventListener('pointerup', up, true);
}

/** Double-click on a header border: fit the column(s) to their content, or the row(s) height. */
export function autoFit(view: GridView, axis: 'row' | 'col', index: number): void {
	const session = view.ctx.session();
	const workbook = view.workbook();
	if (!session || !workbook) return;
	const sheet = view.sheetIndex();
	const indices = resizeTargets(view, axis, index);
	if (axis === 'row') {
		session.setRowHeight(sheet, indices, 'auto');
		return;
	}
	session.batch('AutoFit Column Width', () => {
		for (const col of indices) {
			const width = autoFitColumnWidth(sheet, workbook, col, (text, font) =>
				view.measurer.measureFont(text, font),
			);
			session.setColumnWidth(sheet, [col], width);
		}
	});
}
