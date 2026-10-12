import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { captureVisioClipboard } from './clipboard';
import { editVsdx, type VisioEdit } from './edit';
import { parseVsdx } from './parser';
import { fixture, relation, relations, shape } from './test-fixtures';

const PAGE = 'visio/pages/page1.xml';
const c = (name: string, value: string | number, formula = '', unit = '') =>
	`<Cell N="${name}" V="${value}"${unit ? ` U="${unit}"` : ''}${formula ? ` F="${formula}"` : ''}/>`;
const len = (name: string, value: number, formula = '') => c(name, value, formula, 'IN');
const row = (index: number, type: string, cells: string) =>
	`<Row T="${type}" IX="${index}">${cells}</Row>`;

/** Our own 2D master: a box whose pin, text block, connection point and outline follow its size. */
const box = (width: number, height: number, extra = '') =>
	shape(
		'6',
		len('PinX', 2) +
			len('PinY', 2) +
			len('Width', width) +
			len('Height', height) +
			len('LocPinX', width / 2, 'Width*0.5') +
			len('LocPinY', height / 2, 'Height*0.5') +
			c('Angle', 0) +
			c('FlipX', 0) +
			c('FlipY', 0) +
			len('TxtWidth', width, 'Width*1') +
			c('LayerMember', '0') +
			extra +
			`<Section N="User"><Row N="Lookup">${c('Value', 0, 'IFERROR(CONTAINERSHEETREF(1,&quot;Swimlane&quot;)!User.Heading,&quot;&quot;)')}</Row></Section>` +
			`<Section N="Connection">${row(0, 'Connection', len('X', width, 'Width') + len('Y', height / 2, 'Height*0.5'))}</Section>` +
			`<Section N="Geometry" IX="0">${row(1, 'MoveTo', len('X', 0) + len('Y', 0))}${row(2, 'LineTo', len('X', width, 'Width*1') + len('Y', 0))}${row(3, 'LineTo', len('X', width, 'Width*1') + len('Y', height, 'Height*1'))}${row(4, 'LineTo', len('X', 0) + len('Y', 0))}</Section>`,
		'Type="Shape"',
	);
/** A 1D master, as Visio's Dynamic connector is. */
const wire = shape(
	'7',
	len('BeginX', 0) + len('BeginY', 0) + len('EndX', 1) + len('EndY', 0) + c('LayerMember', '1'),
	'Type="Shape"',
);
/** A group master with one sub-shape. */
const cluster = shape(
	'8',
	len('PinX', 1) +
		len('PinY', 1) +
		len('Width', 2) +
		len('Height', 2) +
		`<Shapes>${shape('9', len('PinX', 1, 'Sheet.8!Width*0.5') + len('PinY', 1) + len('Width', 1) + len('Height', 1), 'Type="Shape"')}</Shapes>`,
	'Type="Group"',
);
const MASTERS = [
	{
		id: '2',
		shapes: box(1, 0.75),
		attributes: 'NameU="Box" UniqueID="{00000000-0000-0000-0000-000000000002}"',
	},
	{
		id: '3',
		shapes: wire,
		attributes: 'NameU="Wire" UniqueID="{00000000-0000-0000-0000-000000000003}"',
	},
	{
		id: '4',
		shapes: box(2, 1),
		attributes: 'NameU="Wide" UniqueID="{00000000-0000-0000-0000-000000000004}"',
	},
	{
		id: '5',
		shapes: cluster,
		attributes: 'NameU="Cluster" UniqueID="{00000000-0000-0000-0000-000000000005}"',
	},
];
const instance = (id: string, x: number, y: number, contents = '', master = '2') =>
	shape(
		id,
		c('PinX', x) + c('PinY', y) + c('LayerMember', '0') + contents,
		`NameU="Box" Name="Box" Type="Shape" Master="${master}"`,
	);
