import { NS, buildXml, children, elements, first, parseXml, type XmlElement } from '../xml/index';
import type { ConditionalRule, Worksheet } from './model';
import { formatRange } from './address';
import { descendants, selfContainedXml, numAttr } from './read/xml-util';
import { inlineFragment } from './write/xml-out';

const XM = 'http://schemas.microsoft.com/office/excel/2006/main';
const URI = '{78C0D931-6437-407d-A8EE-F0AAD7539E65}';

/** Keep typed edits authoritative without downgrading untouched automatic limits. */
function writeSettings(
	node: XmlElement,
	rule: Extract<ConditionalRule, { type: 'dataBar' }>,
): void {
	const bar = first(node, 'dataBar', NS.x14);
	if (!bar) return;
	if (rule.minLength !== undefined) bar.setAttribute('minLength', String(rule.minLength));
	if (rule.maxLength !== undefined) bar.setAttribute('maxLength', String(rule.maxLength));
	const thresholds = children(bar, 'cfvo', NS.x14);
	for (const [index, threshold] of [rule.min, rule.max].entries()) {
		const target = thresholds[index];
		if (!target) continue;
		const oldType = target.getAttribute('type');
		if (
			(oldType === 'autoMin' && threshold.type === 'min') ||
			(oldType === 'autoMax' && threshold.type === 'max')
		)
			continue;
		target.setAttribute('type', threshold.type);
		const formula = first(target, 'f', XM);
		if (threshold.value === undefined) {
			if (formula) target.removeChild(formula);
		} else {
			const value = formula ?? target.ownerDocument.createElementNS(XM, 'xm:f');
			value.textContent = threshold.value;
			if (!formula) target.appendChild(value);
		}
	}
}

/** Move linked x14 data-bar records into the rule model; leave unrelated extensions intact. */
export function readConditionalExtensions(sheet: Worksheet): void {
	const rules = new Map<string, Extract<ConditionalRule, { type: 'dataBar' }>>();
	for (const format of sheet.conditionalFormats)
		for (const rule of format.rules)
			if (rule.type === 'dataBar' && rule.extensionId) rules.set(rule.extensionId, rule);
	const kept: string[] = [];
	for (const xml of sheet.preserved.get('extLst') ?? []) {
		const doc = parseXml(xml);
		let changed = false;
		for (const node of descendants(doc.documentElement, 'cfRule', NS.x14)) {
			const rule = rules.get(node.getAttribute('id') ?? '');
			if (!rule || node.getAttribute('type') !== 'dataBar') continue;
			rule.extensionXml = selfContainedXml(node);
			const bar = first(node, 'dataBar', NS.x14);
			if (bar) {
				rule.minLength = numAttr(bar, 'minLength') ?? 10;
				rule.maxLength = numAttr(bar, 'maxLength') ?? 90;
			}
			const parent = node.parentNode;
			parent?.removeChild(node);
			if (parent && !elements(parent).some((e) => e.localName === 'cfRule')) {
				const collection = parent.parentNode;
				collection?.removeChild(parent);
				if (collection && !elements(collection).length) {
					const ext = collection.parentNode;
					ext?.removeChild(collection);
					if (ext && !elements(ext).length) ext.parentNode?.removeChild(ext);
				}
			}
			changed = true;
		}
		if (!changed) kept.push(xml);
		else if (elements(doc.documentElement).length) kept.push(buildXml(doc));
	}
	if (kept.length) sheet.preserved.set('extLst', kept);
	else sheet.preserved.delete('extLst');
}

/** Excel 2007 fallback percentages for the linked full-width Excel 2010 bar. */
export function dataBarBaseLengths(rule: Extract<ConditionalRule, { type: 'dataBar' }>) {
	if (!rule.extensionId || !rule.extensionXml)
		return { minLength: rule.minLength, maxLength: rule.maxLength };
	const lengths = dataBarLengths(rule);
	return lengths.minLength === 0 && lengths.maxLength === 100
		? { minLength: 10, maxLength: 90 }
		: lengths;
}

/** Resolve logical percentages once for both layout and the legacy fallback writer. */
export function dataBarLengths(
	rule: Extract<ConditionalRule, { type: 'dataBar' }>,
	node?: XmlElement,
) {
	const bar =
		node ??
		(rule.extensionXml
			? first(parseXml(rule.extensionXml).documentElement, 'dataBar', NS.x14)
			: undefined);
	return {
		minLength: rule.minLength ?? numAttr(bar, 'minLength') ?? 10,
		maxLength: rule.maxLength ?? numAttr(bar, 'maxLength') ?? 90,
	};
}

/** Rewrite extension formulas through the same product formula engine as the base rule. */
export function rewriteConditionalExtension(
	rule: Extract<ConditionalRule, { type: 'dataBar' }>,
	rewrite: (formula: string) => string,
): void {
	if (!rule.extensionXml) return;
	const doc = parseXml(rule.extensionXml);
	let changed = false;
	for (const formula of descendants(doc.documentElement, 'f', XM)) {
		const before = formula.textContent ?? '';
		const next = rewrite(before);
		if (before !== next) {
			formula.textContent = next;
			changed = true;
		}
	}
	if (changed) rule.extensionXml = buildXml(doc);
}

/** Regenerate linked extension ranges from their rule, retaining unknown bar settings. */
export function conditionalExtensionsXml(sheet: Worksheet): string {
	const preserved = sheet.preserved.get('extLst') ?? [];
	const doc = parseXml(preserved[0] || `<extLst xmlns="${NS.x}"/>`);
	for (const xml of preserved.slice(1))
		for (const node of elements(parseXml(xml).documentElement))
			doc.documentElement.appendChild(doc.importNode(node, true));
	let ext = elements(doc.documentElement).find((e) => e.getAttribute('uri') === URI);
	let collection = first(ext, 'conditionalFormattings', NS.x14);
	for (const format of sheet.conditionalFormats)
		for (const rule of format.rules) {
			if (rule.type !== 'dataBar' || !rule.extensionXml || !rule.extensionId) continue;
			if (!ext) {
				ext = doc.createElementNS(NS.x, 'ext');
				ext.setAttribute('uri', URI);
				doc.documentElement.appendChild(ext);
			}
			if (!collection) {
				collection = doc.createElementNS(NS.x14, 'x14:conditionalFormattings');
				ext.appendChild(collection);
			}
			const group = doc.createElementNS(NS.x14, 'x14:conditionalFormatting');
			const node = doc.importNode(parseXml(rule.extensionXml).documentElement, true);
			writeSettings(node, rule);
			node.setAttribute('id', rule.extensionId);
			if (node.hasAttribute('priority')) node.setAttribute('priority', String(rule.priority));
			group.appendChild(node);
			const sqref = doc.createElementNS(XM, 'xm:sqref');
			sqref.textContent = format.ranges.map(formatRange).join(' ');
			group.appendChild(sqref);
			collection.appendChild(group);
		}
	return elements(doc.documentElement).length ? inlineFragment(buildXml(doc)) : '';
}
