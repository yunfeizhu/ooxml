import { describe, expect, it } from 'vitest';
import { createVsdx } from '../create-document';
import { editVsdx } from '../edit';
import { parseVsdx } from '../parser';
import type { VisioDocument } from '../model';
import {
	VISIO_DATA_GRAPHIC_FILL_ROW,
	VISIO_DATA_GRAPHIC_ROW,
	visioColorRules,
	visioDataGraphicEdits,
	visioDataGraphicFields,
	visioDataGraphicParts,
	visioLegendEdits,
	visioRemoveDataGraphicEdits,
} from './data-graphics';

async function linked(): Promise<{ bytes: Uint8Array; document: VisioDocument }> {
	let bytes = (
		await editVsdx(await createVsdx(), [
			{ type: 'create-rectangle', pageId: '0', shapeId: '1', x: 2, y: 5, width: 1.5, height: 1 },
			{ type: 'create-rectangle', pageId: '0', shapeId: '2', x: 5, y: 5, width: 1.5, height: 1 },
		])
	).bytes;
	bytes = (
		await editVsdx(bytes, [
			{
				type: 'import-data-recordset',
				pageId: '0',
				name: 'load',
				columns: [
					{ name: 'Name', label: 'Name', type: 'string' },
					{ name: 'Load', label: 'Load', type: 'number' },
				],
				rows: [
					['Web', '20'],
					['Db', '80'],
				],
			},
		])
	).bytes;
	bytes = (
		await editVsdx(bytes, [
			{
				type: 'link-data-rows',
				pageId: '0',
				recordsetId: '0',
				links: [
					{ shapeId: '1', rowId: '1' },
					{ shapeId: '2', rowId: '2' },
				],
			},
		])
	).bytes;
	return { bytes, document: await parseVsdx(bytes) };
}
const apply = async (bytes: Uint8Array, edits: Parameters<typeof editVsdx>[1]) => {
	const result = await editVsdx(bytes, edits);
	return { bytes: result.bytes, document: await parseVsdx(result.bytes) };
};