/** A stencil connector glued from shape `from` to shape `to`, as Visio saves dynamic glue. */
const connector = (id: string, from: string, to: string) =>
	shape(
		id,
		c('BeginX', 2, '_WALKGLUE(BegTrigger,EndTrigger,WalkPreference)') +
			c('BeginY', 8.625, '_WALKGLUE(BegTrigger,EndTrigger,WalkPreference)') +
			c('EndX', 2, '_WALKGLUE(EndTrigger,BegTrigger,WalkPreference)') +
			c('EndY', 7.375, '_WALKGLUE(EndTrigger,BegTrigger,WalkPreference)') +
			c('LayerMember', '1') +
			c('BegTrigger', 2, `_XFTRIGGER(Sheet.${from}!EventXFMod)`) +
			c('EndTrigger', 2, `_XFTRIGGER(Sheet.${to}!EventXFMod)`),
		'Type="Shape" Master="3"',
	);
const glue = (id: string, from: string, to: string, toCell = 'PinX') =>
	`<Connect FromSheet="${id}" FromCell="BeginX" FromPart="9" ToSheet="${from}" ToCell="${toCell}" ToPart="3"/>` +
	`<Connect FromSheet="${id}" FromCell="EndX" FromPart="12" ToSheet="${to}" ToCell="${toCell}" ToPart="3"/>`;
const LAYERS = (lock = 0) =>
	`<Section N="Layer"><Row IX="0">${c('Name', 'Flowchart')}${c('Lock', lock)}</Row><Row IX="1">${c('Name', 'Connector')}${c('Lock', 0)}</Row></Section>`;
const THREE = instance('1', 2, 9, '<Text>Start</Text>') + instance('2', 2, 7) + instance('3', 2, 5);
const source = (
	options: {
		page?: string;
		connects?: string;
		lock?: number;
		masters?: typeof MASTERS;
		linked?: readonly number[];
		document?: string;
	} = {},
) =>
	fixture({
		...(options.document ? { document: options.document } : {}),
		masters: options.masters ?? MASTERS,
		pages: [
			{
				id: '0',
				contents: `<Shapes>${options.page ?? THREE}</Shapes>${options.connects ? `<Connects>${options.connects}</Connects>` : ''}`,
				pageCells: LAYERS(options.lock),
			},
		],
		edit: (zip) =>
			zip.file(
				'visio/pages/_rels/page1.xml.rels',
				relations(
					(options.linked ?? [1, 2, 3, 4])
						.map((index) => relation(`rId${index}`, 'master', `../masters/master${index}.xml`))
						.join(''),
				),
			),
	});
const part = async (bytes: Uint8Array, path: string) =>
	(await JSZip.loadAsync(bytes)).file(path)!.async('string');
const ids = async (bytes: Uint8Array) =>
	(await parseVsdx(bytes)).pages[0]!.shapes.map((item) => `${item.id}:${item.masterId ?? '-'}`);
const refused = async (bytes: Uint8Array, edits: VisioEdit[]) => {
	const before = bytes.slice();
	const error = await editVsdx(bytes, edits).then(
		() => undefined,
		(caught: { code?: string }) => caught,
	);
	expect(bytes).toEqual(before);
	return error?.code;
};
const remove = (shapeId: string): VisioEdit => ({ type: 'delete-shape', pageId: '0', shapeId });
const duplicate = (shapeId: string, newShapeId: string): VisioEdit => ({
	type: 'duplicate-shapes',
	pageId: '0',
	copies: [{ shapeId, newShapeId }],
	offsetX: 0.33,
	offsetY: -0.33,
});
const WIRED = {
	page: THREE + connector('4', '1', '2') + connector('5', '2', '3'),
	connects: glue('4', '1', '2') + glue('5', '2', '3'),
};

