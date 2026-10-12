import { attribute, children } from './sheet';

/** Bits of DocumentSettings/SnapSettings (Visio's VisSnapSettings). */
export const VISIO_SNAP = Object.freeze({
	rulerSubdivisions: 1,
	grid: 2,
	guides: 4,
	handles: 8,
	vertices: 16,
	connectionPoints: 32,
	geometry: 256,
	alignmentBox: 512,
	extensions: 1024,
	disabled: 32768,
	intersections: 65536,
} as const);
/** Bits of DocumentSettings/GlueSettings (Visio's VisGlueSettings). */
export const VISIO_GLUE = Object.freeze({
	guides: 1,
	handles: 2,
	vertices: 4,
	connectionPoints: 8,
	geometry: 32,
	disabled: 32768,
} as const);
export const VISIO_SNAP_MASK = Object.values(VISIO_SNAP).reduce((sum, bit) => sum | bit, 0);
export const VISIO_GLUE_MASK = Object.values(VISIO_GLUE).reduce((sum, bit) => sum | bit, 0);

/** The Snap & Glue dialog's document settings. */
export interface VisioSnapGlue {
	/** A combination of `VISIO_SNAP` bits. */
	snapSettings: number;
	/** A combination of `VISIO_GLUE` bits. */
	glueSettings: number;
	/** DynamicGridEnabled: alignment and spacing feedback while dragging. */
	dynamicGrid: boolean;
}

/** A new drawing in Visio 16, as recorded through its object model. */
export const VISIO_SNAP_GLUE_DEFAULTS: Readonly<VisioSnapGlue> = Object.freeze({
	snapSettings: 65847,
	glueSettings: 9,
	dynamicGrid: true,
});

export const validSnapSettings = (value: unknown): value is number =>
	Number.isSafeInteger(value) &&
	(value as number) >= 0 &&
	((value as number) & ~VISIO_SNAP_MASK) === 0;
export const validGlueSettings = (value: unknown): value is number =>
	Number.isSafeInteger(value) &&
	(value as number) >= 0 &&
	((value as number) & ~VISIO_GLUE_MASK) === 0;

/** The text of a DocumentSettings child as a non-negative integer, when it is one. */
function setting(settings: Element | undefined, name: string): number | undefined {
	const node = settings && children(settings, name)[0];
	const text = node?.textContent?.trim() ?? attribute(node, 'V');
	if (!text || !/^\d{1,9}$/.test(text)) return undefined;
	return Number(text);
}

/**
 * The stored Snap & Glue settings of a VisioDocument root. Only the stored ones are returned;
 * `visioSnapGlue(document)` adds Visio's defaults. Unknown bits are kept out of the model (and
 * left alone in the file).
 */
export function readVisioSnapGlue(document: Element): Partial<VisioSnapGlue> | undefined {
	const settings = children(document, 'DocumentSettings')[0];
	const result: Partial<VisioSnapGlue> = {};
	const snap = setting(settings, 'SnapSettings');
	if (snap !== undefined) result.snapSettings = snap & VISIO_SNAP_MASK;
	const glue = setting(settings, 'GlueSettings');
	if (glue !== undefined) result.glueSettings = glue & VISIO_GLUE_MASK;
	const dynamic = setting(settings, 'DynamicGridEnabled');
	if (dynamic !== undefined) result.dynamicGrid = dynamic !== 0;
	return Object.keys(result).length ? result : undefined;
}

/** A drawing's effective Snap & Glue settings: what it stores over Visio's defaults. */
export function visioSnapGlue(document: { snapGlue?: Partial<VisioSnapGlue> }): VisioSnapGlue {
	return { ...VISIO_SNAP_GLUE_DEFAULTS, ...document.snapGlue };
}
