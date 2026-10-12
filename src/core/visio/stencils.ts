import type { VisioOutlineShape } from './stencil-shapes';

/** One master of a built-in stencil: a core outline (or a native ellipse) and its drop size. */
export interface VisioStencilMaster {
	/** Unique across every built-in stencil; also the drag payload and `data-master` id. */
	id: string;
	name: string;
	shape: VisioOutlineShape | 'ellipse';
	/** Default size in inches when dropped. */
	size: { width: number; height: number };
}
export interface VisioStencil {
	id: string;
	name: string;
	masters: readonly VisioStencilMaster[];
}

const size = (width: number, height: number) => ({ width, height });
const step = size(1, 0.75);
const master = (
	shape: VisioOutlineShape,
	name: string,
	dimensions = step,
	id: string = shape,
): VisioStencilMaster => ({ id, name, shape, size: dimensions });

/**
 * Built-in stencils More Shapes can open, in Visio's order. They are data over core outlines, not
 * stencil (.vssx) files: Visio's master shapesheets, connection points and Shape Data are not
 * reproduced, and stencil files cannot be opened. Basic Shapes lives with the Shapes window.
 * Basic Flowchart Shapes has Visio's fourteen masters, names and drop sizes; a master whose
 * outline another stencil also uses has its own id.
 */
export const VISIO_STENCILS: readonly VisioStencil[] = [
	{
		id: 'basic-flowchart',
		name: 'Basic Flowchart Shapes',
		masters: [
			master('flowchart-process', 'Process'),
			master('flowchart-decision', 'Decision'),
			master('flowchart-predefined-process', 'Subprocess'),
			master('flowchart-terminator', 'Start/End', size(1, 0.375)),
			master('flowchart-document', 'Document'),
			master('flowchart-data', 'Data'),
			master('can', 'Database', step, 'flowchart-database'),
			master('flowchart-stored-data', 'External Data', step, 'flowchart-external-data'),
			master('flowchart-manual-input', 'Custom 1', step, 'flowchart-custom-1'),
			master('flowchart-manual-operation', 'Custom 2', step, 'flowchart-custom-2'),
			master('flowchart-card', 'Custom 3', step, 'flowchart-custom-3'),
			master('flowchart-preparation', 'Custom 4', step, 'flowchart-custom-4'),
			{
				id: 'flowchart-on-page-reference',
				name: 'On-page reference',
				shape: 'ellipse',
				size: size(0.375, 0.375),
			},
			master('flowchart-off-page-reference', 'Off-page reference', size(0.5, 0.5)),
		],
	},
	{
		id: 'misc-flowchart',
		name: 'Miscellaneous Flowchart Shapes',
		masters: [
			master('flowchart-stored-data', 'Stored data'),
			master('flowchart-internal-storage', 'Internal storage', size(0.75, 0.75)),
			master('flowchart-sequential-data', 'Sequential data', size(0.75, 0.75)),
			master('flowchart-direct-data', 'Direct data'),
			master('flowchart-manual-input', 'Manual input'),
			master('flowchart-manual-operation', 'Manual operation'),
			master('flowchart-preparation', 'Preparation'),
			master('flowchart-card', 'Card'),
			master('flowchart-paper-tape', 'Paper tape'),
			master('flowchart-display', 'Display'),
			master('flowchart-loop-limit', 'Loop limit'),
		],
	},
	{
		id: 'arrow-shapes',
		name: 'Arrow Shapes',
		masters: [
			master('arrow-right', 'Right arrow', size(1, 0.5)),
			master('arrow-left', 'Left arrow', size(1, 0.5)),
			master('arrow-up', 'Up arrow', size(0.5, 1)),
			master('arrow-down', 'Down arrow', size(0.5, 1)),
			master('arrow-left-right', 'Double arrow', size(1.25, 0.5)),
			master('arrow-up-down', 'Up-down arrow', size(0.5, 1.25)),
			master('arrow-quad', 'Quad arrow', size(1, 1)),
			master('arrow-notched', 'Notched arrow', size(1, 0.5)),
			master('arrow-pentagon', 'Pentagon arrow', size(1, 0.5)),
			master('arrow-chevron', 'Chevron arrow', size(1, 0.5)),
			master('arrow-curved', 'Curved arrow', size(1, 0.75)),
			master('arrow-line-single', '1-D single arrow', size(1.5, 0.25)),
			master('arrow-line-double', '1-D double arrow', size(1.5, 0.25)),
		],
	},
];

/** A built-in stencil master by id, with its stencil. */
export function visioStencilMaster(
	id: string,
): { stencil: VisioStencil; master: VisioStencilMaster } | undefined {
	for (const stencil of VISIO_STENCILS) {
		const found = stencil.masters.find((candidate) => candidate.id === id);
		if (found) return { stencil, master: found };
	}
	return undefined;
}