describe('deleting stencil instances', () => {
	it('removes the shape, keeps its master and releases a glued stencil connector as Visio does', async () => {
		const bytes = await source(WIRED);
		const saved = await editVsdx(bytes, [remove('3')]);
		expect(saved.changedParts).toEqual([PAGE]);
		expect(await ids(saved.bytes)).toEqual(['1:2', '2:2', '4:3', '5:3']);
		// The master stays in the document stencil, untouched.
		for (const path of ['visio/masters/masters.xml', 'visio/masters/master1.xml'])
			expect(await part(saved.bytes, path)).toBe(await part(bytes, path));
		const page = await part(saved.bytes, PAGE);
		// Recorded from Visio: the end keeps its place as plain values and loses its trigger formula.
		expect(page).toContain('<Cell N="EndX" V="2"/><Cell N="EndY" V="7.375"/>');
		expect(page).toContain('<Cell N="EndTrigger" V="2"/>');
		// The other end of that connector, and the other connector, stay glued.
		expect(page).toContain('<Cell N="BegTrigger" V="2" F="_XFTRIGGER(Sheet.2!EventXFMod)"/>');
		expect(page).not.toContain('ToSheet="3"');
		expect(page.match(/<Connect /g)).toHaveLength(3);
	});

	it('removes a stencil connector with its Connect rows, and the Connects element with the last', async () => {
		const bytes = await source({
			page: THREE + connector('4', '1', '2'),
			connects: glue('4', '1', '2'),
		});
		const saved = await editVsdx(bytes, [remove('4')]);
		expect(await ids(saved.bytes)).toEqual(['1:2', '2:2', '3:2']);
		expect(await part(saved.bytes, PAGE)).not.toContain('Connect');
	});

	it('removes a group instance with its sub-shapes', async () => {
		const group = shape(
			'7',
			c('PinX', 5) +
				c('PinY', 5) +
				`<Shapes>${shape('8', '', 'Type="Shape" MasterShape="9"')}</Shapes>`,
			'Type="Group" Master="5"',
		);
		const saved = await editVsdx(await source({ page: THREE + group }), [remove('7')]);
		expect(await ids(saved.bytes)).toEqual(['1:2', '2:2', '3:2']);
		expect(await part(saved.bytes, PAGE)).not.toContain('MasterShape');
	});

	it('respects protection from the master, a local lock and a locked layer', async () => {
		const locked = MASTERS.map((master) =>
			master.id === '2' ? { ...master, shapes: box(1, 0.75, c('LockDelete', 1)) } : master,
		);
		expect(await refused(await source({ masters: locked }), [remove('1')])).toBe(
			'EDIT_PROTECTED_CELL',
		);
		expect(
			await refused(await source({ page: instance('1', 2, 9, c('LockDelete', 1)) }), [remove('1')]),
		).toBe('EDIT_PROTECTED_CELL');
		// The instance may unlock itself over its master.
		await editVsdx(
			await source({ masters: locked, page: instance('1', 2, 9, c('LockDelete', 0)) }),
			[remove('1')],
		);
		expect(await refused(await source({ lock: 1 }), [remove('1')])).toBe('EDIT_PROTECTED_CELL');
	});

	it('refuses glue it cannot release, and a shape another formula reads', async () => {
		const odd = connector('4', '1', '2').replace('_XFTRIGGER(Sheet.2!EventXFMod)', 'Sheet.2!Width');
		expect(
			await refused(await source({ page: THREE + odd, connects: glue('4', '1', '2') }), [
				remove('2'),
			]),
		).toBe('EDIT_REFERENCED_DELETE');
		const reader = instance('2', 2, 7, c('TxtAngle', 0, 'Sheet.1!Angle'));
		expect(
			await refused(await source({ page: instance('1', 2, 9) + reader }), [remove('1')]),
		).toBeDefined();
	});
});

