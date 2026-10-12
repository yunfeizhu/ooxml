import { fail, safePath } from './package-common';

/** Source fragments only. No ZIP, package images, or unrelated page content is included. */
export interface VisioClipboardSnapshot {
	format: 'ooxml.visio-shapes';
	version: 1;
	sourcePageId: string;
	/** Drawing-to-page ratio, matching VisioPage.drawingToPageScale. */
	sourceDrawingScale: number;
	selectionIds: readonly string[];
	shapes: readonly { shapeId: string; xml: string }[];
	resources: readonly { path: string; xml: string }[];
	pageContext: string;
	/**
	 * The masters captured stencil shapes are instances of: the master ID in the source drawing and
	 * what identifies the master itself. A paste needs the same master under the same ID.
	 */
	masters?: readonly { id: string; identity: string }[];
}
export const VISIO_CLIPBOARD_MAGIC = 'OOXML-VISIO-SHAPES/1\n';
export const VISIO_CLIPBOARD_MAX_CHARS = 8 * 1024 * 1024;
export function clipboardId(value: unknown): string {
	if (typeof value !== 'string' || !/^(0|[1-9]\d{0,9})$/.test(value) || Number(value) > 0xffffffff)
		fail('INVALID_CLIPBOARD', 'Clipboard IDs require canonical unsigned integers.');
	return value;
}
/** Own each field before asynchronous work and strip arbitrary host properties. */
export function snapshotVisioClipboard(value: VisioClipboardSnapshot): VisioClipboardSnapshot {
	if (
		!value ||
		typeof value !== 'object' ||
		value.format !== 'ooxml.visio-shapes' ||
		value.version !== 1
	)
		fail('INVALID_CLIPBOARD', 'Unsupported Visio clipboard format or version.');
	const sourcePageId = clipboardId(value.sourcePageId),
		sourceDrawingScale = value.sourceDrawingScale;
	if (!Number.isFinite(sourceDrawingScale) || sourceDrawingScale <= 0 || sourceDrawingScale > 1e6)
		fail('INVALID_CLIPBOARD', 'Invalid clipboard drawing ratio.');
	let characters = 0;
	const text = (input: unknown): string => {
		if (typeof input !== 'string' || (characters += input.length) > VISIO_CLIPBOARD_MAX_CHARS)
			fail('LIMIT_CLIPBOARD', 'Clipboard XML exceeds bounded text limits.');
		if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(input))
			fail('INVALID_CLIPBOARD', 'Clipboard XML must contain well-formed Unicode.');
		return input;
	};
	const list = <T>(input: readonly T[], max: number): readonly T[] => {
		if (!Array.isArray(input) || !input.length || input.length > max)
			fail('INVALID_CLIPBOARD', 'Invalid clipboard array length.');
		return input;
	};
	const selectionIds = list(value.selectionIds, 1000).map(clipboardId);
	const shapes = list(value.shapes, 1000).map((shape) => {
		if (!shape || typeof shape !== 'object') fail('INVALID_CLIPBOARD', 'Invalid captured shape.');
		return { shapeId: clipboardId(shape.shapeId), xml: text(shape.xml) };
	});
	const resources = list(value.resources, 64).map((resource) => {
		const path = resource?.path;
		if (
			!resource ||
			typeof resource !== 'object' ||
			typeof path !== 'string' ||
			path.length > 1024 ||
			!/^visio\/(?:document\.xml|_rels\/document\.xml\.rels|theme\/[^/]+\.(?:xml|rels)|theme\/_rels\/[^/]+\.rels)$/.test(
				path,
			)
		)
			fail('INVALID_CLIPBOARD', 'Invalid clipboard resource path.');
		return { path: text(safePath(path)), xml: text(resource.xml) };
	});
	if (
		new Set(selectionIds).size !== selectionIds.length ||
		new Set(shapes.map((shape) => shape.shapeId)).size !== shapes.length ||
		selectionIds.length !== shapes.length ||
		selectionIds.some((id) => !shapes.some((shape) => shape.shapeId === id)) ||
		new Set(resources.map((resource) => resource.path)).size !== resources.length
	)
		fail('INVALID_CLIPBOARD', 'Clipboard mappings and resources must be unique and complete.');
	const masters =
		value.masters === undefined
			? undefined
			: Array.isArray(value.masters) && value.masters.length <= 1000
				? value.masters.map((master) => {
						if (
							!master ||
							typeof master !== 'object' ||
							typeof master.identity !== 'string' ||
							master.identity.length > 4096
						)
							fail('INVALID_CLIPBOARD', 'Invalid clipboard master.');
						return { id: clipboardId(master.id), identity: text(master.identity) };
					})
				: fail('INVALID_CLIPBOARD', 'Invalid clipboard masters.');
	if (masters && new Set(masters.map((master) => master.id)).size !== masters.length)
		fail('INVALID_CLIPBOARD', 'Clipboard masters must be unique.');
	return {
		...(masters?.length ? { masters } : {}),
		format: 'ooxml.visio-shapes',
		version: 1,
		sourcePageId,
		sourceDrawingScale,
		selectionIds,
		shapes,
		resources: resources.sort((a, b) => a.path.localeCompare(b.path)),
		pageContext: text(value.pageContext),
	};
}
export function serializeVisioClipboard(value: VisioClipboardSnapshot): string {
	const text = VISIO_CLIPBOARD_MAGIC + JSON.stringify(snapshotVisioClipboard(value));
	if (text.length > VISIO_CLIPBOARD_MAX_CHARS)
		fail('LIMIT_CLIPBOARD', 'Serialized clipboard exceeds text limits.');
	return text;
}
export function deserializeVisioClipboard(text: string): VisioClipboardSnapshot {
	if (
		typeof text !== 'string' ||
		text.length > VISIO_CLIPBOARD_MAX_CHARS ||
		!text.startsWith(VISIO_CLIPBOARD_MAGIC)
	)
		fail('INVALID_CLIPBOARD', 'Expected bounded OOXML Visio clipboard text.');
	try {
		return snapshotVisioClipboard(
			JSON.parse(text.slice(VISIO_CLIPBOARD_MAGIC.length)) as VisioClipboardSnapshot,
		);
	} catch (error) {
		if (error instanceof SyntaxError) fail('INVALID_CLIPBOARD', 'Malformed clipboard JSON.');
		throw error;
	}
}
