import {
	visioShapeReport,
	visioShapeReportCsv,
	visioShapeReportTable,
	visioShapeReportText,
	type VisioShapeReport,
} from 'ooxml-core/visio/ui';
import type { ViewerController } from './controller';

type Dialog = HTMLElement & { open: boolean; show(): void; close(): void };
type Button = HTMLElement & { disabled: boolean };
/** Rows drawn in the dialog; Export CSV and Copy always carry the whole report. */
const SHOWN_ROWS = 500;

/**
 * Review > Shape Reports: a table of every shape on the current page or in the drawing, with
 * Export CSV (a local download) and Copy (tab-separated text). The report itself is built in core.
 */
export class ViewerShapeReport {
	readonly dialog: Dialog;
	readonly scope: HTMLSelectElement;
	readonly table: HTMLTableElement;
	readonly status: HTMLElement;
	#report: VisioShapeReport | undefined;
	#urls = new Set<string>();
	constructor(
		private readonly root: ShadowRoot,
		private readonly controller: ViewerController,
		private readonly announce: (message: string) => void,
	) {
		const doc = root.ownerDocument;
		this.dialog = doc.createElement('office-ui-dialog') as Dialog;
		this.dialog.className = 'shape-report-dialog';
		this.dialog.setAttribute('heading', 'Shape Reports');
		const label = doc.createElement('label');
		label.textContent = 'Shapes on ';
		this.scope = doc.createElement('select');
		this.scope.name = 'scope';
		for (const [value, text] of [
			['page', 'the current page'],
			['document', 'all pages'],
		]) {
			const option = doc.createElement('option');
			option.value = value!;
			option.textContent = text!;
			this.scope.append(option);
		}
		this.scope.addEventListener('change', () => this.#build());
		label.append(this.scope);
		const scroller = doc.createElement('div');
		scroller.className = 'shape-report-table';
		scroller.tabIndex = 0;
		this.table = doc.createElement('table');
		scroller.append(this.table);
		this.status = doc.createElement('p');
		this.status.setAttribute('role', 'status');
		this.dialog.append(label, scroller, this.status);
		for (const [name, run] of [
			['Export CSV', () => this.#export()],
			['Copy', () => void this.#copy()],
			['Close', () => this.dialog.close()],
		] as const) {
			const button = doc.createElement('office-ui-button') as Button;
			button.slot = 'footer';
			button.setAttribute('label', name);
			button.setAttribute('command', `shape-report-${name.toLowerCase().replace(/\s+/g, '-')}`);
			button.addEventListener('office-command', () => {
				if (!button.disabled) run();
			});
			this.dialog.append(button);
		}
		root.append(this.dialog);
	}
	get report(): VisioShapeReport | undefined {
		return this.#report;
	}
	show(): void {
		if (!this.controller.state.document) return;
		this.scope.value = 'page';
		this.#build();
		this.dialog.show();
	}
	#build(): void {
		const { document, pageIndex } = this.controller.state;
		if (!document) return;
		const report = visioShapeReport(document, this.scope.value === 'page' ? { pageIndex } : {});
		this.#report = report;
		const doc = this.root.ownerDocument;
		const head = doc.createElement('tr');
		for (const column of report.columns) {
			const cell = doc.createElement('th');
			cell.scope = 'col';
			cell.textContent = column;
			head.append(cell);
		}
		const rows = visioShapeReportTable({ ...report, rows: report.rows.slice(0, SHOWN_ROWS) });
		const body = doc.createElement('tbody');
		for (const values of rows) {
			const row = doc.createElement('tr');
			for (const value of values) {
				const cell = doc.createElement('td');
				cell.textContent = value;
				row.append(cell);
			}
			body.append(row);
		}
		const thead = doc.createElement('thead');
		thead.append(head);
		this.table.replaceChildren(thead, body);
		const count = report.rows.length;
		this.status.textContent =
			`${count} shape${count === 1 ? '' : 's'}` +
			(count > SHOWN_ROWS ? `; the first ${SHOWN_ROWS} are shown, Export CSV includes all` : '') +
			(report.truncated ? '; the report stopped at its row limit' : '') +
			'. Sizes and positions are in inches.';
	}
	#export(): void {
		const report = this.#report;
		if (!report) return;
		const doc = this.root.ownerDocument;
		// A byte order mark lets spreadsheet programs read the CSV as UTF-8.
		const blob = new Blob(['﻿', visioShapeReportCsv(report)], {
			type: 'text/csv;charset=utf-8',
		});
		const url = URL.createObjectURL(blob);
		this.#urls.add(url);
		const anchor = doc.createElement('a');
		anchor.href = url;
		anchor.download = 'Shape report.csv';
		anchor.hidden = true;
		this.root.append(anchor);
		anchor.click();
		anchor.remove();
		doc.defaultView?.setTimeout(() => {
			if (this.#urls.delete(url)) URL.revokeObjectURL(url);
		}, 1000);
		this.announce('Shape report CSV download requested.');
	}
	async #copy(): Promise<void> {
		const report = this.#report;
		const clipboard = this.root.ownerDocument.defaultView?.navigator.clipboard;
		if (!report) return;
		try {
			if (!clipboard) throw new Error('unavailable');
			await clipboard.writeText(visioShapeReportText(report));
			this.status.textContent = 'Copied the report as tab-separated text.';
		} catch {
			this.status.textContent = 'The browser did not allow copying; use Export CSV instead.';
		}
	}
	dispose(): void {
		this.dialog.close();
		for (const url of this.#urls) URL.revokeObjectURL(url);
		this.#urls.clear();
	}
}
