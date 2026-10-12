import { createVsdx, editVsdx, type VisioEdit } from '../index';

interface SampleBox {
	id: string;
	text: string;
	x: number;
	y: number;
	width: number;
	height: number;
	fill: string;
	/** The built-in stencil master the box is an instance of; Basic Shapes' Rectangle by default. */
	master?: string;
}
interface SampleLink {
	id: string;
	from: string;
	to: string;
}
interface SamplePage {
	id: string;
	name: string;
	width: number;
	height: number;
	boxes: readonly SampleBox[];
	links: readonly SampleLink[];
}

const LINE = '#326765';
const PAGES: readonly SamplePage[] = [
	{
		id: '0',
		name: 'Release workflow',
		width: 8.5,
		height: 7,
		boxes: [
			{
				id: '1',
				text: 'Start with an idea',
				master: 'flowchart-process',
				x: 4.25,
				y: 5.85,
				width: 2.8,
				height: 0.7,
				fill: '#D8EFEB',
			},
			{
				id: '2',
				text: 'Design and build',
				master: 'flowchart-process',
				x: 4.25,
				y: 4.65,
				width: 2.8,
				height: 0.7,
				fill: '#F3EEE1',
			},
			{
				id: '3',
				text: 'Ready?',
				x: 4.25,
				y: 3.3,
				width: 1.7,
				height: 1.05,
				fill: '#DFEBF7',
				master: 'flowchart-decision',
			},
			{
				id: '4',
				text: 'Review and release',
				master: 'flowchart-process',
				x: 4.25,
				y: 1.95,
				width: 2.8,
				height: 0.7,
				fill: '#D8EFEB',
			},
			{
				id: '5',
				text: 'Double-click a shape to edit its text\nDrag shapes; connectors follow',
				x: 4.25,
				y: 0.8,
				width: 3.8,
				height: 0.7,
				fill: '#FFFFFF',
			},
		],
		links: [
			{ id: '6', from: '1', to: '2' },
			{ id: '7', from: '2', to: '3' },
			{ id: '8', from: '3', to: '4' },
		],
	},
	{
		id: '1',
		name: 'Architecture',
		width: 8.5,
		height: 5.5,
		boxes: [
			{ id: '1', text: 'Your framework', x: 1.7, y: 3.95, width: 2, height: 0.9, fill: '#DFEBF7' },
			{ id: '2', text: 'One viewer', x: 4.2, y: 3.95, width: 2, height: 0.9, fill: '#D8EFEB' },
			{ id: '3', text: 'ooxml-core', x: 6.7, y: 3.95, width: 2, height: 0.9, fill: '#F3EEE1' },
			{
				id: '4',
				text: 'Framework-neutral rendering\nLocal files. Explicit compatibility notes.',
				x: 4.25,
				y: 2,
				width: 5.4,
				height: 1,
				fill: '#FFFFFF',
			},
		],
		links: [
			{ id: '5', from: '1', to: '2' },
			{ id: '6', from: '2', to: '3' },
		],
	},
];

function shapeEdits(page: SamplePage): VisioEdit[] {
	const pageId = page.id;
	const box = (id: string) => page.boxes.find((candidate) => candidate.id === id)!;
	return [
		// Each box is an instance of a stencil master, as a shape dragged from the Shapes window is.
		// The drops of a transaction run first, so the edits after them find their shapes.
		...page.boxes.flatMap((shape): VisioEdit[] => [
			{
				type: 'drop-stencil-master',
				pageId,
				shapeId: shape.id,
				master: shape.master ?? 'rectangle',
				x: shape.x,
				y: shape.y,
			},
			{
				type: 'resize-shape',
				pageId,
				shapeId: shape.id,
				width: shape.width,
				height: shape.height,
			},
			{ type: 'replace-plain-text', pageId, shapeId: shape.id, text: shape.text },
			{ type: 'format-shape', pageId, shapeId: shape.id, fillColor: shape.fill, lineColor: LINE },
		]),
		// Connectors start between the shape centres; glue then moves each end onto its shape.
		...page.links.flatMap((link): VisioEdit[] => [
			{
				type: 'create-line',
				pageId,
				shapeId: link.id,
				beginX: box(link.from).x,
				beginY: box(link.from).y,
				endX: box(link.to).x,
				endY: box(link.to).y,
				connect: { begin: link.from, end: link.to },
			},
			{ type: 'format-shape', pageId, shapeId: link.id, lineColor: LINE },
		]),
	];
}

/**
 * The sample drawing as a real VSDX package, built through the same edit API the editor uses, so
 * every shape in it can be selected, moved, retyped and saved. Its boxes are instances of the
 * built-in stencil masters, which the drawing carries in its own document stencil, as a Visio
 * flowchart does. An original drawing, not a Visio-authored reference fixture. Page and shape edits need separate transactions, so this is
 * two edits after the blank drawing.
 */
export async function createSampleVsdx(): Promise<Uint8Array> {
	const [first, ...rest] = PAGES as [SamplePage, ...SamplePage[]];
	// A flowchart: Visio's flowchart template docks Basic Flowchart Shapes.
	const blank = await createVsdx({
		width: first.width,
		height: first.height,
		stencils: ['basic-flowchart'],
	});
	const pages = await editVsdx(blank, [
		{ type: 'rename-page', pageId: first.id, name: first.name },
		...rest.flatMap((page, index): VisioEdit[] => [
			{
				type: 'insert-page',
				pageId: page.id,
				afterPageId: (index ? rest[index - 1]! : first).id,
				name: page.name,
			},
			{ type: 'set-page-size', pageId: page.id, width: page.width, height: page.height },
		]),
	]);
	return (await editVsdx(pages.bytes, PAGES.flatMap(shapeEdits))).bytes;
}
