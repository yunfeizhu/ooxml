import { NS, elements, parseXml } from '../../xml/index';
import { formatAddress, formatRange, type CellAddress } from '../address';
import { usedRange } from '../cells';
import type { AutoFilterColumn, ColumnInfo, Worksheet } from '../model';
import {
	readAutoFilter,
	readFitToPage,
	readProtection,
	readSheetFormat,
	readSheetView,
	readTabColor,
} from '../read/sheet-props';
import { outerXml } from '../read/xml-util';
import { mergedAttrs } from './attr-merge';
import { modernHashValues } from './password-hash';
import { sameModel, snapshotElement, snapshotXml } from './snapshot';
import { colorXml } from './style-xml';
import { attrs, el, escapeAttr } from './xml-out';

const sqref = (ranges: readonly { start: CellAddress; end: CellAddress }[]) =>
	ranges.map((range) => formatRange(range)).join(' ');

export function sheetPrXml(sheet: Worksheet): string {
	const source = snapshotElement(sheet, 'sheetPr');
	const fit =
		sheet.pageSetup?.fitToWidth !== undefined || sheet.pageSetup?.fitToHeight !== undefined;
	if (source && sameModel(readTabColor(source), sheet.tabColor) && readFitToPage(source) === fit)
		return snapshotXml(sheet, 'sheetPr') ?? '';
	const sourceAttrs = source
		? Array.from(source.attributes)
				.filter((a) => !a.name.startsWith('xmlns'))
				.map((a) => ` ${a.name}="${escapeAttr(a.value)}"`)
				.join('')
		: '';
	const children = source ? elements(source) : [];
	const outline = children.find((node) => node.localName === 'outlinePr');
	const setUp = children.find((node) => node.localName === 'pageSetUpPr');
	let setUpXml = '';
	if (setUp || fit) {
		const keep = setUp
			? Array.from(setUp.attributes)
					.filter((a) => a.name !== 'fitToPage' && !a.name.startsWith('xmlns'))
					.map((a) => ` ${a.name}="${escapeAttr(a.value)}"`)
					.join('')
			: '';
		setUpXml = `<pageSetUpPr${keep}${fit ? ' fitToPage="1"' : ''}/>`;
		if (setUpXml === '<pageSetUpPr/>') setUpXml = '';
	}
	const inner =
		colorXml(sheet.tabColor, 'tabColor') + (outline ? outerXml(outline) : '') + setUpXml;
	if (!inner && !sourceAttrs) return '';
	return `<sheetPr${sourceAttrs}>${inner}</sheetPr>`;
}

export function dimensionXml(sheet: Worksheet): string {
	const used = usedRange(sheet);
	return `<dimension ref="${used ? formatRange(used) : 'A1'}"/>`;
}

export function sheetViewsXml(sheet: Worksheet, tabSelected: boolean): string {
	const source = snapshotElement(sheet, 'sheetViews');
	if (source && sameModel(readSheetView(source), sheet.view)) {
		const first = elements(source).find((node) => node.localName === 'sheetView');
		if (first) {
			if (tabSelected) first.setAttribute('tabSelected', '1');
			else first.removeAttribute('tabSelected');
		}
		return outerXml(source);
	}
	const view = sheet.view;
	let inner = '';
	let pane: string | undefined;
	if (view.freeze && (view.freeze.rows > 0 || view.freeze.cols > 0)) {
		const { rows, cols } = view.freeze;
		pane = rows && cols ? 'bottomRight' : rows ? 'bottomLeft' : 'topRight';
		inner += el('pane', {
			xSplit: cols || undefined,
			ySplit: rows || undefined,
			// Excel rejects a scrolled pane whose top-left cell lies inside the frozen area.
			topLeftCell: formatAddress({
				row: Math.max(view.topLeft?.row ?? rows, rows),
				col: Math.max(view.topLeft?.col ?? cols, cols),
			}),
			activePane: pane,
			state: 'frozen',
		});
	}
	if (view.selection) {
		inner += el('selection', {
			pane,
			activeCell: formatAddress(view.selection.active),
			sqref: sqref(view.selection.ranges) || formatAddress(view.selection.active),
		});
	}
	const attributes = attrs({
		tabSelected: tabSelected || undefined,
		showGridLines: view.showGridLines ? undefined : false,
		showRowColHeaders: view.showHeaders ? undefined : false,
		showZeros: view.showZeros ? undefined : false,
		rightToLeft: view.rightToLeft || undefined,
		topLeftCell: !view.freeze && view.topLeft ? formatAddress(view.topLeft) : undefined,
		showFormulas: view.showFormulas || undefined,
		zoomScale: view.zoom !== 100 ? view.zoom : undefined,
		zoomScaleNormal: view.zoom !== 100 ? view.zoom : undefined,
		workbookViewId: 0,
	});
	return `<sheetViews><sheetView${attributes}${inner ? `>${inner}</sheetView>` : '/>'}</sheetViews>`;
}

