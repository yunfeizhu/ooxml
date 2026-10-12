import { DOMParser } from '@xmldom/xmldom';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { editVsdx, type VisioEdit } from './edit';
import { parseVsdx } from './parser';
import { fixture, shape } from './test-fixtures';

const PAGE = 'visio/pages/page1.xml';
const c = (name: string, value: string | number, formula = '') =>
	`<Cell N="${name}" V="${value}"${formula ? ` F="${formula}"` : ''}/>`;
const row = (index: number, type: string, cells: string) =>
	`<Row T="${type}" IX="${index}">${cells}</Row>`;
const outline = (second: string) =>
	`<Section N="Geometry" IX="0">${c('NoFill', 0)}${row(1, 'MoveTo', c('X', 0, 'Width*0') + c('Y', 0, 'Height*0'))}${row(2, 'LineTo', second + c('Y', 1, 'Height*1'))}${row(3, 'LineTo', c('X', 2, 'Width*1') + c('Y', 0, 'Height*0'))}${row(4, 'LineTo', c('X', 0, 'Geometry1.X1') + c('Y', 0, 'Geometry1.Y1'))}</Section>`;
const follow = (parent: string, x: number, width: number, pin = x) =>
	c('PinX', pin, `Sheet.${parent}!Width*${x}`) +
	c('PinY', 0.5, `Sheet.${parent}!Height*0.5`) +
	c('Width', 2 * width, `Sheet.${parent}!Width*${width}`) +
	c('Height', 1, `Sheet.${parent}!Height*1`) +
	c('LocPinX', width, 'Width*0.5') +
	c('LocPinY', 0.5, 'Height*0.5');

/**
 * A group master shaped like Visio's Can, Cube and Pyramid: a control handle on the group, a
 * sub-shape and a nested group that follow the group's size, geometry that reads the group's
 * control handle across sheets, and a face whose fill the master protects.
 */
const master = (options: { part?: string; face?: string } = {}) =>
	shape(
		'5',
		c('PinX', 2) +
			c('PinY', 2) +
			c('Width', 2) +
			c('Height', 1) +
			c('LocPinX', 1, 'Width*0.5') +
			c('LocPinY', 0.5, 'Height*0.5') +
			c('Angle', 0) +
			c('FlipX', 0) +
			c('FlipY', 0) +
			c('FillForegnd', '#ffffff') +
			c('LineColor', '#000000') +
			`<Section N="Control"><Row N="Row_1">${c('X', 0.5, 'BOUND(Width*0.25,0,FALSE,Width*0,Width*1)')}${c('Y', 1, 'Height*1')}</Row></Section>` +
			`<Section N="Connection">${row(0, 'Connection', c('X', 0.5, 'Controls.Row_1') + c('Y', 1, 'Controls.Row_1.Y'))}</Section>` +
			`<Shapes>${shape(
				'6',
				(options.part ?? follow('5', 0.5, 1, 1)) +
					c('FillForegnd', '#010203', options.face ?? 'GUARD(RGB(1,2,3))') +
					c('LineColor', '#000000') +
					outline(c('X', 0.5, 'Sheet.5!Controls.Row_1')),
			)}${shape(
				'7',
				follow('5', 0.5, 1, 1) +
					`<Shapes>${shape('8', follow('7', 0.25, 0.5, 0.5) + c('LineColor', '#000000') + outline(c('X', 0.75, 'Sheet.5!Controls.Row_1-Sheet.6!Width+2.25')))}</Shapes>`,
				'Type="Group"',
			)}</Shapes>`,
		'Type="Group"',
	);
const instance = (extra = '', parts = '') =>
	shape(
		'1',
		c('PinX', 3) +
			c('PinY', 5) +
			extra +
			`<Shapes>${shape('2', '', 'MasterShape="6"')}${shape('3', `<Shapes>${shape('4', '', 'MasterShape="8"')}</Shapes>`, 'Type="Group" MasterShape="7"')}${parts}</Shapes>`,
		'Type="Group" Master="2"',
	);