describe('duplicating and pasting stencil instances', () => {
	it('copies the instance as Visio does: same master and cells, new ID, name and pin', async () => {
		const bytes = await source(WIRED);
		const saved = await editVsdx(bytes, [duplicate('1', '6')]);
		expect(await ids(saved.bytes)).toEqual(['1:2', '2:2', '3:2', '4:3', '5:3', '6:2']);
		const page = await part(saved.bytes, PAGE);
		// Recorded from Visio: appended last, named after the new ID, glue stays with the source.
		expect(page).toContain(
			'<Shape ID="6" NameU="Box.6" Name="Box.6" Type="Shape" Master="2"><Cell N="PinX" V="2.33"/><Cell N="PinY" V="8.67"/><Cell N="LayerMember" V="0"/><Text>Start</Text></Shape></Shapes>',
		);
		expect(page.match(/<Connect /g)).toHaveLength(4);
		expect(page).not.toMatch(/Sheet="6"/);
	});

	it('gives the sub-shapes of a group instance new IDs', async () => {
		const group = shape(
			'7',
			c('PinX', 5) +
				c('PinY', 5) +
				`<Shapes>${shape('8', c('TxtWidth', 1, 'Sheet.7!Width*0.5'), 'Type="Shape" MasterShape="9"')}</Shapes>`,
			'Type="Group" Master="5"',
		);
		const saved = await editVsdx(await source({ page: THREE + group }), [duplicate('7', '20')]);
		const page = await part(saved.bytes, PAGE);
		expect(page).toContain('<Shape ID="20" Type="Group" Master="5"><Cell N="PinX" V="5.33"/>');
		// The copy's sub-shape follows the copy, not the source.
		expect(page).toContain(
			'<Shape ID="21" Type="Shape" MasterShape="9"><Cell N="TxtWidth" V="1" F="Sheet.20!Width*0.5"/>',
		);
	});

	it('refuses stencil lines and connectors, locked layers and a pin the shape computes', async () => {
		const bytes = await source(WIRED);
		expect(await refused(bytes, [duplicate('4', '6')])).toBe('UNSUPPORTED_DUPLICATE');
		expect(await refused(await source({ lock: 1 }), [duplicate('1', '6')])).toBe(
			'EDIT_PROTECTED_CELL',
		);
		const guarded = instance('1', 2, 9).replace('<Cell N="PinX" V="2"/>', c('PinX', 2, 'GUARD(2)'));
		expect(await refused(await source({ page: guarded }), [duplicate('1', '6')])).toBe(
			'UNSUPPORTED_INSTANCE_EDIT',
		);
	});

	it('pastes into the same drawing and refuses a drawing without that master', async () => {
		const bytes = await source(WIRED);
		const clipboard = await captureVisioClipboard(bytes, '0', ['1', '2']);
		expect(clipboard.masters).toEqual([
			{ id: '2', identity: '{00000000-0000-0000-0000-000000000002}||Box' },
		]);
		const paste = (target: Uint8Array) =>
			editVsdx(target, [
				{
					type: 'paste-shapes',
					pageId: '0',
					clipboard,
					copies: [
						{ shapeId: '1', newShapeId: '8' },
						{ shapeId: '2', newShapeId: '9' },
					],
					offsetX: 1,
					offsetY: 0,
				},
			]);
		const saved = await paste(bytes);
		expect(await ids(saved.bytes)).toEqual(['1:2', '2:2', '3:2', '4:3', '5:3', '8:2', '9:2']);
		expect(await part(saved.bytes, PAGE)).toMatch(
			/<Shape ID="9" NameU="Box\.9" Name="Box\.9" Type="Shape" Master="2"[^>]*><Cell N="PinX" V="3"\/>/,
		);
		// Another drawing: the same master ID names another master there.
		const other = MASTERS.map((master) =>
			master.id === '2'
				? { ...master, attributes: 'NameU="Box" UniqueID="{99999999-0000-0000-0000-000000000002}"' }
				: master,
		);
		await expect(paste(await source({ ...WIRED, masters: other }))).rejects.toMatchObject({
			code: 'CLIPBOARD_RESOURCE_MISMATCH',
			message: expect.stringContaining('another drawing'),
		});
		// The same master, but this page has no relationship to it.
		await expect(paste(await source({ ...WIRED, linked: [3] }))).rejects.toMatchObject({
			code: 'CLIPBOARD_RESOURCE_MISMATCH',
		});
		// A capture never takes a stencil connector or a shape that names an uncaptured one.
		await expect(captureVisioClipboard(bytes, '0', ['4'])).rejects.toMatchObject({
			code: 'UNSUPPORTED_CLIPBOARD',
		});
	});
});

