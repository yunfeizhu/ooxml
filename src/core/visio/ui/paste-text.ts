import type { VisioEdit } from '../edit-commands';
import type { VisioPage } from '../model';
import { visioNextShapeId } from './shape-id';

/** Longest clipboard text Paste Special turns into one text box. */
export const VISIO_PASTE_TEXT_LIMIT = 32_768;

/** Normalise clipboard text for a text box: LF line breaks, no other control characters. */
export function visioPasteTextValue(text: string): string {
	return text
		.replace(/\r\n?/g, '\n')
		.replace(/[\u0000-\u0008\u000b-\u001f\u007f￾￿]/g, '')
		.replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '�')
		.replace(/\s+$/, '');
}

/**
 * Home > Paste Special > Unformatted Text: one text box centred on the page, sized for 12 pt text
 * (about 0.09 in per character and 0.25 in per line) and kept within 80% of the page width.
 * Returns undefined for empty or over-long text. Coordinates are drawing inches.
 */
export function visioPasteTextCommand(page: VisioPage, text: string): VisioEdit | undefined {
	const value = visioPasteTextValue(text);
	if (!value.trim() || value.length > VISIO_PASTE_TEXT_LIMIT) return undefined;
	const ratio = page.drawingToPageScale ?? 1;
	if (!(ratio > 0) || !Number.isFinite(ratio) || !(page.width > 0) || !(page.height > 0))
		return undefined;
	const lines = value.split('\n');
	const longest = Math.max(...lines.map((line) => line.length));
	const width = Math.min(Math.max(1, longest * 0.09 + 0.2), Math.max(1, page.width * 0.8));
	const wrapped = lines.reduce(
		(sum, line) => sum + Math.max(1, Math.ceil((line.length * 0.09) / (width - 0.2))),
		0,
	);
	const height = Math.min(Math.max(0.35, wrapped * 0.25 + 0.1), Math.max(0.35, page.height * 0.8));
	return {
		type: 'create-text-box',
		pageId: page.id,
		shapeId: visioNextShapeId(page),
		x: page.width / 2 / ratio,
		y: page.height / 2 / ratio,
		width: width / ratio,
		height: height / ratio,
		text: value,
	};
}
