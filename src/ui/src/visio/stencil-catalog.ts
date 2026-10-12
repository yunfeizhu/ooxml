import {
	VISIO_BASIC_STENCIL,
	VISIO_STENCILS,
	visioBuiltInMaster,
	visioOutlineShape,
	type VisioBasicOutline,
	type VisioOutlineShape,
} from 'ooxml-core/visio';

export interface Master {
	id: string;
	name: string;
	/** Preview outline in a 24x24 box (static application geometry). */
	path: string;
	/** Default size in inches when dropped. */
	size: { width: number; height: number };
	/** A drawn preview that replaces `path` (a master of the drawing's own stencil). */
	draw?: () => SVGElement | undefined;
	/** Why the master cannot be dropped; it is listed disabled with this reason. */
	unsupported?: string;
}
export interface Stencil {
	id: string;
	name: string;
	masters: readonly Master[];
}
/** How the core creates a master: a native ellipse, or a core outline. */
export type MasterCreation = { kind: 'ellipse' } | { kind: 'rectangle'; shape: VisioOutlineShape };

/** Preview outlines of Visio's Basic Shapes, in a 24x24 box; names and sizes come from the core. */
const BASIC_PATHS: Readonly<Record<string, string>> = {
	rectangle: 'M3 6h18v12H3Z',
	square: 'M5 4h14v14H5Z',
	ellipse: 'M2 12a10 6.5 0 1 0 20 0 10 6.5 0 1 0-20 0',
	circle: 'M4 12a8 8 0 1 0 16 0 8 8 0 1 0-16 0',
	triangle: 'M12 4 21 20H3Z',
	'right-triangle': 'M4 4v16h16Z',
	pentagon: 'M12 3l9 6.5-3.4 10.5H6.4L3 9.5Z',
	hexagon: 'M7 4h10l5 8-5 8H7l-5-8Z',
	octagon: 'M8.5 3h7L21 8.5v7L15.5 21h-7L3 15.5v-7Z',
	star: 'm12 2.5 2.8 6.4 6.9.6-5.2 4.6 1.6 6.8L12 17.3l-6.1 3.6 1.6-6.8-5.2-4.6 6.9-.6Z',
	diamond: 'M12 2.5 21.5 12 12 21.5 2.5 12Z',
	'rounded-rectangle': 'M6 6h12a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3Z',
	cross: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z',
	parallelogram: 'M7 6h15l-5 12H2Z',
	trapezoid: 'M7 6h10l5 12H2Z',
	can: 'M5 6a7 2.5 0 1 0 14 0 7 2.5 0 1 0-14 0v12a7 2.5 0 0 0 14 0V6',
	cube: 'M4 8h12v12H4ZM4 8l4-4h12l-4 4M20 4v12l-4 4',
	chevron: 'M3 5h13l5 7-5 7H3l5-7Z',
};
/** Visio's Basic Shapes stencil, in Visio's order. */
export const BASIC_SHAPES: readonly Master[] = VISIO_BASIC_STENCIL.masters.map((master) => ({
	id: master.id,
	name: master.name,
	path: BASIC_PATHS[master.id] ?? 'M4 6h16v12H4Z',
	size: master.size,
}));
export const BASIC_STENCIL_ID = 'basic';

const n = (value: number) => String(Math.round(value * 100) / 100);
/** A preview path for a core outline (or a native ellipse) drawn at its drop proportions. */
export function outlinePreviewPath(
	outline: VisioBasicOutline | 'ellipse',
	size: { width: number; height: number },
): string {
	const scale = 20 / Math.max(size.width, size.height);
	const w = size.width * scale,
		h = size.height * scale;
	const left = 12 - w / 2,
		top = 12 - h / 2;
	if (outline === 'ellipse')
		return `M${n(left)} 12a${n(w / 2)} ${n(h / 2)} 0 1 0 ${n(w)} 0a${n(w / 2)} ${n(h / 2)} 0 1 0 ${n(-w)} 0`;
	if (outline.rounding && outline.paths.length === 1 && outline.paths[0]!.length === 4) {
		const r = outline.rounding * Math.min(w, h);
		return `M${n(left + r)} ${n(top)}h${n(w - 2 * r)}a${n(r)} ${n(r)} 0 0 1 ${n(r)} ${n(r)}v${n(h - 2 * r)}a${n(r)} ${n(r)} 0 0 1 ${n(-r)} ${n(r)}h${n(2 * r - w)}a${n(r)} ${n(r)} 0 0 1 ${n(-r)} ${n(-r)}v${n(2 * r - h)}a${n(r)} ${n(r)} 0 0 1 ${n(r)} ${n(-r)}Z`;
	}
	const point = ([x, y]: readonly [number, number]) => `${n(left + x * w)} ${n(top + (1 - y) * h)}`;
	return [
		...outline.paths.map((points) => `M${points.map(point).join('L')}Z`),
		...(outline.lines ?? []).map((points) => `M${points.map(point).join('L')}`),
	].join('');
}

/** Basic Shapes, then the built-in stencils More Shapes can open, with generated previews. */
export const STENCILS: readonly Stencil[] = [
	{ id: BASIC_STENCIL_ID, name: 'Basic Shapes', masters: BASIC_SHAPES },
	...VISIO_STENCILS.map((stencil) => ({
		id: stencil.id,
		name: stencil.name,
		masters: stencil.masters.map((master) => ({
			id: master.id,
			name: master.name,
			size: master.size,
			path: outlinePreviewPath(
				master.shape === 'ellipse' ? 'ellipse' : visioOutlineShape(master.shape),
				master.size,
			),
		})),
	})),
];

/** The master and its stencil for a master id, or nothing for an unknown id. */
export function findMaster(id: string): { stencil: Stencil; master: Master } | undefined {
	for (const stencil of STENCILS) {
		const master = stencil.masters.find((candidate) => candidate.id === id);
		if (master) return { stencil, master };
	}
	return undefined;
}

/** Default size and creation of a stencil master, or nothing for an unknown id. */
export function masterCreation(
	id: string,
): { size: { width: number; height: number }; create: MasterCreation } | undefined {
	const found = visioBuiltInMaster(id)?.master;
	if (!found) return undefined;
	return {
		size: found.size,
		create:
			found.shape === 'ellipse' ? { kind: 'ellipse' } : { kind: 'rectangle', shape: found.shape },
	};
}