describe('ordering, layers and locks of stencil instances', () => {
	const order = (shapeId: string, value: 'front' | 'back'): VisioEdit => ({
		type: 'reorder-shape',
		pageId: '0',
		shapeId,
		order: value,
	});

	it('moves an instance among instances and connectors, changing nothing else', async () => {
		const bytes = await source(WIRED);
		const saved = await editVsdx(bytes, [order('1', 'front')]);
		expect(await ids(saved.bytes)).toEqual(['2:2', '3:2', '4:3', '5:3', '1:2']);
		const before = await part(bytes, PAGE),
			after = await part(saved.bytes, PAGE);
		const first = before.slice(before.indexOf('<Shape ID="1"'), before.indexOf('<Shape ID="2"'));
		expect(after).toContain(`${first}</Shapes>`);
		expect(after.length).toBe(before.length);
		// A drawn shape can be reordered on a page that holds stencil shapes.
		const drawn = shape(
			'9',
			c('PinX', 1) + c('PinY', 1) + c('Width', 1) + c('Height', 1),
			'Type="Shape"',
		);
		expect(
			await ids(
				(await editVsdx(await source({ page: drawn + THREE }), [order('9', 'front')])).bytes,
			),
		).toEqual(['1:2', '2:2', '3:2', '9:-']);
	});

	it('refuses another display band, a selection lock in the master and a locked layer', async () => {
		const banded = MASTERS.map((master) =>
			master.id === '2' ? { ...master, shapes: box(1, 0.75, c('DisplayLevel', -25000)) } : master,
		);
		expect(await refused(await source({ masters: banded }), [order('1', 'front')])).toBe(
			'UNSUPPORTED_SHAPE_ORDER',
		);
		const locked = MASTERS.map((master) =>
			master.id === '2' ? { ...master, shapes: box(1, 0.75, c('LockSelect', 1)) } : master,
		);
		expect(await refused(await source({ masters: locked }), [order('1', 'front')])).toBe(
			'EDIT_PROTECTED_CELL',
		);
		expect(await refused(await source({ lock: 1 }), [order('1', 'front')])).toBe(
			'EDIT_PROTECTED_CELL',
		);
	});

	it('assigns an instance to layers with a local membership', async () => {
		const saved = await editVsdx(await source(), [
			{
				type: 'assign-layers',
				pageId: '0',
				shapeIds: ['1'],
				layerIds: ['0'],
				newLayers: ['Review'],
			},
		]);
		expect(await part(saved.bytes, PAGE)).toContain('<Cell N="LayerMember" V="0;2"/>');
		expect(await part(saved.bytes, 'visio/pages/pages.xml')).toContain('V="Review"');
	});

	it('refuses to move, resize, rotate or flip an instance on a locked layer', async () => {
		// The document style proves the movement locks off, as every Visio drawing's does.
		const document = `<StyleSheets><StyleSheet ID="0">${['LockMoveX', 'LockMoveY', 'LockWidth', 'LockHeight', 'LockAspect', 'LockDelete'].map((name) => c(name, 0)).join('')}</StyleSheet></StyleSheets>`;
		const bytes = await source({ lock: 1, document });
		for (const edit of [
			{ type: 'move-shape', pageId: '0', shapeId: '1', x: 4, y: 4 },
			{ type: 'resize-shape', pageId: '0', shapeId: '1', width: 2, height: 2 },
			{ type: 'rotate-shape', pageId: '0', shapeId: '1', angle: 1 },
			{ type: 'flip-shape', pageId: '0', shapeId: '1', axis: 'horizontal' },
		] as VisioEdit[])
			expect(await refused(bytes, [edit])).toBe('EDIT_PROTECTED_CELL');
		await editVsdx(await source({ document }), [
			{ type: 'move-shape', pageId: '0', shapeId: '1', x: 4, y: 4 },
		]);
	});
});

