import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { editVsdx, type VisioEdit } from './edit';
import { parseVsdx } from './parser';
import { fixture, shape } from './test-fixtures';
import { visioAutoConnectShape } from './ui/auto-connect';
import {
	visioConnectorEndHandles,
	visioConnectorRouteOf,
	visioGlueableShape,
} from './ui/connection-points';
import { visioConnectorMovePreviews } from './ui/connector-preview';

const PAGE = 'visio/pages/page1.xml';
const c = (name: string, value: string | number, formula = '') =>
	`<Cell N="${name}" V="${value}"${formula ? ` F="${formula}"` : ''}/>`;
const row = (index: number, type: string, cells: string) =>
	`<Row T="${type}" IX="${index}">${cells}</Row>`;

/** A flowchart-like 2-D master: one inch by three quarters, two connection points, placeable. */
const BOX =
	c('PinX', 2) +
	c('PinY', 2) +
	c('Width', 1) +
	c('Height', 0.75) +
	c('LocPinX', 0.5, 'Width*0.5') +
	c('LocPinY', 0.375, 'Height*0.5') +
	c('Angle', 0) +
	c('FlipX', 0) +
	c('FlipY', 0) +
	c('ObjType', 1) +
	// Glue triggers name this cell; every Visio shape has it.
	c('EventXFMod', 0) +
	`<Section N="Connection">${row(0, 'Connection', c('X', 0) + c('Y', 0.375, 'Height*0.5'))}${row(1, 'Connection', c('X', 1, 'Width') + c('Y', 0.375, 'Height*0.5'))}</Section>` +
	`<Section N="Geometry" IX="0">${row(1, 'MoveTo', c('X', 0, 'Width*0') + c('Y', 0, 'Height*0'))}${row(2, 'LineTo', c('X', 1, 'Width*1') + c('Y', 0, 'Height*0'))}${row(3, 'LineTo', c('X', 1, 'Width*1') + c('Y', 0.75, 'Height*1'))}${row(4, 'LineTo', c('X', 0, 'Width*0') + c('Y', 0.75, 'Height*1'))}${row(5, 'LineTo', c('X', 0, 'Geometry1.X1') + c('Y', 0, 'Geometry1.Y1'))}</Section>`;
/** The cell form of Visio's Dynamic connector master: a transform that follows the ends. */
const DYNAMIC = (pinX = 'GUARD((BeginX+EndX)/2)') =>
	c('PinX', 1.5, pinX) +
	c('PinY', 1.5, 'GUARD((BeginY+EndY)/2)') +
	c('Width', 1, 'GUARD(EndX-BeginX)') +
	c('Height', -1, 'GUARD(EndY-BeginY)') +
	c('LocPinX', 0.5, 'GUARD(Width*0.5)') +
	c('LocPinY', -0.5, 'GUARD(Height*0.5)') +
	c('Angle', 0, 'GUARD(0DA)') +
	c('FlipX', 0, 'GUARD(FALSE)') +
	c('FlipY', 0, 'GUARD(FALSE)') +
	c('BeginX', 1) +
	c('BeginY', 2) +
	c('EndX', 2) +
	c('EndY', 1) +
	c('TxtPinX', 0, 'SETATREF(Controls.TextPosition)') +
	c('TxtPinY', -1, 'SETATREF(Controls.TextPosition.Y)') +
	c('ObjType', 2) +
	c('LayerMember', 0) +
	`<Section N="Control"><Row N="TextPosition">${c('X', 0)}${c('Y', -1)}${c('XDyn', 0, 'Controls.TextPosition')}${c('YDyn', -1, 'Controls.TextPosition.Y')}</Row></Section>` +
	`<Section N="Geometry" IX="0">${c('NoFill', 1)}${row(1, 'MoveTo', c('X', 0) + c('Y', 0))}${row(2, 'LineTo', c('X', 0) + c('Y', -1))}${row(3, 'LineTo', c('X', 1) + c('Y', -1))}</Section>`;

const WALK = '_WALKGLUE(BegTrigger,EndTrigger,WalkPreference)';
const WALK_END = '_WALKGLUE(EndTrigger,BegTrigger,WalkPreference)';
const box = (id: string, x: number, y: number, extra = '') =>
	shape(id, c('PinX', x) + c('PinY', y) + extra, 'Type="Shape" Master="2"');
