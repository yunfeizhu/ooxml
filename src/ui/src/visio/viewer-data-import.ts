import type { Workbook } from 'ooxml-core/xlsx';
import {
	visioDataTable,
	visioParseRange,
	visioWorkbookGrid,
	type VisioDataTable,
} from 'ooxml-core/visio/ui';
import { InsertDialog } from './viewer-insert-dialog';

/** Largest workbook or CSV read for import (the drawing package limit is 32 MiB too). */
export const DATA_IMPORT_MAX_BYTES = 16 * 1024 * 1024;
const ACCEPT = '.csv,.txt,.xlsx,.xlsm,.xls';
/** A local File System Access handle, when the browser offers one. */
export interface DataFileHandle {
	getFile(): Promise<File>;
}
export interface PickedFile {
	file: File;
	handle?: DataFileHandle;
}
/** How a recordset was read, so Refresh All can read it the same way. */
export interface DataSourceOptions {
	sheet: number;
	range: string;
	header: boolean;
}
type Picker = (options: object) => Promise<DataFileHandle[]>;

/** Read a workbook or CSV through the shared xlsx loader (loaded on first use). */
export async function readWorkbook(file: File): Promise<Workbook> {
	if (file.size > DATA_IMPORT_MAX_BYTES)
		throw new Error(`${file.name} is larger than the 16 MB import limit.`);
	const { loadWorkbook } = await import('ooxml-core/xlsx/load');
	return loadWorkbook(new Uint8Array(await file.arrayBuffer()), { fileName: file.name });
}
export function readTable(workbook: Workbook, options: DataSourceOptions): VisioDataTable {
	const range = options.range.trim() ? visioParseRange(options.range) : undefined;
	if (options.range.trim() && !range) throw new Error('Type a range such as A1:D20.');
	const table = visioDataTable(visioWorkbookGrid(workbook, options.sheet, range), {
		header: options.header,
	});
	if (!table.rows.length) throw new Error('The selected data has no rows.');
	return table;
}

/** Local file choice: the File System Access picker when present (Refresh can reuse it), else an input. */
export class DataFilePicker {
	readonly input: HTMLInputElement;
	#pending: ((file: PickedFile | undefined) => void) | undefined;
	constructor(root: ShadowRoot) {
		this.input = root.ownerDocument.createElement('input');
		this.input.type = 'file';
		this.input.accept = ACCEPT;
		this.input.hidden = true;
		this.input.dataset.importData = '';
		this.input.addEventListener('change', () => {
			const file = this.input.files?.[0];
			this.input.value = '';
			this.#settle(file ? { file } : undefined);
		});
		this.input.addEventListener('cancel', () => this.#settle(undefined));
		root.append(this.input);
	}
	#settle(file: PickedFile | undefined): void {
		const pending = this.#pending;
		this.#pending = undefined;
		pending?.(file);
	}
	async pick(): Promise<PickedFile | undefined> {
		const picker = (
			this.input.ownerDocument.defaultView as unknown as { showOpenFilePicker?: Picker }
		)?.showOpenFilePicker;
		if (typeof picker === 'function') {
			try {
				const [handle] = await picker.call(this.input.ownerDocument.defaultView, {
					multiple: false,
					types: [
						{
							description: 'Excel workbooks and CSV files',
							accept: {
								'text/csv': ['.csv', '.txt'],
								'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
									'.xlsx',
									'.xlsm',
								],
								'application/vnd.ms-excel': ['.xls'],
							},
						},
					],
				});
				return handle ? { file: await handle.getFile(), handle } : undefined;
			} catch (error) {
				if (error instanceof Error && error.name === 'AbortError') return undefined;
				// A blocked picker (iframe, policy) falls back to the file input.
			}
		}
		this.#settle(undefined);
		return new Promise((resolve) => {
			this.#pending = resolve;
			this.input.click();
		});
	}
}

/** Custom Import: name, sheet, optional range and whether the first row holds headers. */
export function createImportDialog(
	root: ShadowRoot,
	press: (button: string) => void,
): InsertDialog {
	const dialog = new InsertDialog(
		root,
		'data-import-dialog',
		'Custom Import',
		[
			{ name: 'name', label: 'Recordset name', maxLength: 255 },
			{ name: 'sheet', label: 'Worksheet', choices: true },
			{ name: 'range', label: 'Range (optional)', placeholder: 'A1:D20' },
			{ name: 'header', label: 'First row of data contains column headings', input: 'checkbox' },
		],
		['Import', 'Cancel'],
		press,
	);
	return dialog;
}
