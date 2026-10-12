import { BASIC_STENCIL_ID, STENCILS, findMaster, type Master } from './stencil-catalog';

/** Per-viewer Shapes window preferences: opened stencils and each stencil's Quick Shapes. */
export const SHAPES_STORAGE_KEY = 'ooxml-ui.visio.shapes';
export interface SavedShapes {
	open: string[];
	quick: Record<string, string[]>;
}
function storage(doc: Document): Storage | undefined {
	try {
		return doc.defaultView?.localStorage ?? undefined;
	} catch {
		return undefined;
	}
}
export function loadShapes(doc: Document): SavedShapes {
	const saved: SavedShapes = { open: [], quick: {} };
	try {
		const raw = storage(doc)?.getItem(SHAPES_STORAGE_KEY);
		const value = raw ? (JSON.parse(raw) as Partial<SavedShapes>) : {};
		const known = new Set(STENCILS.map((stencil) => stencil.id));
		if (Array.isArray(value.open))
			saved.open = value.open.filter(
				(id): id is string => typeof id === 'string' && known.has(id) && id !== BASIC_STENCIL_ID,
			);
		for (const [stencil, ids] of Object.entries(value.quick ?? {}))
			if (known.has(stencil) && Array.isArray(ids))
				saved.quick[stencil] = ids.filter(
					(id): id is string => typeof id === 'string' && findMaster(id)?.stencil.id === stencil,
				);
	} catch {
		// Blocked or corrupt storage: start from Visio's defaults.
	}
	return saved;
}
export function saveShapes(doc: Document, saved: SavedShapes): void {
	try {
		storage(doc)?.setItem(SHAPES_STORAGE_KEY, JSON.stringify(saved));
	} catch {
		// Preferences are a convenience; the window works without them.
	}
}

/** Visio shows a stencil's first masters as its Quick Shapes until the user changes them. */
const DEFAULT_QUICK = 4;

/**
 * The Quick Shapes of the current stencil, for the AutoConnect mini toolbar: the stencil the user
 * opened last, else the first one the drawing docks (`docked`), else Basic Shapes. Reads the
 * saved preferences, so it follows the Shapes window.
 */
export function currentQuickShapes(
	doc: Document,
	docked: readonly string[] = [],
	limit = DEFAULT_QUICK,
): Master[] {
	const saved = loadShapes(doc);
	const id = saved.open.at(-1) ?? docked[0] ?? BASIC_STENCIL_ID;
	const stencil = STENCILS.find((candidate) => candidate.id === id) ?? STENCILS[0]!;
	const ids =
		saved.quick[stencil.id] ?? stencil.masters.slice(0, DEFAULT_QUICK).map((master) => master.id);
	const masters = ids.flatMap((master) => findMaster(master)?.master ?? []);
	// A stencil whose Quick Shapes were all removed still offers its first masters.
	return (masters.length ? masters : [...stencil.masters]).slice(0, limit);
}
