import { NS } from '../../xml/index';
import { formatAddress, formatRange } from '../address';
import { dataBarBaseLengths } from '../conditional-extensions';
import type { CfvoThreshold, ConditionalFormat, ConditionalRule, DataValidation } from '../model';
import { addFuturePrefixes } from '../read/formula-text';
import { timePeriodFormula } from '../time-period';
import { colorXml } from './style-xml';
import type { StyleWriter } from './styles';
import { attrs, el, escapeText } from './xml-out';

const cfvoXml = (threshold: CfvoThreshold) =>
	el('cfvo', {
		type: threshold.type,
		val: threshold.value,
		gte: threshold.gte === false ? false : undefined,
	});
const formulaXml = (formula: string, name = 'formula') =>
	`<${name}>${escapeText(addFuturePrefixes(formula))}</${name}>`;
const quote = (text: string) => `"${text.replace(/"/g, '""')}"`;

/** The formula Excel stores alongside a text or blanks rule, anchored at `cell`. */
function textRuleFormula(rule: ConditionalRule, cell: string): string | undefined {
	switch (rule.type) {
		case 'containsText':
			return `NOT(ISERROR(SEARCH(${quote(rule.text)},${cell})))`;
		case 'notContainsText':
			return `ISERROR(SEARCH(${quote(rule.text)},${cell}))`;
		case 'beginsWith':
			return `LEFT(${cell},LEN(${quote(rule.text)}))=${quote(rule.text)}`;
		case 'endsWith':
			return `RIGHT(${cell},LEN(${quote(rule.text)}))=${quote(rule.text)}`;
		case 'containsBlanks':
			return `LEN(TRIM(${cell}))=0`;
		case 'notContainsBlanks':
			return `LEN(TRIM(${cell}))>0`;
		case 'containsErrors':
			return `ISERROR(${cell})`;
		case 'notContainsErrors':
			return `NOT(ISERROR(${cell}))`;
		default:
			return undefined;
	}
}

const TEXT_OPERATORS: Record<string, string> = {
	containsText: 'containsText',
	notContainsText: 'notContains',
	beginsWith: 'beginsWith',
	endsWith: 'endsWith',
};

function ruleXml(rule: ConditionalRule, styles: StyleWriter, anchor: string): string {
	const base = { type: rule.type, priority: rule.priority };
	// `stopIfTrue` is written for every rule type that carries it, after `dxfId` as Excel does.
	const stop = { stopIfTrue: rule.stopIfTrue || undefined };
	switch (rule.type) {
		case 'cellIs':
			return el(
				'cfRule',
				{
					...base,
					dxfId: styles.dxfId(rule.style),
					...stop,
					operator: rule.operator,
				},
				rule.formulas.map((f) => formulaXml(f)).join(''),
			);
		case 'expression':
			return el(
				'cfRule',
				{ ...base, dxfId: styles.dxfId(rule.style), ...stop },
				formulaXml(rule.formula),
			);
		case 'colorScale':
			return el(
				'cfRule',
				{ ...base, ...stop },
				`<colorScale>${rule.thresholds.map(cfvoXml).join('')}${rule.colors.map((c) => colorXml(c)).join('')}</colorScale>`,
			);
		case 'dataBar': {
			const ext = rule.extensionId
				? `<extLst><ext uri="{B025F937-C7B1-47D3-B67F-A62EFF666E3E}" xmlns:x14="${NS.x14}"><x14:id>${escapeText(rule.extensionId)}</x14:id></ext></extLst>`
				: '';
			const bar = el(
				'dataBar',
				{
					showValue: rule.showValue === false ? false : undefined,
					...dataBarBaseLengths(rule),
				},
				cfvoXml(rule.min) + cfvoXml(rule.max) + colorXml(rule.color),
			);
			return el('cfRule', { ...base, ...stop }, bar + ext);
		}
		case 'iconSet':
			return el(
				'cfRule',
				{ ...base, ...stop },
				el(
					'iconSet',
					{
						iconSet: rule.iconSet,
						showValue: rule.showValue === false ? false : undefined,
						reverse: rule.reverse || undefined,
					},
					rule.thresholds.map(cfvoXml).join(''),
				),
			);
		case 'top10':
			return el('cfRule', {
				...base,
				dxfId: styles.dxfId(rule.style),
				...stop,
				percent: rule.percent || undefined,
				bottom: rule.bottom || undefined,
				rank: rule.rank,
			});
		case 'aboveAverage':
			return el('cfRule', {
				...base,
				dxfId: styles.dxfId(rule.style),
				...stop,
				aboveAverage: rule.below ? false : undefined,
				equalAverage: rule.equalAverage || undefined,
			});
		case 'duplicateValues':
		case 'uniqueValues':
			return el('cfRule', { ...base, dxfId: styles.dxfId(rule.style), ...stop });
		case 'timePeriod':
			return el(
				'cfRule',
				{
					...base,
					dxfId: styles.dxfId(rule.style),
					...stop,
					timePeriod: rule.timePeriod,
				},
				formulaXml(timePeriodFormula(rule.timePeriod, anchor)),
			);
		default: {
			const formula = textRuleFormula(rule, anchor);
			const text = 'text' in rule ? rule.text : undefined;
			return el(
				'cfRule',
				{
					...base,
					dxfId: styles.dxfId(rule.style),
					...stop,
					operator: TEXT_OPERATORS[rule.type],
					text,
				},
				formula ? formulaXml(formula) : '',
			);
		}
	}
}

export function conditionalFormatsXml(
	formats: readonly ConditionalFormat[],
	styles: StyleWriter,
): string {
	return formats
		.filter((format) => format.ranges.length && format.rules.length)
		.map((format) => {
			const first = format.ranges[0];
			const anchor = first ? formatAddress(first.start) : 'A1';
			const rules = format.rules.map((rule) => ruleXml(rule, styles, anchor)).join('');
			return `<conditionalFormatting sqref="${format.ranges.map((r) => formatRange(r)).join(' ')}">${rules}</conditionalFormatting>`;
		})
		.join('');
}

export function dataValidationsXml(validations: readonly DataValidation[]): string {
	const items = validations
		.filter((dv) => dv.ranges.length)
		.map((dv) => {
			const hideDropDown = dv.showDropDown === false ? true : undefined;
			const values = attrs({
				type: dv.type === 'none' ? undefined : dv.type,
				errorStyle: dv.errorStyle,
				operator: dv.operator,
				allowBlank: dv.allowBlank || undefined,
				showDropDown: hideDropDown,
				showInputMessage: dv.showInputMessage || undefined,
				showErrorMessage: dv.showErrorMessage || undefined,
				errorTitle: dv.errorTitle,
				error: dv.error,
				promptTitle: dv.promptTitle,
				prompt: dv.prompt,
				sqref: dv.ranges.map((r) => formatRange(r)).join(' '),
			});
			const formulas =
				(dv.formula1 !== undefined ? formulaXml(dv.formula1, 'formula1') : '') +
				(dv.formula2 !== undefined ? formulaXml(dv.formula2, 'formula2') : '');
			return formulas
				? `<dataValidation${values}>${formulas}</dataValidation>`
				: `<dataValidation${values}/>`;
		});
	return items.length
		? `<dataValidations count="${items.length}">${items.join('')}</dataValidations>`
		: '';
}