describe('drawn shapes beside stencil shapes', () => {
	it('follows a master that names Scratch and Connections rows from one, as formulas do', async () => {
		// Visio's Decision and Document masters read Scratch.X1 (the row with IX 0). The proof
		// that an edit leaves stencil shapes alone must find that row, or every edit is refused.
		const scratch =
			len('TxtHeight', 0.75, 'Height-Scratch.X1+Connections.Y1*0') +
			`<Section N="Scratch"><Row IX="0">${len('X', 0.1, 'Width*0.1')}</Row></Section>`;
		const masters = MASTERS.map((master) =>
			master.id === '2' ? { ...master, shapes: box(1, 0.75, scratch) } : master,
		);
		const saved = await editVsdx(await source({ masters }), [
			{ type: 'create-rectangle', pageId: '0', shapeId: '20', x: 6, y: 6, width: 1, height: 1 },
		]);
		expect(await ids(saved.bytes)).toEqual(['1:2', '2:2', '3:2', '20:-']);
	});
});

describe('grouping stencil instances', () => {
	const group: VisioEdit = {
		type: 'group-shapes',
		pageId: '0',
		shapeId: '9',
		memberIds: ['1', '2'],
	};

	it('groups instances with group-local pins and ungroups them back', async () => {
		const bytes = await source();
		const grouped = await editVsdx(bytes, [group]);
		const page = await part(grouped.bytes, PAGE);
		// The bounds Visio gives the same shapes: 1 by 2.75 around (2, 8).
		expect(page).toContain(
			'<Shape ID="9" Type="Group"><Cell N="PinX" V="2"/><Cell N="PinY" V="8"/><Cell N="Width" V="1"/><Cell N="Height" V="2.75"/>',
		);
		expect(page).toContain('Master="2"><Cell N="PinX" V="0.5"/><Cell N="PinY" V="2.375"/>');
		expect(page).toContain('Master="2"><Cell N="PinX" V="0.5"/><Cell N="PinY" V="0.375"/>');
		expect(await ids(grouped.bytes)).toEqual(['9:-', '3:2']);
		// The group moves as one sheet; its members stay instances.
		const moved = await editVsdx(grouped.bytes, [
			{ type: 'move-shape', pageId: '0', shapeId: '9', x: 5, y: 6 },
		]);
		expect(await part(moved.bytes, PAGE)).toContain('<Cell N="PinX" V="5"/><Cell N="PinY" V="6"/>');
		const back = await editVsdx(grouped.bytes, [
			{ type: 'ungroup-shape', pageId: '0', shapeId: '9' },
		]);
		expect(await part(back.bytes, PAGE)).toBe(await part(bytes, PAGE));
	});

	it('ungroups a group Visio made, turning its scaling formulas into values', async () => {
		const scaled = (id: string, y: number, factor: string) =>
			shape(
				id,
				c('PinX', 0.5, 'Sheet.9!Width*0.5') +
					c('PinY', y, `Sheet.9!Height*${factor}`) +
					c('Width', 1, 'Sheet.9!Width*1') +
					c('Height', 0.75, 'Sheet.9!Height*0.27272727272727') +
					c('LocPinX', 0.5, 'Inh') +
					c('LayerMember', '0'),
				'Type="Shape" Master="2"',
			);
		const native = shape(
			'9',
			c('PinX', 2) +
				c('PinY', 8) +
				c('Width', 1) +
				c('Height', 2.75) +
				c('LocPinX', 0.5, 'Width*0.5') +
				c('LocPinY', 1.375, 'Height*0.5') +
				c('Angle', 0) +
				`<Shapes>${scaled('1', 2.375, '0.86363636363636')}${scaled('2', 0.375, '0.13636363636364')}</Shapes>`,
			'Type="Group"',
		);
		const saved = await editVsdx(await source({ page: native }), [
			{ type: 'ungroup-shape', pageId: '0', shapeId: '9' },
		]);
		const page = await part(saved.bytes, PAGE);
		// As Visio's ungroup: page pins and the size as plain local values.
		expect(page).toContain(
			'<Shape ID="1" Type="Shape" Master="2"><Cell N="PinX" V="2"/><Cell N="PinY" V="9"/><Cell N="Width" V="1"/><Cell N="Height" V="0.75"/>',
		);
		expect(page).toContain(
			'<Shape ID="2" Type="Shape" Master="2"><Cell N="PinX" V="2"/><Cell N="PinY" V="7"/>',
		);
		expect(page).not.toContain('Sheet.9!');
	});

	it('refuses glued members, stencil connectors, a grouping lock and a rotated group', async () => {
		expect(await refused(await source(WIRED), [group])).toBe('UNSUPPORTED_GEOMETRY_EDIT');
		const free = await source({
			page: THREE + connector('4', '1', '2').replaceAll(/ F="[^"]*"/g, ''),
		});
		expect(
			await refused(free, [
				{ type: 'group-shapes', pageId: '0', shapeId: '9', memberIds: ['3', '4'] },
			]),
		).toBe('UNSUPPORTED_GROUP_EDIT');
		const locked = MASTERS.map((master) =>
			master.id === '2' ? { ...master, shapes: box(1, 0.75, c('LockGroup', 1)) } : master,
		);
		expect(await refused(await source({ masters: locked }), [group])).toBe('EDIT_PROTECTED_CELL');
		expect(await refused(await source({ lock: 1 }), [group])).toBe('EDIT_PROTECTED_CELL');
		const turned = (await part((await editVsdx(await source(), [group])).bytes, PAGE)).replace(
			'<Cell N="Angle" V="0"/>',
			'<Cell N="Angle" V="1"/>',
		);
		const rotated = await fixtureWithPage(turned);
		expect(await refused(rotated, [{ type: 'ungroup-shape', pageId: '0', shapeId: '9' }])).toBe(
			'UNSUPPORTED_GROUP_EDIT',
		);
	});
});

