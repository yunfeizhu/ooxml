import { fail } from './package-common';
import { snapshotPageLayoutEdit, type VisioPageLayoutEdit } from './edit-page-layout';
import { snapshotSnapGlueEdit, type VisioSnapGlueEdit } from './edit-snap-glue';
import {
	VISIO_BACKGROUND_STYLES,
	VISIO_BORDER_STYLES,
	type VisioBackgroundStyle,
	type VisioBorderStyle,
} from './page-decoration';

/** DrawingScale display units the Page Setup dialog writes; values stay internal inches. */
export const VISIO_SCALE_UNITS = Object.freeze(['IN', 'FT', 'MM', 'CM', 'M'] as const);
export type VisioScaleUnit = (typeof VISIO_SCALE_UNITS)[number];

/**
 * Design > Page Setup cells of one page. Every field is optional; only the given cells change.
 * `scale` keeps the physical page size: PageWidth and PageHeight are rewritten in the new scale.
 */
export interface VisioPageSetupEdit {
	type: 'set-page-setup';
	pageId: string;
	/** PrintPageOrientation of the printer paper. */
	printOrientation?: 'portrait' | 'landscape';
	/** PaperKind: a Windows DMPAPER paper code. */
	paperKind?: number;
	/** DrawingResizeType: on (1) grows the page as shapes leave it; off (2) keeps it fixed. */
	autoSize?: boolean;
	/** `page` inches on paper equal `drawing` inches in the drawing (1 in = 1 ft is 1 and 12). */
	scale?: { page: number; drawing: number; unit?: VisioScaleUnit };
}
/** Page Properties: foreground/background type and the assigned background page (BackPage). */
export interface VisioPagePropertiesEdit {
	type: 'set-page-properties';
	pageId: string;
	background?: boolean;
	/** A background page ID, or null for no background. */
	backPageId?: string | null;
}
/**
 * Design > Backgrounds and Borders & Titles: decoration shapes on the page's Visio-managed
 * background page (`VBackground-n`), created with `backgroundPageId` when the page has none.
 * A null style removes that decoration; an empty background page is then deleted.
 */
export type VisioPageDecorationEdit = {
	type: 'set-page-decoration';
	pageId: string;
	backgroundPageId?: string;
} & (
	| { kind: 'background'; style: VisioBackgroundStyle | null; color?: string }
	| { kind: 'border'; style: VisioBorderStyle | null; title?: string }
);
export type VisioPageSetupEdits =
	| VisioPageSetupEdit
	| VisioPagePropertiesEdit
	| VisioPageDecorationEdit
	| VisioPageLayoutEdit
	| VisioSnapGlueEdit;

export const isVisioPageSetupEdit = (edit: { type: string }): edit is VisioPageSetupEdits =>
	edit.type === 'set-page-setup' ||
	edit.type === 'set-page-properties' ||
	edit.type === 'set-page-decoration' ||
	edit.type === 'set-page-layout' ||
	edit.type === 'set-snap-glue';

const pageId = (value: unknown, label: string): string => {
	if (typeof value !== 'string' || !value || value.length > 256)
		fail('INVALID_EDIT', `Invalid ${label}.`);
	return value;
};
const newPageId = (value: unknown): string => {
	if (typeof value !== 'string' || !/^(0|[1-9]\d{0,9})$/.test(value) || Number(value) > 0xffffffff)
		fail('INVALID_EDIT', 'A new background page ID must be a canonical unsigned integer.');
	return value;
};
const positive = (value: unknown): number => {
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1e6)
		fail('INVALID_EDIT', 'Drawing scale values must be positive finite inches.');
	return value;
};