const source = (options: { page?: string; definition?: string } = {}) =>
	fixture({
		masters: [{ id: '2', shapes: options.definition ?? master() }],
		pages: [{ id: '0', contents: `<Shapes>${options.page ?? instance()}</Shapes>` }],
	});

/** `id.Section.row.Cell -> [value, unit, formula]` for every cell on the page. */
async function cells(bytes: Uint8Array) {
	const xml = await (await JSZip.loadAsync(bytes)).file(PAGE)!.async('string');
	const root = new DOMParser().parseFromString(xml, 'text/xml').documentElement!;
	const result = new Map<string, [number | string, string | null, string | null]>();
	for (const cell of Array.from(root.getElementsByTagName('Cell'))) {
		const path: string[] = [];
		let node = cell.parentNode as typeof root | null;
		for (; node && node.localName !== 'Shape'; node = node.parentNode as typeof root | null)
			if (node.localName === 'Row')
				path.unshift(node.getAttribute('IX') ?? node.getAttribute('N')!);
			else if (node.localName === 'Section') path.unshift(node.getAttribute('N')!);
		const value = cell.getAttribute('V') ?? '';
		result.set([node?.getAttribute('ID'), ...path, cell.getAttribute('N')].join('.'), [
			/^-?[\d.]+(e-?\d+)?$/i.test(value) ? Number(value) : value,
			cell.getAttribute('U'),
			cell.getAttribute('F'),
		]);
	}
	return result;
}
const refused = (bytes: Uint8Array, edits: VisioEdit[]) =>
	editVsdx(bytes, edits).then(
		() => 'accepted',
		(error: { code?: string }) => error.code,
	);
const resize = (shapeId = '1'): VisioEdit => ({
	type: 'resize-shape',
	pageId: '0',
	shapeId,
	width: 4,
	height: 2,
});

