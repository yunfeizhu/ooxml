import { VISIO_FIELD_FORMATS as F } from '../text-fields';

export type VisioFieldCategory = 'date' | 'document' | 'page' | 'geometry' | 'custom';
export interface VisioFieldChoice {
	label: string;
	formula: string;
}
export interface VisioFieldCategorySpec {
	id: VisioFieldCategory;
	label: string;
	fields: readonly VisioFieldChoice[];
	formats: readonly { label: string; format: string }[];
}
const dateFormats = [
	{ label: 'Short date (10/9/2026)', format: F.shortDate },
	{ label: 'Long date (Friday, October 9, 2026)', format: F.longDate },
	{ label: 'Time (2:05 PM)', format: F.time },
	{ label: 'Date and time', format: F.dateTime },
];
const numberFormats = [
	{ label: 'General', format: '' },
	{ label: 'Whole number (2)', format: F.integer },
	{ label: 'Two decimals (2.00)', format: F.decimal },
];
const unitFormats = [
	{ label: 'Two decimals with units (2.00 in.)', format: F.decimalUnits },
	{ label: 'Whole number with units (2 in.)', format: F.integerUnits },
	{ label: 'Two decimals (2.00)', format: F.decimal },
];

/** Visio's Field dialog categories with the formulas and formats this editor evaluates. */
export const VISIO_FIELD_CATEGORIES: readonly VisioFieldCategorySpec[] = [
	{
		id: 'date',
		label: 'Date/Time',
		fields: [
			{ label: 'Current date/time', formula: 'NOW()' },
			{ label: 'Creation date/time', formula: 'DOCCREATION()' },
			{ label: 'Last saved date/time', formula: 'DOCLASTSAVE()' },
			{ label: 'Last edit date/time', formula: 'DOCLASTEDIT()' },
			{ label: 'Print date/time', formula: 'DOCLASTPRINT()' },
		],
		formats: dateFormats,
	},
	{
		id: 'document',
		label: 'Document Info',
		fields: [
			{ label: 'Title', formula: 'TITLE()' },
			{ label: 'Author', formula: 'CREATOR()' },
			{ label: 'Subject', formula: 'SUBJECT()' },
			{ label: 'Manager', formula: 'MANAGER()' },
			{ label: 'Company', formula: 'COMPANY()' },
			{ label: 'Category', formula: 'CATEGORY()' },
			{ label: 'Keywords', formula: 'KEYWORDS()' },
			{ label: 'Description', formula: 'DESCRIPTION()' },
		],
		formats: [{ label: 'Text', format: F.text }],
	},
	{
		id: 'page',
		label: 'Page Info',
		fields: [
			{ label: 'Page name', formula: 'PAGENAME()' },
			{ label: 'Page number', formula: 'PAGENUMBER()' },
			{ label: 'Number of pages', formula: 'PAGECOUNT()' },
		],
		formats: [{ label: 'General', format: '' }],
	},
	{
		id: 'geometry',
		label: 'Geometry',
		fields: [
			{ label: 'Width', formula: 'Width' },
			{ label: 'Height', formula: 'Height' },
			{ label: 'Angle', formula: 'Angle' },
		],
		formats: unitFormats,
	},
	{ id: 'custom', label: 'Custom formula', fields: [], formats: numberFormats },
];
