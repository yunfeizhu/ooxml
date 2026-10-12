import type { VisioPackage } from './package';
import type { VisioTextFieldInsertEdit } from './edit-text-field-commands';
import { attribute, children, yes } from './sheet';
import { fail } from './package-common';
import { related, visioXml } from './parts';
import { visioFormulaCachedValue, type VisioFormulaReference } from './formula';
import { localTextTarget } from './edit-text-target';
import { effectiveFormattingRows, formattingCell } from './edit-style-admission';
import { assertFormattingText, formattingRows } from './edit-formatting-rows';
import { assertFormattingDependencies } from './edit-formatting-scope';
import { decodeVisioPlainText } from './plain-text';
import { readVisioFieldProperties } from './text-field-context';
import {
	VISIO_FIELD_FUNCTIONS,
	evaluateVisioTextField,
	formatVisioFieldValue,
	visioDateSerial,
	visioWallClock,
	type VisioFieldContext,
	type VisioFieldValue,
} from './text-fields';

const STRING_PROPERTIES = [
	'title',
	'subject',
	'creator',
	'keywords',
	'description',
	'category',
	'company',
	'manager',
] as const;

async function pageContext(pkg: VisioPackage, pageId: string): Promise<VisioFieldContext> {
	const documentPath = await related(pkg, '', 'document');
	const pagesPath = documentPath ? await related(pkg, documentPath, 'pages') : undefined;
	if (!pagesPath) fail('EDIT_TARGET_NOT_FOUND', 'The drawing has no pages part.');
	const pages = children(await visioXml(pkg, pagesPath, 'Pages'), 'Page');
	const page = pages.find((node) => attribute(node, 'ID') === pageId);
	const foreground = pages.filter((node) => !yes(attribute(node, 'Background')));
	const number = page ? foreground.indexOf(page) + 1 : 0;
	const properties = await readVisioFieldProperties(pkg);
	// Unset document properties show as empty text, as in Visio.
	for (const key of STRING_PROPERTIES) properties[key] ??= '';
	return {
		pageName: attribute(page, 'Name') ?? attribute(page, 'NameU') ?? `Page ${pageId}`,
		...(number ? { pageNumber: number } : {}),
		pageCount: foreground.length,
		properties,
		now: visioWallClock(new Date()),
	};
}

/** Own-shape numeric cells for geometry and custom formulas; Angle defaults to zero. */
function shapeResolver(shape: Element) {
	return (reference: VisioFormulaReference) => {
		if (reference.shapeId !== undefined)
			fail('UNSUPPORTED_TEXT_FIELD', 'Text fields may only reference cells of their own shape.');
		const cell = formattingCell(shape, reference.cell);
		if (!cell) {
			if (/^angle$/i.test(reference.cell)) return { value: 0, unit: 'angle' as const };
			fail('UNSUPPORTED_TEXT_FIELD', `The shape has no cached ${reference.cell} cell.`);
		}
		const value = visioFormulaCachedValue(attribute(cell, 'V') ?? '', attribute(cell, 'U'));
		// Unitless caches of transform cells hold internal inches and radians.
		if (
			value.unit === 'scalar' &&
			/^(Width|Height|PinX|PinY|LocPinX|LocPinY)$/i.test(reference.cell)
		)
			return { value: value.value, unit: 'length' as const };
		if (value.unit === 'scalar' && /^angle$/i.test(reference.cell))
			return { value: value.value, unit: 'angle' as const };
		return value;
	};
}

function valueCell(value: VisioFieldValue): { v: string; u?: string; type: number } {
	if (value.kind === 'string') return { v: value.text, u: 'STR', type: 0 };
	if (value.kind === 'date') return { v: String(visioDateSerial(value.date)), u: 'DATE', type: 5 };
	const unit = value.unit === 'length' ? 'IN' : value.unit === 'angle' ? 'DEG' : undefined;
	return { v: String(Number(value.value.toFixed(10))), ...(unit ? { u: unit } : {}), type: 2 };
}

function insertionPoint(text: Element, offset: number | undefined) {
	let stored = '';
	const tokens: { node: Node; start: number; end: number; field: boolean }[] = [];
	for (const node of Array.from(text.childNodes)) {
		const start = stored.length;
		const field = node.nodeType === 1 && (node as Element).localName === 'fld';
		if (node.nodeType === 3 || node.nodeType === 4) stored += node.nodeValue ?? '';
		else if (field) stored += node.textContent ?? '';
		tokens.push({ node, start, end: stored.length, field });
	}
	const logical = decodeVisioPlainText(stored);
	const at = offset ?? logical.length;
	for (const token of tokens) {
		if (token.field && at > token.start && at < token.end)
			fail('UNSUPPORTED_TEXT_FIELD', 'A field cannot be inserted inside another field.');
		if (token.node.nodeType !== 1 && at >= token.start && at < token.end)
			return { logical, before: token.node, split: at - token.start };
	}
	return { logical, before: null, split: 0 };
}