describe('instances of group masters', () => {
	it('resizes the group and refreshes what its sub-shapes inherit, across sheets', async () => {
		const saved = await editVsdx(await source(), [resize()]);
		const page = await cells(saved.bytes);
		// The size is a local value of the group; everything that follows is an inherited cache.
		expect(page.get('1.Width')).toEqual([4, 'IN', null]);
		expect(page.get('1.Height')).toEqual([2, 'IN', null]);
		expect(page.get('1.LocPinX')).toEqual([2, 'IN', 'Inh']);
		expect(page.get('1.Control.Row_1.X')).toEqual([1, 'IN', 'Inh']);
		expect(page.get('1.Connection.0.X')).toEqual([1, 'IN', 'Inh']);
		expect(page.get('2.PinX')).toEqual([2, 'IN', 'Inh']);
		expect(page.get('2.Width')).toEqual([4, 'IN', 'Inh']);
		expect(page.get('2.Height')).toEqual([2, 'IN', 'Inh']);
		// The sub-shape's outline reads the group's control handle.
		expect(page.get('2.Geometry.2.X')).toEqual([1, 'IN', 'Inh']);
		expect(page.get('3.Width')).toEqual([4, 'IN', 'Inh']);
		// A sub-shape of the nested group follows that group, and reads two other sheets.
		expect(page.get('4.PinX')).toEqual([1, 'IN', 'Inh']);
		expect(page.get('4.Width')).toEqual([2, 'IN', 'Inh']);
		expect(page.get('4.Geometry.2.X')).toEqual([1 - 4 + 2.25, 'IN', 'Inh']);
		// Nothing the size does not reach is restated.
		expect(page.has('2.LineColor')).toBe(false);
		expect(page.has('1.Angle')).toBe(false);
		const group = (await parseVsdx(saved.bytes)).pages[0]!.shapes[0]!;
		expect([group.width, group.height]).toEqual([4, 2]);
		expect(group.children!.map((child) => [child.width, child.height])).toEqual([
			[4, 2],
			[4, 2],
		]);
		expect(group.children![1]!.children![0]!.width).toBe(2);
	});

	it('moves, rotates and flips the group without touching its sub-shapes', async () => {
		const saved = await editVsdx(await source(), [
			{ type: 'move-shape', pageId: '0', shapeId: '1', x: 6, y: 7 },
			{ type: 'rotate-shape', pageId: '0', shapeId: '1', angle: Math.PI / 2 },
			{ type: 'flip-shape', pageId: '0', shapeId: '1', axis: 'horizontal' },
		]);
		const page = await cells(saved.bytes);
		expect([...page.keys()].sort()).toEqual(['1.Angle', '1.FlipX', '1.PinX', '1.PinY']);
		expect(page.get('1.PinX')![0]).toBe(6);
		expect(page.get('1.FlipX')![0]).toBe(1);
		expect(page.get('1.Angle')![0]).toBeCloseTo(-Math.PI / 2);
	});

	it('anchors a resize from a handle', async () => {
		const saved = await editVsdx(await source(), [
			{ ...resize(), anchor: { x: 0, y: 0 } } as VisioEdit,
		]);
		const page = await cells(saved.bytes);
		// The bottom-left corner stays at (2, 4.5): the pin moves with the new centre.
		expect([page.get('1.PinX')![0], page.get('1.PinY')![0]]).toEqual([4, 5.5]);
	});

	it('formats the group with its sub-shapes and passes over what a master protects', async () => {
		const saved = await editVsdx(await source(), [
			{
				type: 'format-shape',
				pageId: '0',
				shapeId: '1',
				fillColor: '#ff0000',
				lineColor: '#0000ff',
			},
		]);
		const page = await cells(saved.bytes);
		for (const id of ['1', '2', '4']) expect(page.get(`${id}.LineColor`)![0], id).toBe('#0000ff');
		expect(page.get('1.FillForegnd')![0]).toBe('#ff0000');
		// The face computes its own fill: the group's command leaves it, as Visio does.
		expect(page.has('2.FillForegnd')).toBe(false);
		const group = (await parseVsdx(saved.bytes)).pages[0]!.shapes[0]!;
		expect(group.children![0]!.style.lineColor).toBe('#0000ff');
	});

	it('formats and retypes one sub-shape alone', async () => {
		const bytes = await source();
		const saved = await editVsdx(bytes, [
			{ type: 'format-shape', pageId: '0', shapeId: '4', lineColor: '#00ff00' },
		]);
		const page = await cells(saved.bytes);
		expect([...page.keys()].filter((key) => key.endsWith('LineColor'))).toEqual(['4.LineColor']);
		// A nested group sub-selected: it and its own sub-shapes.
		const nested = await cells(
			(
				await editVsdx(bytes, [
					{ type: 'format-shape', pageId: '0', shapeId: '3', lineColor: '#00ff00' },
				])
			).bytes,
		);
		expect([...nested.keys()].filter((key) => key.endsWith('LineColor')).sort()).toEqual([
			'3.LineColor',
			'4.LineColor',
		]);
		// The protected face says so when it alone is asked.
		expect(
			await refused(bytes, [
				{ type: 'format-shape', pageId: '0', shapeId: '2', fillColor: '#ff0000' },
			]),
		).toBe('EDIT_PROTECTED_CELL');
		const typed = await editVsdx(bytes, [
			{ type: 'replace-plain-text', pageId: '0', shapeId: '2', text: 'Face' },
		]);
		const face = (await parseVsdx(typed.bytes)).pages[0]!.shapes[0]!.children![0]!;
		expect(face.text.plainText).toBe('Face');
	});

	it('refuses what it cannot compute, leaving the drawing alone', async () => {
		// A sub-shape with a size of its own would be scaled by Visio.
		const fixed = await source({
			definition: master({
				part: c('PinX', 1) + c('PinY', 0.5) + c('Width', 2) + c('Height', 1),
			}),
		});
		expect(await refused(fixed, [resize()])).toBe('UNSUPPORTED_INSTANCE_EDIT');
		// It still moves: a move changes nothing inside the group.
		expect(
			await refused(fixed, [{ type: 'move-shape', pageId: '0', shapeId: '1', x: 6, y: 7 }]),
		).toBe('accepted');
		// A shape added to the instance on the page has no master shape behind it.
		const added = await source({
			page: instance('', shape('9', c('PinX', 1) + c('PinY', 1) + c('Width', 1) + c('Height', 1))),
		});
		expect(await refused(added, [resize()])).toBe('UNSUPPORTED_INSTANCE_EDIT');
		// Another shape on the page that reads a sub-shape's size would go stale.
		const read = await source({
			page: instance() + shape('9', c('PinX', 1) + c('PinY', 1) + c('Width', 2, 'Sheet.2!Width')),
		});
		expect(await refused(read, [resize()])).toBe('EDIT_UNSUPPORTED_DEPENDENCY');
		// Sub-shapes are sized and placed by their group, not on their own.
		expect(await refused(await source(), [resize('2')])).not.toBe('accepted');
	});
});