export function sheetFormatXml(sheet: Worksheet): string {
	const source = snapshotElement(sheet, 'sheetFormatPr');
	const current: ReturnType<typeof readSheetFormat> = { defaultRowHeight: sheet.defaultRowHeight };
	if (sheet.defaultColWidth !== undefined) current.defaultColWidth = sheet.defaultColWidth;
	if (sheet.format && Object.keys(sheet.format).length) current.format = sheet.format;
	const rowLevel = Math.max(
		0,
		...[...sheet.rowInfo.values()].map((info) => info.outlineLevel ?? 0),
	);
	const colLevel = Math.max(0, ...sheet.columns.map((col) => col.outlineLevel ?? 0));
	if (
		source &&
		sameModel(readSheetFormat(source), current) &&
		Number(source.getAttribute('outlineLevelRow') ?? 0) === rowLevel &&
		Number(source.getAttribute('outlineLevelCol') ?? 0) === colLevel
	)
		return snapshotXml(sheet, 'sheetFormatPr') ?? '';
	const format = sheet.format ?? {};
	// Unknown and prefixed attributes (`x14ac:dyDescent`) are kept from the source.
	return `<sheetFormatPr${mergedAttrs(source, {
		baseColWidth: format.baseColWidth,
		defaultColWidth: sheet.defaultColWidth,
		defaultRowHeight: sheet.defaultRowHeight,
		customHeight: format.customHeight ?? (sheet.defaultRowHeight !== 15 ? true : undefined),
		zeroHeight: format.zeroHeight,
		thickTop: format.thickTop,
		thickBottom: format.thickBottom,
		outlineLevelRow: rowLevel || undefined,
		outlineLevelCol: colLevel || undefined,
	})}/>`;
}

export function colsXml(sheet: Worksheet, styleCount: number): string {
	const sorted = [...sheet.columns].sort((a, b) => a.min - b.min);
	let previous = -1;
	const out: string[] = [];
	for (const column of sorted) {
		const col: ColumnInfo = { ...column, min: Math.max(column.min, previous + 1) };
		if (col.max < col.min) continue;
		previous = col.max;
		const style = col.styleId && col.styleId < styleCount ? col.styleId : undefined;
		out.push(
			el('col', {
				min: col.min + 1,
				max: col.max + 1,
				width: col.width,
				style,
				hidden: col.hidden || undefined,
				bestFit: col.bestFit || undefined,
				customWidth: col.customWidth || undefined,
				outlineLevel: col.outlineLevel || undefined,
				collapsed: col.collapsed || undefined,
			}),
		);
	}
	return out.length ? `<cols>${out.join('')}</cols>` : '';
}

export function protectionXml(sheet: Worksheet): string {
	const protection = sheet.protection;
	if (!protection) return '';
	const source = snapshotElement(sheet, 'sheetProtection');
	if (source && sameModel(readProtection(source), protection))
		return snapshotXml(sheet, 'sheetProtection') ?? '';
	// Both hashes come from the model only: one the edit removed must not be copied back.
	const values: Record<string, string | boolean | undefined> = modernHashValues(
		protection.modernHash,
	);
	values['password'] = protection.passwordHash;
	values['sheet'] = protection.sheet || undefined;
	const allow = new Set(protection.allow ?? []);
	if (protection.sheet) {
		values['objects'] = !allow.has('objects');
		values['scenarios'] = !allow.has('scenarios');
	}
	for (const name of allow) values[name] = false;
	return el('sheetProtection', values);
}

/** The modelled criteria of a kept `<filterColumn>`, to tell whether an edit replaced them. */
function sourceCriteria(
	xml: string,
): { values: string[] | undefined; blank: boolean | undefined } | undefined {
	try {
		const wrapped = `<autoFilter xmlns="${NS.x}" ref="A1">${xml}</autoFilter>`;
		const column = readAutoFilter(parseXml(wrapped).documentElement)?.columns?.[0];
		return column ? { values: column.values, blank: column.blank } : undefined;
	} catch {
		return undefined;
	}
}

function filterColumnXml(column: AutoFilterColumn): string {
	if (
		column.sourceXml &&
		sameModel(sourceCriteria(column.sourceXml), { values: column.values, blank: column.blank })
	) {
		const head = /^<filterColumn\b[^>]*?>/.exec(column.sourceXml)?.[0];
		if (head) {
			const colId = ` colId="${column.offset}"`;
			const patched = /\scolId="[^"]*"/.test(head)
				? head.replace(/\scolId="[^"]*"/, colId)
				: head.replace(/^<filterColumn\b/, `<filterColumn${colId}`);
			return patched + column.sourceXml.slice(head.length);
		}
	}
	// Criteria the model does not hold are never written as an empty `<filterColumn>`.
	if (!column.values?.length && !column.blank) return '';
	const values = (column.values ?? []).map((value) => el('filter', { val: value })).join('');
	return el(
		'filterColumn',
		{ colId: column.offset },
		el('filters', { blank: column.blank || undefined }, values) || '<filters/>',
	);
}

export function autoFilterXml(sheet: Worksheet): string {
	const filter = sheet.autoFilter;
	if (!filter) return '';
	const source = snapshotElement(sheet, 'autoFilter');
	if (source && sameModel(readAutoFilter(source), filter))
		return snapshotXml(sheet, 'autoFilter') ?? '';
	const width = filter.range.end.col - filter.range.start.col + 1;
	const columns = (filter.columns ?? [])
		.filter((column) => column.offset >= 0 && column.offset < width)
		.sort((a, b) => a.offset - b.offset)
		.map(filterColumnXml)
		.join('');
	// A kept `sortState` (inside the filter) stays only while the range is unchanged.
	const sort =
		source && sameModel(readAutoFilter(source)?.range, filter.range)
			? elements(source)
					.filter((node) => node.localName === 'sortState' || node.localName === 'extLst')
					.map((node) => outerXml(node))
					.join('')
			: '';
	return el('autoFilter', { ref: formatRange(filter.range) }, columns + sort);
}

export function mergeCellsXml(sheet: Worksheet): string {
	if (!sheet.merges.length) return '';
	const cells = sheet.merges.map((range) => `<mergeCell ref="${formatRange(range)}"/>`).join('');
	return `<mergeCells count="${sheet.merges.length}">${cells}</mergeCells>`;
}
