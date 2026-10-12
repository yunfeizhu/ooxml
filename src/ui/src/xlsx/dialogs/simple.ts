// One-field dialogs wired to their edits: rename sheet, row height, column width, default width,
// table name, table resize, chart title, comment, unhide sheet and Use in Formula.
import {
	DEFAULT_COL_WIDTH,
	formatRange,
	getCell,
	parseRange,
	validateTableName,
	validateSheetName,
} from 'ooxml-core/xlsx';
import { UNSET, colsOf, rowsOf, target } from 'ooxml-core/xlsx/ui';
import { activeChart, activeTable, editChart } from 'ooxml-core/xlsx/ui';
import type { EditorContext } from 'ooxml-core/xlsx/ui';
import { type ConfirmProps, confirmDialog, numberPrompt, pickDialog, textPrompt } from './prompts';

const columnWidth = (ctx: EditorContext): number => {
	const t = target(ctx);
	if (!t) return DEFAULT_COL_WIDTH;
	const col = t.active.col;
	return (
		t.ws.columns.find((c) => col >= c.min && col <= c.max)?.width ??
		t.ws.defaultColWidth ??
		DEFAULT_COL_WIDTH
	);
};

export function registerSimpleDialogs(ctx: EditorContext): void {
	const d = ctx.dialogs;
	d.register('confirm', (c, props) => confirmDialog(c, props as ConfirmProps));
	d.register('rename-sheet', (c, props) => {
		const session = c.session();
		const index = typeof props === 'number' ? props : c.activeSheet();
		const ws = session?.workbook.sheets[index];
		if (!session || !ws) return Promise.resolve(undefined);
		return textPrompt(c, {
			name: 'rename-sheet',
			heading: 'Rename Sheet',
			label: 'Sheet name',
			value: ws.name,
			validate: (value) => {
				if (value === ws.name) return undefined;
				return validateSheetName(session.workbook, value, index) ?? undefined;
			},
			apply: (value) => {
				if (value !== ws.name) session.renameSheet(index, value);
			},
		});
	});
	d.register('row-height', (c) => {
		const t = target(c);
		if (!t) return Promise.resolve(undefined);
		const current = t.ws.rowInfo.get(t.active.row)?.height ?? t.ws.defaultRowHeight;
		return numberPrompt(c, {
			name: 'row-height',
			heading: 'Row Height',
			label: 'Row height:',
			value: current,
			min: 0,
			max: 409,
			step: 0.25,
			apply: (value) => t.session.setRowHeight(t.sheet, rowsOf(t.ranges), value),
		});
	});
	d.register('column-width', (c) => {
		const t = target(c);
		if (!t) return Promise.resolve(undefined);
		return numberPrompt(c, {
			name: 'column-width',
			heading: 'Column Width',
			label: 'Column width:',
			value: Math.round(columnWidth(c) * 100) / 100,
			min: 0,
			max: 255,
			step: 0.01,
			apply: (value) => t.session.setColumnWidth(t.sheet, colsOf(t.ranges), value),
		});
	});
	d.register('default-width', (c) => {
		const t = target(c);
		if (!t) return Promise.resolve(undefined);
		return numberPrompt(c, {
			name: 'default-width',
			heading: 'Standard Width',
			label: 'Standard column width:',
			value: t.ws.defaultColWidth ?? DEFAULT_COL_WIDTH,
			min: 0,
			max: 255,
			step: 0.01,
			apply: (value) => t.session.setDefaultColumnWidth(t.sheet, value),
		});
	});
	d.register('table-name', (c) => {
		const t = target(c);
		const table = activeTable(c);
		if (!t || !table) return Promise.resolve(undefined);
		return textPrompt(c, {
			name: 'table-name',
			heading: 'Table Name',
			label: 'Table Name:',
			value: table.displayName,
			validate: (value) => validateTableName(t.workbook, value, table),
			apply: (value) => t.session.updateTable(t.sheet, table.name, { name: value }),
		});
	});
	d.register('table-resize', (c) => {
		const t = target(c);
		const table = activeTable(c);
		if (!t || !table) return Promise.resolve(undefined);
		return textPrompt(c, {
			name: 'table-resize',
			heading: 'Resize Table',
			label: 'Select the new data range for your table:',
			value: formatRange(table.range),
			note: 'The headers must remain in the same row, and the resulting table range must overlap the original table range.',
			validate: (value) => {
				const r = parseRange(value.replace(/^=/, '').replace(/^.*!/, '').replace(/\$/g, ''));
				if (!r) return 'The reference is not valid.';
				if (r.start.row !== table.range.start.row)
					return 'The headers must remain in the same row.';
				return undefined;
			},
			apply: (value) => {
				const r = parseRange(value.replace(/^=/, '').replace(/^.*!/, '').replace(/\$/g, ''));
				if (r) t.session.resizeTable(t.sheet, table.name, r);
			},
		});
	});
	d.register('chart-title', (c) => {
		const found = activeChart(c);
		if (!found) return Promise.resolve(undefined);
		return textPrompt(c, {
			name: 'chart-title',
			heading: 'Chart Title',
			label: 'Title:',
			value: found.chart.title ?? '',
			apply: (value) => editChart(c, () => ({ title: value.trim() || UNSET })),
		});
	});
	d.register('comment', (c) => {
		const t = target(c);
		if (!t) return Promise.resolve(undefined);
		const at = t.active;
		const existing = t.ws.comments.find(
			(x) => x.address.row === at.row && x.address.col === at.col,
		);
		return textPrompt(c, {
			name: 'comment',
			heading: existing ? 'Edit Comment' : 'New Comment',
			label: 'Comment',
			value: existing?.text ?? '',
			multiline: true,
			validate: (value) => (value.trim() ? undefined : 'Type a comment first.'),
			apply: (value) => t.session.setComment(t.sheet, at, value, c.authorName()),
		});
	});
	d.register('unhide-sheet', (c) => {
		const session = c.session();
		if (!session) return Promise.resolve(undefined);
		const items = session.workbook.sheets.flatMap((s, i) =>
			s.state === 'hidden' ? [[String(i), s.name] as const] : [],
		);
		return pickDialog(c, {
			name: 'unhide-sheet',
			heading: 'Unhide',
			label: 'Unhide sheet:',
			items,
			apply: (value) => {
				session.setSheetState(Number(value), 'visible');
				c.setActiveSheet(Number(value));
			},
		});
	});
	d.register('use-in-formula', (c) => {
		const t = target(c);
		if (!t) return Promise.resolve(undefined);
		const names = t.workbook.definedNames.filter(
			(n) =>
				!n.hidden &&
				!n.name.startsWith('_xlnm.') &&
				(n.localSheet === undefined || n.localSheet === t.sheet),
		);
		return pickDialog(c, {
			name: 'use-in-formula',
			heading: 'Paste Name',
			label: 'Paste name',
			items: names.map((n) => [n.name, n.name] as const),
			apply: (name) => {
				const grid = c.grid();
				const cell = getCell(t.ws, t.active.row, t.active.col);
				if (grid)
					grid.beginEdit(cell?.formula !== undefined ? `=${cell.formula}${name}` : `=${name}`);
				else t.session.setCellInput(t.sheet, t.active.row, t.active.col, `=${name}`);
			},
		});
	});
}
