import { NS, parseXml } from '../../xml/index';
import type { CellStyle, DifferentialStyle, Workbook } from '../model';
import { styleKey } from '../styles';
import { defaultCellStyle } from '../workbook';
import { builtinFormatIdOf } from '../read/builtin-formats';
import { parseStyles } from '../read/styles';
import { att, numAttr, outerXml, xChildren, xFirst } from '../read/xml-util';
import { alignmentXml, borderXml, fillXml, fontXml, numFmtXml, protectionXml } from './style-xml';
import { XML_HEADER, el, inlineFragment } from './xml-out';

/** What a save keeps from the source `styles.xml` so carried parts keep valid references. */
interface SourceStyles {
	numFmts: Map<string, number>;
	dxfXml: string[];
	dxfKeys: Map<string, number>;
	tableStyles?: string;
	colors?: string;
	extLst?: string;
}

function readSourceStyles(xml: string | undefined): SourceStyles | undefined {
	if (!xml) return undefined;
	const root = parseXml(xml, { label: 'XLSX styles' }).documentElement;
	const numFmts = new Map<string, number>();
	for (const node of xChildren(xFirst(root, 'numFmts') ?? root, 'numFmt')) {
		const id = numAttr(node, 'numFmtId');
		const code = att(node, 'formatCode');
		if (id !== undefined && code !== undefined && !numFmts.has(code)) numFmts.set(code, id);
	}
	const dxfXml = xChildren(xFirst(root, 'dxfs') ?? root, 'dxf').map((node) =>
		inlineFragment(outerXml(node)),
	);
	const dxfKeys = new Map<string, number>();
	parseStyles(xml, []).dxfs.forEach((dxf, index) => {
		const key = styleKey(dxf as CellStyle);
		if (!dxfKeys.has(key)) dxfKeys.set(key, index);
	});
	const result: SourceStyles = { numFmts, dxfXml, dxfKeys };
	const tableStyles = xFirst(root, 'tableStyles');
	if (tableStyles) result.tableStyles = inlineFragment(outerXml(tableStyles));
	const colors = xFirst(root, 'colors');
	if (colors) result.colors = inlineFragment(outerXml(colors));
	const extLst = xFirst(root, 'extLst');
	if (extLst) result.extLst = inlineFragment(outerXml(extLst));
	return result;
}

/** Interns a list of serialized items, returning stable indices. */
class Pool {
	readonly items: string[] = [];
	private readonly index = new Map<string, number>();
	id(xml: string): number {
		let id = this.index.get(xml);
		if (id === undefined) {
			id = this.items.length;
			this.items.push(xml);
			this.index.set(xml, id);
		}
		return id;
	}
}

/**
 * Builds `styles.xml` from `workbook.styles` (cellXfs index = style id) and the named styles.
 * Source number format ids and differential formats keep their ids, since carried parts
 * (pivot tables, table styles) refer to them.
 */
export class StyleWriter {
	private readonly fonts = new Pool();
	private readonly fills = new Pool();
	private readonly borders = new Pool();
	private readonly numFmts = new Map<string, number>();
	private nextNumFmt = 164;
	private readonly dxfs: string[];
	private readonly dxfKeys: Map<string, number>;
	private readonly source: SourceStyles | undefined;

	constructor(
		private readonly workbook: Workbook,
		sourceXml: string | undefined,
	) {
		this.source = readSourceStyles(sourceXml);
		for (const [code, id] of this.source?.numFmts ?? []) {
			this.numFmts.set(code, id);
			this.nextNumFmt = Math.max(this.nextNumFmt, id + 1);
		}
		this.dxfs = [...(this.source?.dxfXml ?? [])];
		this.dxfKeys = new Map(this.source?.dxfKeys ?? []);
		this.fills.id(fillXml({ type: 'pattern', pattern: 'none' }));
		this.fills.id(fillXml({ type: 'pattern', pattern: 'gray125' }));
	}

	numFmtId(code: string): number {
		const builtin = builtinFormatIdOf(code);
		if (builtin !== undefined) return builtin;
		let id = this.numFmts.get(code);
		if (id === undefined) {
			id = this.nextNumFmt++;
			this.numFmts.set(code, id);
		}
		return id;
	}

