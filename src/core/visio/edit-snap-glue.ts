import { children } from './sheet';
import { fail } from './package-common';
import {
	VISIO_GLUE_MASK,
	VISIO_SNAP_GLUE_DEFAULTS,
	VISIO_SNAP_MASK,
	readVisioSnapGlue,
	validGlueSettings,
	validSnapSettings,
	type VisioSnapGlue,
} from './snap-glue';

/**
 * View > Visual Aids > Snap & Glue: the drawing's DocumentSettings. Every field is optional;
 * only the given settings change, and only when they differ from the drawing's.
 */
export interface VisioSnapGlueEdit extends Partial<VisioSnapGlue> {
	type: 'set-snap-glue';
}

/** Copy and validate a Snap & Glue command. */
export function snapshotSnapGlueEdit(edit: VisioSnapGlueEdit): VisioSnapGlueEdit {
	const result: VisioSnapGlueEdit = { type: 'set-snap-glue' };
	if (edit.snapSettings !== undefined) {
		if (!validSnapSettings(edit.snapSettings)) fail('INVALID_EDIT', 'Invalid snap settings.');
		result.snapSettings = edit.snapSettings;
	}
	if (edit.glueSettings !== undefined) {
		if (!validGlueSettings(edit.glueSettings)) fail('INVALID_EDIT', 'Invalid glue settings.');
		result.glueSettings = edit.glueSettings;
	}
	if (edit.dynamicGrid !== undefined) {
		if (typeof edit.dynamicGrid !== 'boolean')
			fail('INVALID_EDIT', 'Dynamic grid must be boolean.');
		result.dynamicGrid = edit.dynamicGrid;
	}
	if (Object.keys(result).length === 1) fail('INVALID_EDIT', 'Snap & Glue changes nothing.');
	return result;
}

/** DocumentSettings children in the order Visio writes them. */
const ORDER = [
	'GlueSettings',
	'SnapSettings',
	'SnapExtensions',
	'SnapAngles',
	'DynamicGridEnabled',
	'ProtectStyles',
	'ProtectShapes',
	'ProtectMasters',
	'ProtectBkgnds',
	'CustomMenusFile',
	'CustomToolbarsFile',
	'AttachedToolbars',
];

function write(settings: Element, name: string, value: number): void {
	let node = children(settings, name)[0];
	if (!node) {
		node = settings.ownerDocument!.createElementNS(settings.namespaceURI, name);
		const later = new Set(ORDER.slice(ORDER.indexOf(name) + 1));
		const before = Array.from(settings.childNodes).find(
			(child) => child.nodeType === 1 && later.has((child as Element).localName),
		);
		settings.insertBefore(node, before ?? null);
	}
	node.textContent = String(value);
}

/**
 * Write the changed settings into the VisioDocument root's DocumentSettings, keeping any bits
 * this model does not know. Returns whether anything changed.
 */
export function setVisioSnapGlue(document: Element, command: VisioSnapGlueEdit): boolean {
	const all = children(document, 'DocumentSettings');
	if (all.length !== 1)
		fail('EDIT_UNSUPPORTED_DOCUMENT', 'One DocumentSettings element is required.');
	const settings = all[0]!;
	const current = { ...VISIO_SNAP_GLUE_DEFAULTS, ...readVisioSnapGlue(document) };
	let changed = false;
	for (const [key, name, mask] of [
		['snapSettings', 'SnapSettings', VISIO_SNAP_MASK],
		['glueSettings', 'GlueSettings', VISIO_GLUE_MASK],
	] as const) {
		const value = command[key];
		if (value === undefined || value === current[key]) continue;
		const stored = Number(children(settings, name)[0]?.textContent?.trim() ?? 0);
		const unknown = Number.isSafeInteger(stored) && stored > 0 ? stored & ~mask : 0;
		write(settings, name, value | unknown);
		changed = true;
	}
	if (command.dynamicGrid !== undefined && command.dynamicGrid !== current.dynamicGrid) {
		write(settings, 'DynamicGridEnabled', command.dynamicGrid ? 1 : 0);
		changed = true;
	}
	return changed;
}
