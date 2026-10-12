import { describe, expect, it } from 'vitest';
import {
	evaluateVisioTextField,
	formatVisioFieldValue,
	visioDateSerial,
	visioSerialDate,
	VISIO_FIELD_FORMATS,
} from './text-fields';

const date = new Date(Date.UTC(2026, 9, 9, 14, 5, 7));

describe('text field evaluation and formats', () => {
	it('formats date pictures from wall-clock components', () => {
		const value = { kind: 'date' as const, date };
		expect(formatVisioFieldValue(value, VISIO_FIELD_FORMATS.shortDate)).toBe('10/9/2026');
		expect(formatVisioFieldValue(value, VISIO_FIELD_FORMATS.longDate)).toBe(
			'Friday, October 9, 2026',
		);
		expect(formatVisioFieldValue(value, VISIO_FIELD_FORMATS.time)).toBe('2:05 PM');
		expect(formatVisioFieldValue(value, '{{yyyy-MM-dd HH:mm:ss}}')).toBe('2026-10-09 14:05:07');
		expect(formatVisioFieldValue(value, '0.00')).toBeUndefined();
		expect(visioSerialDate(visioDateSerial(date))?.getTime()).toBe(date.getTime());
	});

	it('formats numbers with units, grouping and optional decimals', () => {
		const length = { kind: 'number' as const, value: 1234.5, unit: 'length' as const };
		expect(formatVisioFieldValue(length, '0.00 u')).toBe('1234.50 in.');
		expect(formatVisioFieldValue(length, '#,##0')).toBe('1,235');
		expect(formatVisioFieldValue(length, '')).toBe('1234.5 in.');
		const angle = { kind: 'number' as const, value: Math.PI / 4, unit: 'angle' as const };
		expect(formatVisioFieldValue(angle, '0 u')).toBe('45 deg.');
		expect(formatVisioFieldValue({ kind: 'number', value: 2.5, unit: 'scalar' }, '0.##')).toBe(
			'2.5',
		);
		expect(formatVisioFieldValue({ kind: 'string', text: 'A' }, '@')).toBe('A');
		expect(formatVisioFieldValue(length, 'mystery')).toBeUndefined();
	});

	it('evaluates context functions and leaves unknown formulas to the cache', () => {
		const context = {
			pageName: 'Overview',
			pageNumber: 2,
			pageCount: 3,
			properties: { title: 'Plan', modified: '2025-01-02T03:04:05Z' },
			now: date,
		};
		expect(evaluateVisioTextField('PAGENAME()', context)).toEqual({
			kind: 'string',
			text: 'Overview',
		});
		expect(evaluateVisioTextField('PAGENUMBER()&""', context)).toBeUndefined();
		expect(evaluateVisioTextField('PAGECOUNT()', context)).toEqual({
			kind: 'number',
			value: 3,
			unit: 'scalar',
		});
		expect(evaluateVisioTextField('TITLE()', context)).toEqual({ kind: 'string', text: 'Plan' });
		expect(evaluateVisioTextField('SUBJECT()', context)).toBeUndefined();
		expect(evaluateVisioTextField('DOCLASTSAVE()', context)).toMatchObject({ kind: 'date' });
		expect(evaluateVisioTextField('NOW()', context)).toEqual({ kind: 'date', date });
		expect(evaluateVisioTextField('constructor()', context)).toBeUndefined();
		expect(evaluateVisioTextField('Width*2', context)).toBeUndefined();
	});
});
