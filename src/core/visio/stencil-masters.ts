import { sha1 } from '../digest/index';
import { VISIO_STENCILS, type VisioStencil, type VisioStencilMaster } from './stencils';

const unit = { width: 1, height: 1 };
const wide = { width: 1, height: 0.75 };

/** Visio's Basic Shapes stencil, in Visio's order: names and drop sizes over the core outlines. */
export const VISIO_BASIC_STENCIL: VisioStencil = {
	id: 'basic',
	name: 'Basic Shapes',
	masters: [
		{ id: 'rectangle', name: 'Rectangle', shape: 'rectangle', size: wide },
		{ id: 'square', name: 'Square', shape: 'square', size: unit },
		{ id: 'ellipse', name: 'Ellipse', shape: 'ellipse', size: wide },
		{ id: 'circle', name: 'Circle', shape: 'ellipse', size: unit },
		{ id: 'triangle', name: 'Triangle', shape: 'triangle', size: unit },
		{ id: 'right-triangle', name: 'Right triangle', shape: 'right-triangle', size: unit },
		{ id: 'pentagon', name: 'Pentagon', shape: 'pentagon', size: unit },
		{ id: 'hexagon', name: 'Hexagon', shape: 'hexagon', size: wide },
		{ id: 'octagon', name: 'Octagon', shape: 'octagon', size: unit },
		{ id: 'star', name: '5-point star', shape: 'star', size: unit },
		{ id: 'diamond', name: 'Diamond', shape: 'diamond', size: unit },
		{ id: 'rounded-rectangle', name: 'Rounded rectangle', shape: 'rounded-rectangle', size: wide },
		{ id: 'cross', name: 'Cross', shape: 'cross', size: unit },
		{ id: 'parallelogram', name: 'Parallelogram', shape: 'parallelogram', size: wide },
		{ id: 'trapezoid', name: 'Trapezoid', shape: 'trapezoid', size: wide },
		{ id: 'can', name: 'Can', shape: 'can', size: { width: 0.75, height: 1 } },
		{ id: 'cube', name: 'Cube', shape: 'cube', size: unit },
		{ id: 'chevron', name: 'Chevron', shape: 'chevron', size: wide },
	],
};

/** Every built-in stencil whose masters can be added to a drawing, Basic Shapes first. */
export const VISIO_BUILT_IN_STENCILS: readonly VisioStencil[] = [
	VISIO_BASIC_STENCIL,
	...VISIO_STENCILS,
];

/** Layer a stencil's masters belong to, as Visio's flowchart masters sit on "Flowchart". */
const STENCIL_LAYERS: Readonly<Record<string, string>> = {
	'basic-flowchart': 'Flowchart',
	'misc-flowchart': 'Flowchart',
};

/** A built-in master as it is written into a drawing's document stencil. */
export interface VisioBuiltInMaster {
	master: VisioStencilMaster;
	stencil: VisioStencil;
	/** The layer its instances join, when the stencil has one. */
	layer?: string;
	/** Identifies this master in a drawing, so a second drop reuses the first copy. */
	uniqueId: string;
	/** The same for every copy of this master, whatever it was renamed to. */
	baseId: string;
}

/**
 * A stable GUID for `name`, in this package's own namespace (never one of Visio's stencils).
 * Visio rewrites the last two groups of a master's UniqueID to its own constant when it saves, so
 * `visioTail` writes that form from the start and the identity survives a save by Visio.
 */
function guid(name: string, visioTail = false): string {
	const hash = sha1(new TextEncoder().encode(`ooxml-core/visio/master:${name}`));
	const hex = Array.from(hash.slice(0, 16), (byte, index) => {
		// RFC 4122 name-based (version 5) layout.
		const value = index === 6 ? (byte & 0x0f) | 0x50 : index === 8 ? (byte & 0x3f) | 0x80 : byte;
		return value.toString(16).padStart(2, '0');
	})
		.join('')
		.toUpperCase();
	const head = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
	return visioTail
		? `{${head}-8E40-00608CF305B2}`
		: `{${head}-${hex.slice(16, 20)}-${hex.slice(20)}}`;
}

/** The built-in master for a stencil master id (`rectangle`, `flowchart-process`...). */
export function visioBuiltInMaster(id: string): VisioBuiltInMaster | undefined {
	for (const stencil of VISIO_BUILT_IN_STENCILS) {
		const master = stencil.masters.find((candidate) => candidate.id === id);
		if (!master) continue;
		const layer = STENCIL_LAYERS[stencil.id];
		return {
			master,
			stencil,
			...(layer ? { layer } : {}),
			uniqueId: guid(`unique:${id}`, true),
			baseId: guid(`base:${id}`),
		};
	}
	return undefined;
}