describe('data graphics', () => {
	it('lists fields and adds text callouts, data bars and icons as marked shapes', async () => {
		const start = await linked();
		const page = start.document.pages[0]!;
		expect(visioDataGraphicFields(page)).toEqual([
			{ name: 'Name', label: 'Name' },
			{ name: 'Load', label: 'Load' },
		]);
		let state = await apply(
			start.bytes,
			visioDataGraphicEdits(page, ['1', '2'], { kind: 'text', field: 'Name' }),
		);
		state = await apply(
			state.bytes,
			visioDataGraphicEdits(state.document.pages[0]!, ['1', '2'], {
				kind: 'bar',
				field: 'Load',
				min: 0,
				max: 100,
			}),
		);
		state = await apply(
			state.bytes,
			visioDataGraphicEdits(state.document.pages[0]!, ['1', '2'], {
				kind: 'icon',
				field: 'Load',
				min: 0,
				max: 100,
			}),
		);
		const after = state.document.pages[0]!;
		const parts = visioDataGraphicParts(after);
		expect(
			parts
				.get('1')!
				.map((part) => part.kind)
				.sort(),
		).toEqual(['bar', 'bar', 'icon', 'text']);
		const callout = after.shapes.find(
			(shape) => shape.id === parts.get('1')!.find((p) => p.kind === 'text')!.id,
		)!;
		expect(callout.text.plainText).toBe('Web');
		expect(callout.shapeData![0]).toMatchObject({
			name: VISIO_DATA_GRAPHIC_ROW,
			invisible: true,
			value: '1',
		});
		// Re-applying a kind replaces that kind's parts instead of stacking more.
		state = await apply(
			state.bytes,
			visioDataGraphicEdits(after, ['1'], { kind: 'text', field: 'Load' }),
		);
		expect(
			visioDataGraphicParts(state.document.pages[0]!)
				.get('1')!
				.filter((p) => p.kind === 'text'),
		).toHaveLength(1);
		const removed = await apply(
			state.bytes,
			visioRemoveDataGraphicEdits(state.document.pages[0]!, ['1', '2']),
		);
		expect(visioDataGraphicParts(removed.document.pages[0]!).size).toBe(0);
		expect(removed.document.pages[0]!.shapes.map((shape) => shape.id)).toEqual(['1', '2']);
	});

	it('colours by value, remembers the fill, restores it and inserts a grouped legend', async () => {
		const start = await linked();
		const page = start.document.pages[0]!;
		const original = page.shapes[0]!.style.fill;
		const rules = visioColorRules(page, ['1', '2'], 'Name');
		expect(rules.rules.map((rule) => rule.label)).toEqual(['Db', 'Web']);
		const coloured = await apply(
			start.bytes,
			visioDataGraphicEdits(page, ['1', '2'], { kind: 'color', field: 'Name' }),
		);
		const shapes = coloured.document.pages[0]!.shapes;
		expect(shapes[0]!.style.fill).toBe('#ed7d31');
		expect(shapes[1]!.style.fill).toBe('#5b9bd5');
		expect(
			shapes[0]!.shapeData!.find((row) => row.name === VISIO_DATA_GRAPHIC_FILL_ROW),
		).toMatchObject({ value: original });
		const legend = await apply(
			coloured.bytes,
			visioLegendEdits(coloured.document.pages[0]!, 'Name', rules.rules),
		);
		const group = legend.document.pages[0]!.shapes.at(-1)!;
		expect(group.kind).toBe('group');
		expect(group.children.map((child) => child.text.plainText).filter(Boolean)).toEqual([
			'Name',
			'Db',
			'Web',
		]);
		const relegend = await apply(legend.bytes, [
			...visioRemoveDataGraphicEdits(legend.document.pages[0]!, ['legend']),
			...visioLegendEdits(legend.document.pages[0]!, 'Name', rules.rules),
		]);
		expect(
			relegend.document.pages[0]!.shapes.filter((shape) => shape.kind === 'group'),
		).toHaveLength(1);
		// Horizontal: the same members, with the entries in one row beside the title.
		const across = await apply(legend.bytes, [
			...visioRemoveDataGraphicEdits(legend.document.pages[0]!, ['legend']),
			...visioLegendEdits(legend.document.pages[0]!, 'Name', rules.rules, 'horizontal'),
		]);
		const row = across.document.pages[0]!.shapes.at(-1)!;
		expect(row.kind).toBe('group');
		expect(row.children.map((child) => child.text.plainText).filter(Boolean)).toEqual([
			'Name',
			'Db',
			'Web',
		]);
		expect(row.width).toBeGreaterThan(group.width);
		expect(row.height).toBeLessThan(group.height);
		// A page too narrow for one row wraps instead of leaving the page.
		const narrow = visioLegendEdits(
			{ ...legend.document.pages[0]!, width: 3.5 },
			'Name',
			rules.rules,
			'horizontal',
		).filter((edit) => edit.type === 'create-rectangle') as { x: number; y: number }[];
		expect(narrow[0]!.x).toBe(narrow[1]!.x);
		expect(narrow[1]!.y).toBeLessThan(narrow[0]!.y);
		const restored = await apply(
			relegend.bytes,
			visioRemoveDataGraphicEdits(relegend.document.pages[0]!, ['1', '2', 'legend']),
		);
		expect(restored.document.pages[0]!.shapes.map((shape) => shape.id)).toEqual(['1', '2']);
		expect(restored.document.pages[0]!.shapes[0]!.style.fill).toBe(original);
		expect(
			restored.document.pages[0]!.shapes[0]!.shapeData!.some(
				(row) => row.name === VISIO_DATA_GRAPHIC_FILL_ROW,
			),
		).toBe(false);
	});

	it('uses three numeric ranges for numbers', async () => {
		const { document } = await linked();
		const rules = visioColorRules(document.pages[0]!, ['1', '2'], 'Load');
		expect(rules.rules.map((rule) => rule.label)).toEqual(['20 - 40', '40 - 60', '60 - 80']);
		expect(rules.color(document.pages[0]!.shapes[1]!)).toBe('#2e75b6');
		expect(visioColorRules(document.pages[0]!, ['2'], 'Load').rules).toEqual([
			{ color: '#2e75b6', label: '80' },
		]);
	});
});
