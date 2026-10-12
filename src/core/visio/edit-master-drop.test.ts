import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { createVsdx } from './create-document';
import { editVsdx, type VisioEdit } from './edit';
import { parseVsdx } from './parser';
import { visioBuiltInMaster, VISIO_BUILT_IN_STENCILS } from './stencil-masters';
import { cell, fixture, rectangle, shape } from './test-fixtures';

const part = async (bytes: Uint8Array, path: string) =>
	(await JSZip.loadAsync(bytes)).file(path)!.async('string');
const paths = async (bytes: Uint8Array) => Object.keys((await JSZip.loadAsync(bytes)).files).sort();
const drop = (master: string, shapeId: string, x = 2, y = 3): VisioEdit => ({
	type: 'drop-stencil-master',
	pageId: '0',
	shapeId,
	master,
	x,
	y,
});

describe('built-in stencil masters', () => {
	it('gives every master its own stable identity', () => {
		const all = VISIO_BUILT_IN_STENCILS.flatMap((stencil) => stencil.masters);
		const ids = all.map((master) => visioBuiltInMaster(master.id)!);
		expect(new Set(ids.map((item) => item.uniqueId)).size).toBe(all.length);
		expect(new Set(ids.map((item) => item.baseId)).size).toBe(all.length);
		expect(ids[0]!.uniqueId).toMatch(
			// The tail is the one Visio gives every master's UniqueID when it saves.
			/^\{[0-9A-F]{8}-[0-9A-F]{4}-5[0-9A-F]{3}-8E40-00608CF305B2\}$/,
		);
		expect(visioBuiltInMaster('rectangle')!.uniqueId).toBe(
			visioBuiltInMaster('rectangle')!.uniqueId,
		);
		expect(visioBuiltInMaster('flowchart-process')).toMatchObject({ layer: 'Flowchart' });
		expect(visioBuiltInMaster('rectangle')!.layer).toBeUndefined();
		expect(visioBuiltInMaster('nothing')).toBeUndefined();
	});
});

