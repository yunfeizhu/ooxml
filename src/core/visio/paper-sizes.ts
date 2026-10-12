import type { VisioPage } from './model';
/** A standard paper or drawing-page size in portrait inches. */
export interface VisioPaperSize {
	readonly id: string;
	readonly label: string;
	readonly width: number;
	readonly height: number;
	/** The Windows DMPAPER code Visio saves in PaperKind, when the size is a printer paper. */
	readonly paperKind?: number;
}
const mm = (value: number) => value / 25.4;
const size = (id: string, label: string, width: number, height: number, paperKind?: number) =>
	Object.freeze({ id, label, width, height, ...(paperKind === undefined ? {} : { paperKind }) });

/** The sizes Visio's Design > Size gallery and Print Setup offer, in portrait inches. */
export const VISIO_PAPER_SIZES: readonly VisioPaperSize[] = Object.freeze([
	size('letter', 'Letter', 8.5, 11, 1),
	size('tabloid', 'Tabloid', 11, 17, 3),
	size('legal', 'Legal', 8.5, 14, 5),
	size('statement', 'Statement', 5.5, 8.5, 6),
	size('executive', 'Executive', 7.25, 10.5, 7),
	size('a3', 'A3', mm(297), mm(420), 8),
	size('a4', 'A4', mm(210), mm(297), 9),
	size('a5', 'A5', mm(148), mm(210), 11),
	size('b4', 'B4 (JIS)', mm(257), mm(364), 12),
	size('b5', 'B5 (JIS)', mm(182), mm(257), 13),
	size('ansi-c', 'ANSI C', 17, 22, 24),
	size('ansi-d', 'ANSI D', 22, 34, 25),
	size('ansi-e', 'ANSI E', 34, 44, 26),
	size('arch-c', 'ARCH C', 18, 24),
	size('arch-d', 'ARCH D', 24, 36),
]);

/** The printer paper for a DMPAPER code, if this table knows it. */
export function visioPaperSize(paperKind: number): VisioPaperSize | undefined {
	return VISIO_PAPER_SIZES.find((item) => item.paperKind === paperKind);
}

/**
 * The printable tile of one printed sheet in physical page inches: the saved printer paper in
 * its print orientation, less the margins, at the print zoom. Undefined without a known paper.
 * PrintPageOrientation 0 (same as printer) follows the page's own orientation.
 */
export function visioPrintTile(
	page: Pick<VisioPage, 'width' | 'height' | 'pageSetup'>,
	paper = page.pageSetup?.paperKind === undefined
		? undefined
		: visioPaperSize(page.pageSetup.paperKind),
): { width: number; height: number } | undefined {
	if (!paper) return undefined;
	const setup = page.pageSetup;
	const landscape =
		setup?.printPageOrientation === 2 ||
		(setup?.printPageOrientation !== 1 && page.width > page.height);
	const short = Math.min(paper.width, paper.height),
		long = Math.max(paper.width, paper.height);
	const margins = setup?.margins ?? { left: 0, right: 0, top: 0, bottom: 0 };
	const zoom = setup?.printZoom ?? 1;
	const width = ((landscape ? long : short) - margins.left - margins.right) / zoom;
	const height = ((landscape ? short : long) - margins.top - margins.bottom) / zoom;
	return width > 0.01 && height > 0.01 ? { width, height } : undefined;
}