	/** The `dxfId` of a differential style, reusing an equal source entry. */
	dxfId(style: DifferentialStyle): number {
		const key = styleKey(style as CellStyle);
		const known = this.dxfKeys.get(key);
		if (known !== undefined) return known;
		let xml = '';
		if (style.font) xml += fontXml(style.font, 'font', true);
		if (style.numFmt !== undefined) xml += numFmtXml(this.numFmtId(style.numFmt), style.numFmt);
		if (style.fill) xml += fillXml(style.fill, true);
		if (style.border) xml += borderXml(style.border);
		this.dxfs.push(`<dxf>${xml}</dxf>`);
		this.dxfKeys.set(key, this.dxfs.length - 1);
		return this.dxfs.length - 1;
	}

	private xf(style: CellStyle, xfId: number | undefined): string {
		const numFmtId = this.numFmtId(style.numFmt);
		const fontId = this.fonts.id(fontXml(style.font));
		const fillId = this.fills.id(fillXml(style.fill));
		const borderId = this.borders.id(borderXml(style.border));
		const inner = alignmentXml(style.alignment) + protectionXml(style.protection);
		return el(
			'xf',
			{
				numFmtId,
				fontId,
				fillId,
				borderId,
				xfId,
				applyNumberFormat: xfId !== undefined && numFmtId !== 0 ? true : undefined,
				applyFont: xfId !== undefined && fontId !== 0 ? true : undefined,
				applyFill: xfId !== undefined && fillId !== 0 ? true : undefined,
				applyBorder: xfId !== undefined && borderId !== 0 ? true : undefined,
				applyAlignment: xfId !== undefined && style.alignment ? true : undefined,
				applyProtection: xfId !== undefined && style.protection ? true : undefined,
				quotePrefix: style.quotePrefix,
				pivotButton: style.pivotButton,
			},
			inner,
		);
	}

	xml(): string {
		const named = [...this.workbook.namedStyles];
		const normalAt = named.findIndex((entry) => entry.name === 'Normal' || entry.builtinId === 0);
		if (normalAt > 0) named.unshift(...named.splice(normalAt, 1));
		if (normalAt < 0)
			named.unshift({
				name: 'Normal',
				style: this.workbook.styles[0] ?? defaultCellStyle(),
				builtinId: 0,
			});
		const seen = new Set<string>();
		const unique = named.filter((entry) => !seen.has(entry.name) && seen.add(entry.name));
		const xfIdOf = new Map(unique.map((entry, index) => [entry.name, index]));
		const base = this.workbook.styles[0] ?? defaultCellStyle();
		// Font 0 and border 0 are the defaults Excel falls back on.
		this.fonts.id(fontXml(base.font));
		this.borders.id(borderXml({}));
		const styleXfs = unique.map((entry) => this.xf(entry.style, undefined));
		const cellXfs = (this.workbook.styles.length ? this.workbook.styles : [base]).map((style) =>
			this.xf(style, xfIdOf.get(style.cellStyleName ?? 'Normal') ?? 0),
		);
		const cellStyles = unique.map((entry, index) =>
			el('cellStyle', { name: entry.name, xfId: index, builtinId: entry.builtinId }),
		);
		const custom = [...this.numFmts]
			.filter(([code]) => builtinFormatIdOf(code) === undefined)
			.sort((a, b) => a[1] - b[1]);
		let out = `${XML_HEADER}<styleSheet xmlns="${NS.x}" xmlns:mc="${NS.mc}" mc:Ignorable="x14ac" xmlns:x14ac="${NS.x14ac}">`;
		if (custom.length)
			out += `<numFmts count="${custom.length}">${custom.map(([code, id]) => numFmtXml(id, code)).join('')}</numFmts>`;
		out += `<fonts count="${this.fonts.items.length}">${this.fonts.items.join('')}</fonts>`;
		out += `<fills count="${this.fills.items.length}">${this.fills.items.join('')}</fills>`;
		out += `<borders count="${this.borders.items.length}">${this.borders.items.join('')}</borders>`;
		out += `<cellStyleXfs count="${styleXfs.length}">${styleXfs.join('')}</cellStyleXfs>`;
		out += `<cellXfs count="${cellXfs.length}">${cellXfs.join('')}</cellXfs>`;
		out += `<cellStyles count="${cellStyles.length}">${cellStyles.join('')}</cellStyles>`;
		out += `<dxfs count="${this.dxfs.length}">${this.dxfs.join('')}</dxfs>`;
		out +=
			this.source?.tableStyles ??
			'<tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>';
		if (this.source?.colors) out += this.source.colors;
		if (this.source?.extLst) out += this.source.extLst;
		return `${out}</styleSheet>`;
	}
}