/** Insert one evaluated field into a local shape's text, creating the Text element if needed. */
export async function insertVisioTextField(
	pkg: VisioPackage,
	pagePaths: ReadonlySet<string>,
	roots: ReadonlyMap<string, Element>,
	document: Element,
	edit: VisioTextFieldInsertEdit,
	check: () => void,
): Promise<boolean> {
	const shape = localTextTarget(roots.get(edit.pageId)!, document, edit.shapeId, check);
	if (children(shape, 'Shapes').length || children(shape, 'ForeignData').length)
		fail('UNSUPPORTED_TEXT_FIELD', 'Fields can only be inserted into plain local shapes.');
	const texts = children(shape, 'Text');
	if (texts.length > 1) fail('UNSUPPORTED_TEXT_FIELD', 'The shape has ambiguous Text elements.');
	const owner = shape.ownerDocument!;
	const ns = shape.namespaceURI;
	const text = texts[0] ?? owner.createElementNS(ns, 'Text');
	if (Array.from(text.childNodes).some((node) => ![3, 4].includes(node.nodeType)) && texts[0])
		assertFormattingText(
			shape,
			effectiveFormattingRows(shape, document, 'Character'),
			effectiveFormattingRows(shape, document, 'Paragraph'),
		);
	const rows = formattingRows(shape, 'Field');
	const point = insertionPoint(text, edit.offset);
	if (edit.offset !== undefined && point.logical !== edit.expectedText)
		fail('EDIT_STALE_TEXT', 'The shape text changed since the field position was chosen.');
	const context = { ...(await pageContext(pkg, edit.pageId)), resolve: shapeResolver(shape) };
	let value: VisioFieldValue | undefined;
	try {
		value = evaluateVisioTextField(edit.formula, context);
	} catch (error) {
		if (error instanceof Error && 'code' in error) throw error;
	}
	if (!value)
		fail(
			'UNSUPPORTED_TEXT_FIELD',
			`This editor cannot evaluate the field formula. Supported: ${VISIO_FIELD_FUNCTIONS.join(', ')}, PAGENUMBER, PAGECOUNT and numeric formulas on this shape.`,
		);
	const display = formatVisioFieldValue(value, edit.format ?? '');
	if (display === undefined)
		fail('UNSUPPORTED_TEXT_FIELD', 'The field format does not suit the field value.');
	if (texts[0])
		await assertFormattingDependencies(
			pkg,
			pagePaths,
			roots,
			edit.pageId,
			shape,
			new Map([['TheText', text]]),
			check,
		);
	check();
	const index = String(rows.size ? Math.max(...[...rows.keys()].map(Number)) + 1 : 0);
	let section = children(shape, 'Section').find((node) => attribute(node, 'N') === 'Field');
	if (!section) {
		section = owner.createElementNS(ns, 'Section');
		section.setAttribute('N', 'Field');
		shape.insertBefore(section, texts[0] ?? null);
	}
	const row = owner.createElementNS(ns, 'Row');
	row.setAttribute('IX', index);
	const cell = (name: string, v: string, extra: Record<string, string> = {}) => {
		const node = owner.createElementNS(ns, 'Cell');
		node.setAttribute('N', name);
		node.setAttribute('V', v);
		for (const [key, item] of Object.entries(extra)) node.setAttribute(key, item);
		row.appendChild(node);
	};
	const stored = valueCell(value);
	cell('Value', stored.v, { ...(stored.u ? { U: stored.u } : {}), F: edit.formula });
	if (edit.format) cell('Format', edit.format, { F: `"${edit.format.replaceAll('"', '""')}"` });
	cell('Type', String(stored.type));
	section.appendChild(row);
	const field = owner.createElementNS(ns, 'fld');
	field.setAttribute('IX', index);
	field.appendChild(owner.createTextNode(display));
	let before = point.before;
	if (before && point.split > 0) {
		before = (before as Text).splitText(point.split);
	}
	text.insertBefore(field, before);
	if (!texts[0])
		shape.insertBefore(
			text,
			children(shape, 'Data1')[0] ??
				children(shape, 'Data2')[0] ??
				children(shape, 'Data3')[0] ??
				children(shape, 'Rel')[0] ??
				null,
		);
	return true;
}