/** Copy and validate a page setup command; source admission remains authoritative. */
export function snapshotPageSetupEdit(edit: VisioPageSetupEdits): VisioPageSetupEdits {
	if (edit.type === 'set-page-layout') return snapshotPageLayoutEdit(edit);
	if (edit.type === 'set-snap-glue') return snapshotSnapGlueEdit(edit);
	const id = pageId(edit.pageId, 'page');
	if (edit.type === 'set-page-setup') {
		const result: VisioPageSetupEdit = { type: edit.type, pageId: id };
		if (edit.printOrientation !== undefined) {
			if (edit.printOrientation !== 'portrait' && edit.printOrientation !== 'landscape')
				fail('INVALID_EDIT', 'Print orientation must be portrait or landscape.');
			result.printOrientation = edit.printOrientation;
		}
		if (edit.paperKind !== undefined) {
			if (!Number.isSafeInteger(edit.paperKind) || edit.paperKind < 1 || edit.paperKind > 0xffff)
				fail('INVALID_EDIT', 'Paper kind must be a positive DMPAPER code.');
			result.paperKind = edit.paperKind;
		}
		if (edit.autoSize !== undefined) {
			if (typeof edit.autoSize !== 'boolean') fail('INVALID_EDIT', 'Auto Size must be boolean.');
			result.autoSize = edit.autoSize;
		}
		if (edit.scale !== undefined) {
			if (!edit.scale || typeof edit.scale !== 'object')
				fail('INVALID_EDIT', 'Invalid drawing scale.');
			const unit = edit.scale.unit;
			if (unit !== undefined && !VISIO_SCALE_UNITS.includes(unit))
				fail('INVALID_EDIT', 'Unsupported drawing scale unit.');
			result.scale = {
				page: positive(edit.scale.page),
				drawing: positive(edit.scale.drawing),
				...(unit === undefined ? {} : { unit }),
			};
		}
		if (Object.keys(result).length === 2) fail('INVALID_EDIT', 'Page setup changes nothing.');
		return result;
	}
	if (edit.type === 'set-page-properties') {
		const result: VisioPagePropertiesEdit = { type: edit.type, pageId: id };
		if (edit.background !== undefined) {
			if (typeof edit.background !== 'boolean') fail('INVALID_EDIT', 'Page type must be boolean.');
			result.background = edit.background;
		}
		if (edit.backPageId !== undefined)
			result.backPageId =
				edit.backPageId === null ? null : pageId(edit.backPageId, 'background page');
		if (Object.keys(result).length === 2) fail('INVALID_EDIT', 'Page properties change nothing.');
		return result;
	}
	if (edit.type !== 'set-page-decoration') return fail('INVALID_EDIT', 'Unsupported page edit.');
	const background =
		edit.backgroundPageId === undefined
			? {}
			: { backgroundPageId: newPageId(edit.backgroundPageId) };
	if (edit.kind === 'background') {
		if (edit.style !== null && !VISIO_BACKGROUND_STYLES.some((style) => style.id === edit.style))
			fail('INVALID_EDIT', 'Unknown background style.');
		if (edit.color !== undefined && !/^#[0-9a-f]{6}$/i.test(edit.color))
			fail('INVALID_EDIT', 'Background color must be #RRGGBB.');
		return {
			type: edit.type,
			pageId: id,
			...background,
			kind: 'background',
			style: edit.style,
			...(edit.color === undefined ? {} : { color: edit.color.toUpperCase() }),
		};
	}
	if (edit.kind !== 'border') return fail('INVALID_EDIT', 'Unknown page decoration.');
	if (edit.style !== null && !VISIO_BORDER_STYLES.some((style) => style.id === edit.style))
		fail('INVALID_EDIT', 'Unknown border style.');
	if (
		edit.title !== undefined &&
		(typeof edit.title !== 'string' ||
			edit.title.length > 255 ||
			/[\u0000-\u001f￾￿]/u.test(edit.title))
	)
		fail('INVALID_EDIT', 'Invalid title text.');
	return {
		type: edit.type,
		pageId: id,
		...background,
		kind: 'border',
		style: edit.style,
		...(edit.title === undefined ? {} : { title: edit.title }),
	};
}