describe('masters with several top-level shapes', () => {
	const box = (id: string, x: number, width: number) =>
		shape(id, c('PinX', x) + c('PinY', 0.25) + c('Width', width) + c('Height', 0.5));
	const pair = () =>
		fixture({
			masters: [{ id: '2', shapes: box('5', 0.5, 1) + box('6', 1.625, 0.75) }],
			pages: [{ id: '0', contents: '<Shapes/>' }],
		});
	const drop = async () =>
		editVsdx(await pair(), [
			{ type: 'insert-master-instance', pageId: '0', shapeId: '1', masterId: '2', x: 4, y: 5 },
		]);

	it('drops them as the group Visio makes, sized by its shapes', async () => {
		const page = await cells((await drop()).bytes);
		expect(page.get('1.PinX')![0]).toBe(4);
		expect(page.get('1.Width')).toEqual([2, null, null]);
		expect(page.get('1.Height')).toEqual([0.5, null, null]);
		expect(page.get('1.LocPinX')).toEqual([1, null, 'Width*0.5']);
		expect(page.get('2.PinX')).toEqual([0.5, null, 'Sheet.1!Width*0.25']);
		expect(page.get('2.Width')).toEqual([1, null, 'Sheet.1!Width*0.5']);
		expect(page.get('2.Height')).toEqual([0.5, null, 'Sheet.1!Height*1']);
		expect(page.get('3.PinX')).toEqual([1.625, null, 'Sheet.1!Width*0.8125']);
		expect(page.get('3.Width')).toEqual([0.75, null, 'Sheet.1!Width*0.375']);
		const group = (await parseVsdx((await drop()).bytes)).pages[0]!.shapes[0]!;
		expect(group.masterId).toBe('2');
		expect(group.children!.map((child) => child.width)).toEqual([1, 0.75]);
	});

	it('resizes the dropped group through the formulas written on the page', async () => {
		const saved = await editVsdx((await drop()).bytes, [resize()]);
		const page = await cells(saved.bytes);
		expect(page.get('1.Width')![0]).toBe(4);
		expect(page.get('1.LocPinX')).toEqual([2, null, 'Width*0.5']);
		// The sub-shapes keep their formulas; only the caches move.
		expect(page.get('2.Width')).toEqual([2, null, 'Sheet.1!Width*0.5']);
		expect(page.get('3.PinX')).toEqual([3.25, null, 'Sheet.1!Width*0.8125']);
		expect(page.get('3.Height')).toEqual([2, null, 'Sheet.1!Height*1']);
	});

	it('refuses a master whose shapes are turned', async () => {
		const turned = await fixture({
			masters: [
				{
					id: '2',
					shapes:
						box('5', 0.5, 1) +
						shape(
							'6',
							c('PinX', 2) + c('PinY', 1) + c('Width', 1) + c('Height', 1) + c('Angle', 1),
						),
				},
			],
			pages: [{ id: '0', contents: '<Shapes/>' }],
		});
		expect(
			await refused(turned, [
				{ type: 'insert-master-instance', pageId: '0', shapeId: '1', masterId: '2', x: 4, y: 5 },
			]),
		).toBe('UNSUPPORTED_MASTER_INSTANCE');
	});
});