/** The connector as Visio saves it between shapes 1 at (2,6) and 2 at (6,6): one level run. */
const LEVEL =
	c('PinX', 4, 'Inh') +
	c('PinY', 6, 'Inh') +
	c('Width', 3, 'GUARD(EndX-BeginX)') +
	c('Height', 0.25, 'GUARD(0.25DL)') +
	c('LocPinX', 1.5, 'Inh') +
	c('LocPinY', 0.125, 'Inh') +
	c('BeginX', 2.5, WALK) +
	c('BeginY', 6, WALK) +
	c('EndX', 5.5, WALK_END) +
	c('EndY', 6, WALK_END) +
	c('LayerMember', 1) +
	c('BegTrigger', 2, '_XFTRIGGER(Sheet.1!EventXFMod)') +
	c('EndTrigger', 2, '_XFTRIGGER(Sheet.2!EventXFMod)') +
	c('TxtPinX', 1.5, 'Inh') +
	c('TxtPinY', 0.125, 'Inh') +
	`<Section N="Control"><Row N="TextPosition">${c('X', 1.5)}${c('Y', 0.125)}${c('XDyn', 1.5, 'Inh')}${c('YDyn', 0.125, 'Inh')}</Row></Section>` +
	`<Section N="Geometry" IX="0">${row(1, 'MoveTo', c('Y', 0.125))}${row(2, 'LineTo', c('X', 3) + c('Y', 0.125))}<Row T="LineTo" IX="3" Del="1"/></Section>`;
const CONNECTS =
	'<Connects><Connect FromSheet="3" FromCell="EndX" FromPart="12" ToSheet="2" ToCell="PinX" ToPart="3"/><Connect FromSheet="3" FromCell="BeginX" FromPart="9" ToSheet="1" ToCell="PinX" ToPart="3"/></Connects>';
const source = (
	options: { page?: string; connector?: string; connects?: string; master?: string } = {},
) =>
	fixture({
		masters: [
			{ id: '2', shapes: shape('5', BOX, 'Type="Shape"') },
			{ id: '4', shapes: shape('5', options.master ?? DYNAMIC(), 'Type="Shape"') },
		],
		pages: [
			{
				id: '0',
				contents: `<Shapes>${options.page ?? box('1', 2, 6) + box('2', 6, 6)}${shape('3', options.connector ?? LEVEL, 'Type="Shape" Master="4"')}</Shapes>${options.connects ?? CONNECTS}`,
			},
		],
	});
const page = async (bytes: Uint8Array) =>
	(await JSZip.loadAsync(bytes)).file(PAGE)!.async('string');
