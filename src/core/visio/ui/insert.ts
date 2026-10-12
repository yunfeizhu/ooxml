import type { VisioDocument, VisioPage, VisioShape } from '../model';
import type { VisioPictureInsertEdit } from '../edit-metadata-commands';
import type { VisioRasterImageInfo } from '../media';
import { visioNextShapeId } from './shape-id';

/** Pixels per inch used for a picture's natural size (Visio's default for untagged images). */
export const VISIO_PICTURE_DPI = 96;

/**
 * Centre a picture on the page at its natural size, scaled down (aspect kept) to fit within
 * 80% of the page. Returns the edit in drawing inches, as the edit API expects.
 */
export function visioPictureInsertCommand(
	page: VisioPage,
	info: Pick<VisioRasterImageInfo, 'pixelWidth' | 'pixelHeight'>,
	image: Uint8Array,
): VisioPictureInsertEdit {
	const ratio = page.drawingToPageScale ?? 1;
	if (!(ratio > 0) || !Number.isFinite(ratio) || !(page.width > 0) || !(page.height > 0))
		throw new Error('The page size or drawing scale is unusable for inserting a picture.');
	if (!(info.pixelWidth > 0) || !(info.pixelHeight > 0))
		throw new Error('The picture has no usable pixel size.');
	const width = info.pixelWidth / VISIO_PICTURE_DPI,
		height = info.pixelHeight / VISIO_PICTURE_DPI;
	const scale = Math.min(1, (page.width * 0.8) / width, (page.height * 0.8) / height);
	return {
		type: 'insert-picture',
		pageId: page.id,
		shapeId: visioNextShapeId(page),
		x: page.width / 2 / ratio,
		y: page.height / 2 / ratio,
		width: (width * scale) / ratio,
		height: (height * scale) / ratio,
		image,
	};
}

/**
 * Normalise a typed link address the way Visio's dialog accepts it: a bare host gets https://,
 * a bare e-mail address gets mailto:. Anything else is kept verbatim (the reader decides safety).
 */
export function normalizeVisioHyperlinkAddress(value: string): string {
	const address = value.trim();
	if (!address || /^[a-z][a-z\d+.-]*:/i.test(address) || /\s/.test(address)) return address;
	if (isEmailAddress(address)) return `mailto:${address}`;
	const host = /^([^/?#:]+)/.exec(address)?.[1] ?? '';
	if (
		/^www\./i.test(host) ||
		/^[a-z\d-]+(?:\.[a-z\d-]+)*\.(?:com|org|net|edu|gov|io|dev|app|info|co|uk|de|nl|za|eu)$/i.test(
			host,
		)
	)
		return `https://${address}`;
	return address;
}

/** `local@domain.tld`: one @, no slash, and a dot inside the domain (split, not a backtracking regex). */
function isEmailAddress(address: string): boolean {
	const [local, domain, ...rest] = address.split('@');
	if (rest.length || !local || !domain || address.includes('/')) return false;
	const dot = domain.indexOf('.', 1);
	return dot > 0 && dot < domain.length - 1;
}

/** Where following a shape's link goes: a safe external URL or a page of this drawing. */
export type VisioFollowTarget =
	| { kind: 'external'; href: string }
	| { kind: 'page'; index: number };

/** Visio follows the default link, else the first visible one. Unresolved links do nothing. */
export function visioFollowTarget(
	document: VisioDocument,
	shape: VisioShape,
): VisioFollowTarget | undefined {
	const links = (shape.hyperlinks ?? []).filter((link) => !link.invisible);
	const link = links.find((item) => item.default) ?? links[0];
	if (!link) return undefined;
	if (link.target.kind === 'external') return { kind: 'external', href: link.target.href };
	if (link.target.kind !== 'internal') return undefined;
	const name = link.target.subAddress.split('/')[0]!.trim().toLowerCase();
	const index = document.pages.findIndex((page) => page.name.toLowerCase() === name);
	return index < 0 ? undefined : { kind: 'page', index };
}