/** The standard fixture with page 1 replaced by saved page XML. */
async function fixtureWithPage(xml: string): Promise<Uint8Array> {
	const zip = await JSZip.loadAsync(await source());
	zip.file(PAGE, xml);
	return zip.generateAsync({ type: 'uint8array' });
}

describe('changing the master of a stencil instance', () => {
	const change = (masterId: string, shapeId = '1'): VisioEdit => ({
		type: 'change-shape',
		pageId: '0',
		shapeId,
		masterId,
	});

	it('keeps position, text, formatting and its own size, and inherits the rest from the new master', async () => {
		const sized =
			len('Width', 3) +
			len('Height', 1.5) +
			len('LocPinX', 1.5, 'Inh') +
			len('LocPinY', 0.75, 'Inh') +
			c('FillForegnd', '#ff0000') +
			`<Section N="Character"><Row IX="0">${c('Style', 1)}</Row></Section>` +
			`<Section N="Geometry" IX="0">${row(2, 'LineTo', len('X', 3, 'Inh'))}</Section>` +
			'<Text>Start</Text>';
		const bytes = await source({ page: instance('1', 2, 9, sized), linked: [1] });
		const saved = await editVsdx(bytes, [change('4')]);
		const page = await part(saved.bytes, PAGE);
		expect(await ids(saved.bytes)).toEqual(['1:4']);
		// Recorded from Visio: the local size, fill, character row, layer and text stay.
		expect(page).toContain(
			'<Shape ID="1" Type="Shape" Master="4" NameU="Wide" Name="Wide"><Cell N="PinX" V="2"/><Cell N="PinY" V="9"/><Cell N="LayerMember" V="0"/><Cell N="Width" V="3" U="IN"/><Cell N="Height" V="1.5" U="IN"/><Cell N="FillForegnd" V="#ff0000"/>',
		);
		expect(page).toContain(
			'<Section N="Character"><Row IX="0"><Cell N="Style" V="1"/></Row></Section>',
		);
		expect(page).toContain('<Text>Start</Text>');
		// The caches now follow the new master's formulas with the size the shape keeps.
		for (const cache of [
			'<Cell N="LocPinX" V="1.5" U="IN" F="Inh"/>',
			'<Cell N="LocPinY" V="0.75" U="IN" F="Inh"/>',
			'<Cell N="TxtWidth" V="3" U="IN" F="Inh"/>',
			'<Row T="Connection" IX="0"><Cell N="X" V="3" U="IN" F="Inh"/><Cell N="Y" V="0.75" U="IN" F="Inh"/></Row>',
			'<Row T="LineTo" IX="3"><Cell N="X" V="3" U="IN" F="Inh"/><Cell N="Y" V="1.5" U="IN" F="Inh"/></Row>',
		])
			expect(page).toContain(cache);
		// The page gains its relationship to the new master's part.
		expect(saved.changedParts).toEqual([PAGE]);
		expect(await part(saved.bytes, 'visio/pages/_rels/page1.xml.rels')).toContain(
			'../masters/master3.xml',
		);
		// Reopened, the shape is the new master's outline at its own size.
		const reopened = (await parseVsdx(saved.bytes)).pages[0]!.shapes[0]!;
		expect([reopened.width, reopened.height]).toEqual([3, 1.5]);
	});

	it('takes the size of the new master when the shape has none of its own', async () => {
		const saved = await editVsdx(await source({ page: instance('1', 2, 9) }), [change('4')]);
		expect(await part(saved.bytes, PAGE)).toContain(
			'<Shape ID="1" Type="Shape" Master="4" NameU="Wide" Name="Wide"><Cell N="PinX" V="2"/><Cell N="PinY" V="9"/><Cell N="LayerMember" V="0"/></Shape>',
		);
		const reopened = (await parseVsdx(saved.bytes)).pages[0]!.shapes[0]!;
		expect([reopened.width, reopened.height]).toEqual([2, 1]);
		// The same master is no change at all.
		const same = await source();
		expect((await editVsdx(same, [change('2')])).bytes).toEqual(same);
	});

	it('refuses what it cannot keep right', async () => {
		// A shape connectors are glued to keeps the size it shows, so the glue just stays.
		const wired = await editVsdx(await source(WIRED), [change('4')]);
		expect(await part(wired.bytes, PAGE)).toMatch(
			/<Shape ID="1" Type="Shape" Master="4"[^>]*>(?:<Cell [^>]*\/>)*<Cell N="Width" V="1" U="IN"\/>/,
		);
		const sized =
			instance('1', 2, 9, len('Width', 2) + len('Height', 1)) +
			instance('2', 2, 7) +
			instance('3', 2, 5);
		const kept = await editVsdx(
			await source({ ...WIRED, page: sized + connector('4', '1', '2') + connector('5', '2', '3') }),
			[change('4')],
		);
		expect((await part(kept.bytes, PAGE)).match(/<Connect /g)).toHaveLength(4);
		// Glue to a connection point, which the new master may not have.
		expect(
			await refused(
				await source({
					page: THREE + connector('4', '1', '2'),
					connects: glue('4', '1', '2', 'Connections.X1'),
				}),
				[change('4')],
			),
		).toBe('UNSUPPORTED_CHANGE_SHAPE');
		// 1D masters, group masters, a missing master, protection and a locked layer.
		expect(await refused(await source(), [change('3')])).toBe('UNSUPPORTED_CHANGE_SHAPE');
		expect(await refused(await source(), [change('5')])).toBe('UNSUPPORTED_CHANGE_SHAPE');
		expect(await refused(await source(), [change('77')])).toBeDefined();
		const locked = MASTERS.map((master) =>
			master.id === '2' ? { ...master, shapes: box(1, 0.75, c('LockReplace', 1)) } : master,
		);
		expect(await refused(await source({ masters: locked }), [change('4')])).toBe(
			'EDIT_PROTECTED_CELL',
		);
		expect(await refused(await source({ lock: 1 }), [change('4')])).toBe('EDIT_PROTECTED_CELL');
		// A local override of the old master's outline has no place in the new one.
		const reshaped = instance(
			'1',
			2,
			9,
			`<Section N="Geometry" IX="0">${row(2, 'LineTo', len('X', 0.5))}</Section>`,
		);
		expect(await refused(await source({ page: reshaped }), [change('4')])).toBe(
			'UNSUPPORTED_CHANGE_SHAPE',
		);
		// A drawn shape has no master to change.
		const drawn = shape(
			'1',
			c('PinX', 1) + c('PinY', 1) + c('Width', 1) + c('Height', 1),
			'Type="Shape"',
		);
		expect(await refused(await source({ page: drawn }), [change('4')])).toBe(
			'UNSUPPORTED_CHANGE_SHAPE',
		);
	});
});
