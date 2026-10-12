import { describe, expect, it } from 'vitest';
import { editVsdx, type VisioEdit } from './edit';
import { parseVsdx } from './parser';
import { VisioPackage } from './package';
import { fixture } from './test-fixtures';
import { attribute, children } from './sheet';
import {
	VISIO_ARROW_SHAPES,
	VISIO_FLOWCHART_SHAPES,
	isVisioOutlineShape,
	visioOutlineShape,
	type VisioOutlineShape,
} from './stencil-shapes';
import { VISIO_STENCILS, visioStencilMaster } from './stencils';

describe('built-in stencils', () => {
	it('lists unique masters over core outlines or native ellipses', () => {
		const ids = VISIO_STENCILS.flatMap((stencil) => stencil.masters.map((master) => master.id));
		expect(new Set(ids).size).toBe(ids.length);
		expect(VISIO_STENCILS.map((stencil) => stencil.name)).toEqual([
			'Basic Flowchart Shapes',
			'Miscellaneous Flowchart Shapes',
			'Arrow Shapes',
		]);
		// Visio's Basic Flowchart Shapes stencil: its fourteen masters, in its order.
		expect(VISIO_STENCILS[0]!.masters.map((master) => master.name)).toEqual([
			'Process',
			'Decision',
			'Subprocess',
			'Start/End',
			'Document',
			'Data',
			'Database',
			'External Data',
			'Custom 1',
			'Custom 2',
			'Custom 3',
			'Custom 4',
			'On-page reference',
			'Off-page reference',
		]);
		expect(visioStencilMaster('flowchart-database')?.master).toMatchObject({
			shape: 'can',
			size: { width: 1, height: 0.75 },
		});
		for (const stencil of VISIO_STENCILS)
			for (const master of stencil.masters) {
				expect(master.shape === 'ellipse' || isVisioOutlineShape(master.shape)).toBe(true);
				expect(master.size.width).toBeGreaterThan(0);
				expect(visioStencilMaster(master.id)?.stencil).toBe(stencil);
			}
		expect(visioStencilMaster('rectangle')).toBeUndefined();
	});

	it('keeps every outline inside the unit box', () => {
		for (const shape of [...VISIO_FLOWCHART_SHAPES, ...VISIO_ARROW_SHAPES]) {
			const outline = visioOutlineShape(shape);
			for (const points of [...outline.paths, ...(outline.lines ?? [])]) {
				expect(points.length).toBeGreaterThanOrEqual(2);
				for (const [x, y] of points) {
					expect(x).toBeGreaterThanOrEqual(-1e-9);
					expect(x).toBeLessThanOrEqual(1 + 1e-9);
					expect(y).toBeGreaterThanOrEqual(-1e-9);
					expect(y).toBeLessThanOrEqual(1 + 1e-9);
				}
			}
		}
	});

	it('creates every stencil outline as a local shape that reopens', async () => {
		const shapes = [...VISIO_FLOWCHART_SHAPES, ...VISIO_ARROW_SHAPES] as VisioOutlineShape[];
		const blank = await fixture({ pages: [{ id: '0', contents: '' }] });
		const edits: VisioEdit[] = shapes.map((shape, index) => ({
			type: 'create-rectangle',
			pageId: '0',
			shapeId: String(index + 1),
			x: 1 + (index % 6) * 1.5,
			y: 1 + Math.floor(index / 6) * 1.5,
			width: 1,
			height: 0.75,
			shape,
		}));
		const saved = await editVsdx(blank, edits);
		const model = await parseVsdx(saved.bytes);
		expect(model.pages[0]!.shapes).toHaveLength(shapes.length);
		for (const shape of model.pages[0]!.shapes) expect(shape.geometry.length).toBeGreaterThan(0);
		// Interior marks are unfilled Geometry sections.
		const root = await (await VisioPackage.open(saved.bytes)).readXml('visio/pages/page1.xml');
		const predefined = String(shapes.indexOf('flowchart-predefined-process') + 1);
		const sheet = Array.from(root.getElementsByTagName('Shape')).find(
			(node) => attribute(node, 'ID') === predefined,
		)!;
		const sections = children(sheet, 'Section').filter(
			(section) => attribute(section, 'N') === 'Geometry',
		);
		expect(
			sections.map((section) =>
				attribute(
					children(section, 'Cell').find((cell) => attribute(cell, 'N') === 'NoFill'),
					'V',
				),
			),
		).toEqual([undefined, '1', '1']);
		// The terminator is a stadium through the Rounding cell.
		const terminator = Array.from(root.getElementsByTagName('Shape')).find(
			(node) => attribute(node, 'ID') === String(shapes.indexOf('flowchart-terminator') + 1),
		)!;
		expect(
			attribute(
				children(terminator, 'Cell').find((cell) => attribute(cell, 'N') === 'Rounding'),
				'V',
			),
		).toBe('0.375');
	});

	it('refuses unknown outline names', async () => {
		const blank = await fixture({ pages: [{ id: '0', contents: '' }] });
		await expect(
			editVsdx(blank, [
				{
					type: 'create-rectangle',
					pageId: '0',
					shapeId: '1',
					x: 1,
					y: 1,
					width: 1,
					height: 1,
					shape: 'flowchart-teleporter' as VisioOutlineShape,
				},
			]),
		).rejects.toThrow(/outline/);
	});
});