const connector = async (bytes: Uint8Array, id = '3') =>
	new RegExp(`<Shape ID="${id}".*?</Shape>`, 's').exec((await page(bytes)).replace(/'/g, '"'))![0];
const move = (shapeId: string, x: number, y: number): VisioEdit => ({
	type: 'move-shape',
	pageId: '0',
	shapeId,
	x,
	y,
});
const refused = async (bytes: Uint8Array, edits: VisioEdit[]) =>
	editVsdx(bytes, edits).then(
		() => undefined,
		(error: { code?: string; message: string }) => error,
	);
const edited = async (bytes: Uint8Array, ...edits: VisioEdit[]) =>
	(await editVsdx(bytes, edits)).bytes;

describe("Visio's Dynamic connector (a stencil instance)", () => {
	it('follows a moved shape and is saved cell for cell as Visio saves it', async () => {
		// Recorded with scripts/record-visio-instance-connector.ps1: the same shapes and moves.
		const longer = await edited(await source(), move('2', 7, 6));
		expect(await connector(longer)).toBe(
			shape(
				'3',
				LEVEL.replace('"PinX" V="4"', '"PinX" V="4.5"')
					.replace('"Width" V="3"', '"Width" V="4"')
					.replace('"LocPinX" V="1.5"', '"LocPinX" V="2"')
					.replace('"EndX" V="5.5"', '"EndX" V="6.5"')
					.replaceAll('"TxtPinX" V="1.5"', '"TxtPinX" V="2"')
					.replace('<Cell N="X" V="1.5"/>', '<Cell N="X" V="2"/>')
					.replace('"XDyn" V="1.5"', '"XDyn" V="2"')
					.replace('<Cell N="X" V="3"/>', '<Cell N="X" V="4"/>'),
				'Type="Shape" Master="4"',
			),
		);
		// One bend: Visio leaves the first shape downwards and enters the second from its side.
		const bend = await connector(await edited(longer, move('2', 6, 3)));
		for (const cell of [
			c('PinX', 3.75, 'Inh') + c('PinY', 4.3125, 'Inh'),
			c('Width', 3.5, 'GUARD(EndX-BeginX)') + c('Height', -2.625, 'GUARD(EndY-BeginY)'),
			c('LocPinX', 1.75, 'Inh') + c('LocPinY', -1.3125, 'Inh'),
			c('BeginX', 2, WALK) + c('BeginY', 5.625, WALK),
			c('EndX', 5.5, WALK_END) + c('EndY', 3, WALK_END),
			c('TxtPinX', 0.4375, 'Inh') + c('TxtPinY', -2.625, 'Inh'),
			`<Row N="TextPosition">${c('X', 0.4375)}${c('Y', -2.625)}${c('XDyn', 0.4375, 'Inh')}${c('YDyn', -2.625, 'Inh')}</Row>`,
			// Only the master's row cells that differ are written; the MoveTo row is the master's.
			`<Section N="Geometry" IX="0">${row(2, 'LineTo', c('Y', -2.625))}${row(3, 'LineTo', c('X', 3.5) + c('Y', -2.625))}</Section>`,
		])
			expect(bend).toContain(cell);
		// A plumb run takes the quarter-inch box across it, with the path through its middle.
		const plumb = await connector(await edited(longer, move('2', 2, 3)));
		for (const cell of [
			c('Width', 0.25, 'GUARD(0.25DL)') + c('Height', -2.25, 'GUARD(EndY-BeginY)'),
			c('LocPinX', 0.125, 'Inh') + c('LocPinY', -1.125, 'Inh'),
			`${row(1, 'MoveTo', c('X', 0.125))}${row(2, 'LineTo', c('X', 0.125) + c('Y', -2.25))}<Row T="LineTo" IX="3" Del="1"/>`,
		])
			expect(plumb).toContain(cell);
		// The file still parses, with the connector where its ends say.
		const model = await parseVsdx(await edited(longer, move('2', 6, 3)));
		expect(model.pages[0]!.shapes.map((item) => item.id)).toContain('3');
	});

	it('follows a resized or rotated shape and a connection point', async () => {
		const up = await edited(await source(), move('2', 6, 8));
		expect(await connector(up)).toContain(c('BeginX', 2, WALK) + c('BeginY', 6.375, WALK));
		const wide = await edited(up, {
			type: 'resize-shape',
			pageId: '0',
			shapeId: '2',
			width: 2,
			height: 0.75,
		});
		expect(await connector(wide)).toContain(c('EndX', 5, WALK_END) + c('EndY', 8, WALK_END));
		const turned = await connector(
			await edited(wide, { type: 'rotate-shape', pageId: '0', shapeId: '2', angle: Math.PI / 6 }),
		);
		// The middle of the turned left side, as recorded: (5.134, 7.5).
		expect(turned).toMatch(/<Cell N="EndX" V="5\.13397459621556\d*" F="_WALKGLUE/);
		expect(turned).toContain(c('EndY', 7.5, WALK_END));
		// An end glued to a connection point goes where the point goes.
		const point = 'PAR(PNT(Sheet.2!Connections.X1,Sheet.2!Connections.Y1))';
		const glued = await source({
			page: box('1', 2, 6) + box('2', 6, 3),
			connector: LEVEL.replace(c('EndX', 5.5, WALK_END), c('EndX', 5.5, point)).replace(
				c('EndY', 6, WALK_END),
				c('EndY', 3, point),
			),
			connects: CONNECTS.replace(
				'ToCell="PinX" ToPart="3"',
				'ToCell="Connections.X1" ToPart="100"',
			),
		});
		const moved = await connector(await edited(glued, move('2', 7, 4)));
		for (const cell of [
			c('BeginX', 2, WALK) + c('BeginY', 5.625, WALK),
			c('EndX', 6.5, point) + c('EndY', 4, point),
			`${row(2, 'LineTo', c('Y', -1.625))}${row(3, 'LineTo', c('X', 4.5) + c('Y', -1.625))}`,
		])
			expect(moved).toContain(cell);
	});

	it('changes route, moves, unglues and glues again', async () => {
		const bytes = await edited(await source(), move('2', 6, 3));
		// Centre to centre: between the outlines along the line that joins the middles.
		const straight = await connector(
			await edited(bytes, {
				type: 'set-connector-route',
				pageId: '0',
				shapeId: '3',
				route: 'straight',
			}),
		);
		for (const cell of [
			c('BeginX', 2.5, WALK) + c('BeginY', 5.625, WALK),
			c('EndX', 5.5, WALK_END) + c('EndY', 3.375, WALK_END),
			c('ShapeRouteStyle', 16),
			`${row(2, 'LineTo', c('X', 3) + c('Y', -2.25))}<Row T="LineTo" IX="3" Del="1"/>`,
		])
			expect(straight).toContain(cell);
		const curved = await connector(
			await edited(bytes, {
				type: 'set-connector-route',
				pageId: '0',
				shapeId: '3',
				route: 'curved',
			}),
		);
		expect(curved).toContain(c('ConLineRouteExt', 2));
		expect(curved).toContain('<Row T="NURBSTo" IX="2"><Cell N="X" V="3.5" F="Width*1"/>');
		// Dragging an end away breaks its glue the way Visio does: the value stays, the formula goes.
		const free = await edited(bytes, {
			type: 'move-line-endpoint',
			pageId: '0',
			shapeId: '3',
			endpoint: 'end',
			x: 7,
			y: 7,
		});
		expect(await connector(free)).toContain(c('EndX', 7) + c('EndY', 7));
		expect(await page(free)).not.toContain('FromCell="EndX"');
		expect(await page(free)).toContain('FromCell="BeginX"');
		// Gluing it back writes Visio's end formula and trigger, to the shape or to a point.
		const again = await edited(free, {
			type: 'glue-connector',
			pageId: '0',
			shapeId: '3',
			endpoint: 'end',
			target: '2',
		});
		expect(await connector(again)).toContain(c('EndX', 5.5, WALK_END) + c('EndY', 3, WALK_END));
		expect(await page(again)).toContain(
			'<Connect FromSheet="3" FromCell="EndX" FromPart="12" ToSheet="2" ToCell="PinX" ToPart="3"/>',
		);
		const pointed = await edited(free, {
			type: 'glue-connector',
			pageId: '0',
			shapeId: '3',
			endpoint: 'end',
			target: '2',
			point: 1,
		});
		expect(await connector(pointed)).toContain(
			c('EndX', 6.5, 'PAR(PNT(Sheet.2!Connections.X2,Sheet.2!Connections.Y2))'),
		);
		// Moving the whole connector frees both ends.
		const dragged = await edited(bytes, move('3', 5, 5));
		expect(await page(dragged)).not.toContain('<Connect ');
		expect(await connector(dragged)).toContain(c('BeginX', 3.25) + c('BeginY', 6.3125));
	});

	it('glues a new connector to stencil shapes and routes around one in the way', async () => {
		const bytes = await source();
		const drawn = await edited(bytes, {
			type: 'create-line',
			pageId: '0',
			shapeId: '9',
			beginX: 2,
			beginY: 6,
			endX: 6,
			endY: 6,
			connect: { begin: '1', end: '2' },
			route: 'right-angle',
		});
		expect(await connector(drawn, '9')).toContain(c('BeginX', 2.5, WALK) + c('BeginY', 6, WALK));
		expect(await page(drawn)).toContain('FromSheet="9" FromCell="EndX" FromPart="12" ToSheet="2"');
		// A stencil shape between the two is an obstacle: the level run becomes a detour.
		const blocked = await source({
			page:
				box('1', 2, 6) + box('2', 8, 6) + box('4', 5, 6, c('Height', 3) + c('LocPinY', 1.5, 'Inh')),
		});
		const around = await connector(await edited(blocked, move('2', 8, 6.5)));
		expect(around).toContain(c('BeginX', 2.5, WALK) + c('BeginY', 6, WALK));
		// It turns a clearance (3/16 in.) before the shape in its way, as recorded.
		expect(around).toContain(row(2, 'LineTo', c('X', 1.8125) + c('Y', 0)));
		expect(around.match(/<Row T="LineTo"/g)!.length).toBeGreaterThan(3);
	});

	it('is offered by the editor rules and previewed along the route it will take', async () => {
		const model = (await parseVsdx(await source())).pages[0]!;
		const [one, two, line] = model.shapes;
		// Stencil shapes take glue (Connector tool, AutoConnect); the connector shows end handles.
		expect(visioGlueableShape(one)).toBe(true);
		expect(visioAutoConnectShape(model, '2')).toBe(two);
		expect(line!.kind).toBe('connector');
		expect(visioConnectorRouteOf(line!)).toBe('right-angle');
		expect(visioConnectorEndHandles(line!)).toBeDefined();
		// Dragging shape 2 three inches down previews the bend the core then saves.
		const [preview] = visioConnectorMovePreviews(model, new Set(['2']), { x: 0, y: -3 });
		expect(preview).toMatchObject({ connectorId: '3', route: 'right-angle' });
		expect(preview!.points.map((point) => [point.x, model.height - point.y])).toEqual([
			[2, 5.625],
			[2, 3],
			[5.5, 3],
		]);
	});

	it('drops the connector master as a connector with two free ends, as Visio saves one', async () => {
		const bytes = await source();
		const drop = (extra: object = {}): VisioEdit => ({
			type: 'insert-master-instance',
			pageId: '0',
			shapeId: '8',
			masterId: '4',
			x: 2,
			y: 1.5,
			...extra,
		});
		// Recorded from Visio: a connector from (1, 1) to (3, 2). Cells equal to the master's
		// (BeginX 1, PinY 1.5, the first Geometry row) are not written.
		const dropped = await edited(bytes, drop({ begin: { x: 1, y: 1 }, end: { x: 3, y: 2 } }));
		const trigger = '_XFTRIGGER(Sheet.8!EventXFMod)';
		expect(await connector(dropped, '8')).toBe(
			shape(
				'8',
				c('PinX', 2, 'Inh') +
					c('Width', 2, 'GUARD(EndX-BeginX)') +
					c('Height', 1, 'GUARD(EndY-BeginY)') +
					c('LocPinX', 1, 'Inh') +
					c('LocPinY', 0.5, 'Inh') +
					c('BeginY', 1) +
					c('EndX', 3) +
					c('EndY', 2) +
					c('BegTrigger', 1, trigger) +
					c('EndTrigger', 1, trigger) +
					c('TxtPinX', 0.5, 'Inh') +
					c('TxtPinY', 1, 'Inh') +
					`<Section N="Control"><Row N="TextPosition">${c('X', 0.5)}${c('Y', 1)}${c('XDyn', 0.5, 'Inh')}${c('YDyn', 1, 'Inh')}</Row></Section>` +
					`<Section N="Geometry" IX="0">${row(2, 'LineTo', c('Y', 1))}${row(3, 'LineTo', c('X', 2) + c('Y', 1))}</Section>`,
				'Type="Shape" Master="4"',
			),
		);
		// Without ends it keeps the master's own, carried to the drop point.
		const plain = await connector(await edited(bytes, drop({ x: 5, y: 5 })), '8');
		expect(plain).toContain(c('BeginX', 4.5) + c('BeginY', 5.5) + c('EndX', 5.5) + c('EndY', 4.5));
		// The new connector glues, follows and leaves the other shapes editable.
		const glued = await edited(
			dropped,
			{ type: 'glue-connector', pageId: '0', shapeId: '8', endpoint: 'begin', target: '1' },
			{ type: 'glue-connector', pageId: '0', shapeId: '8', endpoint: 'end', target: '2', point: 0 },
		);
		expect(await page(glued)).toContain('FromSheet="8" FromCell="EndX" FromPart="12" ToSheet="2"');
		const followed = await edited(
			await edited(glued, move('2', 6, 3)),
			{ type: 'create-rectangle', pageId: '0', shapeId: '20', x: 4, y: 9, width: 1, height: 1 },
			{ type: 'move-shape', pageId: '0', shapeId: '20', x: 4.5, y: 9 },
		);
		expect(await connector(followed, '8')).toContain(
			c('EndX', 5.5, 'PAR(PNT(Sheet.2!Connections.X1,Sheet.2!Connections.Y1))'),
		);
		// A 2-D master takes no ends, and a line master that is not the Dynamic connector is refused.
		expect(
			(await refused(bytes, [drop({ masterId: '2', begin: { x: 1, y: 1 }, end: { x: 2, y: 2 } })]))
				?.code,
		).toBe('INVALID_EDIT');
		const other = await source({ master: DYNAMIC('GUARD(BeginX+Width/2)') });
		const error = await refused(other, [drop()]);
		expect(error?.code).toBe('UNSUPPORTED_MASTER_INSTANCE');
		expect(error?.message).toMatch(/Dynamic connector/);
		const [, line] = (await parseVsdx(bytes)).masters!;
		expect(line).toMatchObject({ oneDimensional: true, dynamicConnector: true });
		expect((await parseVsdx(other)).masters![1]!.dynamicConnector).toBeUndefined();
	});

	it('refuses a stencil connector that is not built like the Dynamic connector', async () => {
		const bytes = await source({ master: DYNAMIC('GUARD(BeginX+Width/2)') });
		const before = bytes.slice();
		for (const edit of [
			move('2', 7, 6),
			move('3', 5, 5),
			{ type: 'set-connector-route', pageId: '0', shapeId: '3', route: 'curved' },
		] as VisioEdit[]) {
			const error = await refused(bytes, [edit]);
			expect(error?.code).toBe('UNSUPPORTED_GEOMETRY_EDIT');
			expect(error?.message).toMatch(/comes from a stencil/);
		}
		expect(bytes).toEqual(before);
		// A local cell Visio would not have written on the connector is not overwritten either.
		const odd = await source({ connector: LEVEL.replace(c('PinX', 4, 'Inh'), c('PinX', 4)) });
		expect((await refused(odd, [move('2', 7, 6)]))?.code).toBe('UNSUPPORTED_GEOMETRY_EDIT');
		// Resizing or rotating a connector is not a thing; its ends and route shape it.
		expect(
			(
				await refused(await source(), [
					{ type: 'rotate-shape', pageId: '0', shapeId: '3', angle: 1 },
				])
			)?.code,
		).toBe('UNSUPPORTED_GEOMETRY_EDIT');
	});
});

/**
 * Optional: recordings made by scripts/record-visio-instance-connector.ps1. They embed
 * Microsoft's masters, so they are never committed; point VISIO_NATIVE_CONNECTOR_DIR at them.
 */
const NATIVE = process.env.VISIO_NATIVE_CONNECTOR_DIR;
const STEPS: [string, string, VisioEdit[]][] = [
	['01-straight', '02-straight-longer', [move('2', 7, 6)]],
	['02-straight-longer', '03-bend', [move('2', 6, 3)]],
	['03-bend', '04-vertical', [move('2', 2, 3)]],
	['04-vertical', '05-bend-up', [move('2', 6, 8)]],
	[
		'05-bend-up',
		'06-target-resized',
		[{ type: 'resize-shape', pageId: '0', shapeId: '2', width: 2, height: 0.75 }],
	],
	[
		'06-target-resized',
		'07-target-rotated',
		[{ type: 'rotate-shape', pageId: '0', shapeId: '2', angle: 0.5235987755982988 }],
	],
	['13-point-glue', '14-point-glue-moved', [move('2', 7, 4)]],
];
describe.skipIf(!NATIVE || !existsSync(join(NATIVE, '01-straight.vsdx')))(
	'against Visio recordings',
	() => {
		/** Cells in document order, numbers rounded past Visio's sixteen printed digits. */
		const cells = async (bytes: Uint8Array) =>
			[...(await connector(bytes)).matchAll(/<(?:Cell|Row)[^>]*>/g)].map((match) =>
				match[0].replace(/V="(-?\d+\.\d{9,})"/g, (_, value) => `V="${Number(value).toFixed(9)}"`),
			);
		const native = (name: string) => new Uint8Array(readFileSync(join(NATIVE!, `${name}.vsdx`)));
		it.each(STEPS)('%s to %s matches Visio cell for cell', async (from, to, edits) => {
			const ours = await editVsdx(native(from), edits);
			expect(await cells(ours.bytes)).toEqual(await cells(native(to)));
		});
	},
);