describe('dropping a built-in stencil master', () => {
	it('adds the master to a drawing without masters and drops an instance of it', async () => {
		const blank = await createVsdx();
		const saved = await editVsdx(blank, [drop('flowchart-process', '1')]);
		expect(await paths(saved.bytes)).toEqual(
			expect.arrayContaining([
				'visio/masters/masters.xml',
				'visio/masters/_rels/masters.xml.rels',
				'visio/masters/master1.xml',
				'visio/pages/_rels/page1.xml.rels',
			]),
		);
		const types = await part(saved.bytes, '[Content_Types].xml');
		expect(types).toContain(
			'PartName="/visio/masters/masters.xml" ContentType="application/vnd.ms-visio.masters+xml"',
		);
		expect(types).toContain(
			'PartName="/visio/masters/master1.xml" ContentType="application/vnd.ms-visio.master+xml"',
		);
		expect(await part(saved.bytes, 'visio/_rels/document.xml.rels')).toContain(
			'relationships/masters" Target="masters/masters.xml"',
		);
		const masters = await part(saved.bytes, 'visio/masters/masters.xml');
		expect(masters).toContain('NameU="Process"');
		expect(masters).toContain(`UniqueID="${visioBuiltInMaster('flowchart-process')!.uniqueId}"`);
		// The instance names the master and keeps its pin; the size is an inherited cache.
		const page = await part(saved.bytes, 'visio/pages/page1.xml');
		expect(page).toContain('<Shape ID="1" Type="Shape" Master="1" NameU="Process" Name="Process">');
		expect(page).toContain('<Cell N="Width" V="1" U="IN" F="Inh"/>');
		expect(page).not.toContain('Geometry');
		const model = await parseVsdx(saved.bytes);
		expect(model.masters!.map((master) => master.name)).toEqual(['Process']);
		const dropped = model.pages[0]!.shapes[0]!;
		expect(dropped).toMatchObject({ id: '1', masterId: '1', width: 1, height: 0.75 });
		expect(dropped.rotation).toMatchObject({ pinX: 2, pinY: 3 });
		expect(dropped.geometry.length).toBeGreaterThan(0);
		// Visio's flowchart masters sit on the Flowchart layer; the page gets it and the shape joins.
		expect(model.pages[0]!.layers!.map((layer) => layer.name)).toEqual(['Flowchart']);
		expect(dropped.layerIds).toEqual(['0']);
	});

	it('reuses the master for the next drop and names later instances Name.ID', async () => {
		const first = await editVsdx(await createVsdx(), [drop('flowchart-process', '1')]);
		const second = await editVsdx(first.bytes, [
			drop('flowchart-process', '2', 4, 3),
			drop('ellipse', '3', 6, 3),
		]);
		expect(second.changedParts).not.toContain('visio/masters/master1.xml');
		const model = await parseVsdx(second.bytes);
		expect(model.masters!.map((master) => master.name)).toEqual(['Process', 'Ellipse']);
		expect(model.pages[0]!.shapes.map((item) => [item.name, item.masterId])).toEqual([
			['Process', '1'],
			['Process.2', '1'],
			['Ellipse', '2'],
		]);
		// Basic Shapes have no layer, so the ellipse joins none.
		expect(model.pages[0]!.shapes[2]!.layerIds ?? []).toEqual([]);
		expect(model.pages[0]!.layers).toHaveLength(1);
	});

	it('runs the other edits of the transaction after the drops, as one call', async () => {
		const saved = await editVsdx(await createVsdx(), [
			{ type: 'format-shape', pageId: '0', shapeId: '1', fillColor: '#ff0000' },
			drop('rectangle', '1'),
			drop('diamond', '2', 5, 3),
			{
				type: 'create-line',
				pageId: '0',
				shapeId: '3',
				beginX: 2,
				beginY: 3,
				endX: 5,
				endY: 3,
				connect: { begin: '1', end: '2' },
			},
		]);
		const page = (await parseVsdx(saved.bytes)).pages[0]!;
		expect(page.shapes[0]!.style.fill).toBe('#ff0000');
		expect(page.connectors).toHaveLength(2);
		// A refused follow-up fails the whole call.
		await expect(
			editVsdx(await createVsdx(), [
				drop('rectangle', '1'),
				{ type: 'delete-shape', pageId: '0', shapeId: '9' },
			]),
		).rejects.toMatchObject({ code: 'EDIT_TARGET_NOT_FOUND' });
	});

	it('instances the drawing own master of the same name, and adds a copy beside an unusable one', async () => {
		const size = cell('PinX', 2) + cell('PinY', 2) + cell('Width', 3) + cell('Height', 2);
		const usable = await fixture({
			masters: [{ id: '7', shapes: shape('5', size + rectangle), attributes: 'NameU="Process"' }],
			pages: [{ id: '0', contents: '<Shapes/>' }],
		});
		const reused = await parseVsdx(
			(await editVsdx(usable, [drop('flowchart-process', '1')])).bytes,
		);
		expect(reused.masters).toHaveLength(1);
		expect(reused.pages[0]!.shapes[0]).toMatchObject({ masterId: '7', width: 3, height: 2 });
		const line = cell('BeginX', 0) + cell('BeginY', 0) + cell('EndX', 1) + cell('EndY', 1);
		const unusable = await fixture({
			masters: [{ id: '7', shapes: shape('5', line + size), attributes: 'NameU="Process"' }],
			pages: [{ id: '0', contents: '<Shapes/>' }],
		});
		const added = await parseVsdx(
			(await editVsdx(unusable, [drop('flowchart-process', '1')])).bytes,
		);
		expect(added.masters!.map((master) => [master.id, master.name])).toEqual([
			['7', 'Process'],
			['8', 'Process.8'],
		]);
		expect(added.pages[0]!.shapes[0]).toMatchObject({ masterId: '8', width: 1, height: 0.75 });
	});

	it('leaves a fresh drop open to the ordinary edits, in a drawing that says nothing about locks', async () => {
		// createVsdx writes no protection cells; the master carries its own, so an instance can be
		// proven unlocked, and an empty text of its own takes the first character format.
		const dropped = await editVsdx(await createVsdx(), [
			drop('rectangle', '1'),
			drop('circle', '2', 5, 3),
		]);
		const target = { pageId: '0', shapeId: '1' };
		for (const edit of [
			{ type: 'move-shape', ...target, x: 2, y: 6 },
			{ type: 'resize-shape', ...target, width: 2, height: 1 },
			{ type: 'rotate-shape', ...target, angle: 1 },
			{ type: 'flip-shape', ...target, axis: 'horizontal' },
			{ type: 'replace-plain-text', ...target, text: 'Typed' },
			{ type: 'format-text', ...target, bold: true },
			{ type: 'format-shape', ...target, fillColor: '#00ff00' },
			{ type: 'format-shape', ...target, quickStyle: { color: 100, matrix: 4 } },
			{ type: 'resize-shape', pageId: '0', shapeId: '2', width: 2, height: 1 },
		] as VisioEdit[])
			expect((await editVsdx(dropped.bytes, [edit])).changedParts, edit.type).toContain(
				'visio/pages/page1.xml',
			);
		const both = await editVsdx(dropped.bytes, [
			{ type: 'move-shape', ...target, x: 2, y: 6 },
			{ type: 'move-shape', pageId: '0', shapeId: '2', x: 5, y: 6 },
		]);
		expect(
			(await parseVsdx(both.bytes)).pages[0]!.shapes.map((item) => item.rotation!.pinY),
		).toEqual([6, 6]);
	});

	it('grows an Auto Size page around a drop and refuses bad commands', async () => {
		const blank = await createVsdx({ width: 4, height: 4 });
		const auto = await editVsdx(blank, [{ type: 'set-page-setup', pageId: '0', autoSize: true }]);
		const saved = await editVsdx(auto.bytes, [drop('rectangle', '1', 6, 2)]);
		expect((await parseVsdx(saved.bytes)).pages[0]!.width).toBeGreaterThan(4);
		await expect(editVsdx(blank, [drop('no-such-master', '1')])).rejects.toMatchObject({
			code: 'INVALID_EDIT',
		});
		await expect(editVsdx(blank, [drop('rectangle', '1', Number.NaN)])).rejects.toMatchObject({
			code: 'INVALID_EDIT',
		});
		await expect(
			editVsdx(blank, [{ ...drop('rectangle', '1'), pageId: '5' } as VisioEdit]),
		).rejects.toMatchObject({ code: 'EDIT_TARGET_NOT_FOUND' });
	});
});
