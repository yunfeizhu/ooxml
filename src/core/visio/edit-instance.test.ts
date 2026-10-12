import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { editVsdx, type VisioEdit } from './edit';
import { parseVsdx } from './parser';
import { fixture, shape } from './test-fixtures';

const PAGE = 'visio/pages/page1.xml';
const MASTER = 'visio/masters/master1.xml';
const c = (name: string, value: string | number, formula = '', unit = '') =>
	`<Cell N="${name}" V="${value}"${unit ? ` U="${unit}"` : ''}${formula ? ` F="${formula}"` : ''}/>`;
const len = (name: string, value: number, formula = '') => c(name, value, formula, 'IN');
const row = (index: number, type: string, cells: string) =>
	`<Row T="${type}" IX="${index}">${cells}</Row>`;

/**
 * A stencil master shaped like Visio's flowchart ones: the size comes from User cells, the height
 * follows the text, and geometry, text block, connection points and a menu follow the size.
 */
const transform =
	len('PinX', 2) +
	len('PinY', 2) +
	len('Width', 1, 'User.DefaultWidth') +
	len('Height', 0.75, 'User.ResizeTxtHeight') +
	len('LocPinX', 0.5, 'Width*0.5') +
	len('LocPinY', 0.375, 'Height*0.5') +
	c('Angle', 0) +
	c('FlipX', 0) +
	c('FlipY', 0) +
	len('TxtPinX', 0.5, 'Width*0.5') +
	len('TxtPinY', 0.375, 'Height*0.5') +
	len('TxtWidth', 0.8, 'Width*0.8') +
	len('TxtHeight', 0.75, 'Height*1') +
	len('TxtLocPinX', 0.4, 'TxtWidth*0.5') +
	len('TxtLocPinY', 0.375, 'TxtHeight*0.5');
const sections = (geometry = len('X', 0.9, 'Width*1-Scratch.X1')) =>
	`<Section N="User"><Row N="DefaultWidth">${len('Value', 1, '1IN*DropOnPageScale')}</Row><Row N="DefaultHeight">${len('Value', 0.75)}</Row><Row N="ResizeTxtHeight">${len('Value', 0.75, 'MAX(User.DefaultHeight,CEILING(TEXTHEIGHT(TheText,TxtWidth),0.25))')}</Row></Section>` +
	`<Section N="Actions"><Row N="SetDefaultSize">${c('Action', 0, 'SETF(GetRef(Width),User.DefaultWidth)')}${c('Invisible', 1, 'AND(Height=User.DefaultHeight,Width=User.DefaultWidth)')}</Row><Row N="ResizeWithText">${c('Invisible', 1, 'IF(Height=User.ResizeTxtHeight,TRUE,FALSE)')}</Row></Section>` +
	`<Section N="Scratch"><Row IX="0">${len('X', 0.1, 'Width*0.1')}</Row></Section>` +
	`<Section N="Connection">${row(0, 'Connection', c('X', 0) + len('Y', 0.375, '0.5*Height'))}${row(1, 'Connection', len('X', 1, 'Width') + len('Y', 0.375, '0.5*Height'))}</Section>` +
	`<Section N="Geometry" IX="0">${c('NoFill', 0)}${row(1, 'MoveTo', len('X', 0, 'Width*0') + len('Y', 0, 'Height*0'))}${row(2, 'LineTo', geometry + len('Y', 0, 'Height*0'))}${row(3, 'LineTo', len('X', 1, 'Width*1') + len('Y', 0.75, 'Height*1'))}${row(4, 'LineTo', len('X', 0, 'Width*0') + len('Y', 0.75, 'Height*1'))}${row(5, 'LineTo', len('X', 0, 'Geometry1.X1') + len('Y', 0, 'Geometry1.Y1'))}</Section>`;
const master = (options: { cells?: string; geometry?: string; extra?: string } = {}) =>
	shape(
		'6',
		(options.cells ?? transform) +
			c('LayerMember', '0') +
			sections(options.geometry) +
			(options.extra ?? ''),
		'Type="Shape"',
	);
const instance = (contents = '', id = '1') =>
	shape(
		id,
		c('PinX', 2) + c('PinY', 6) + c('LayerMember', '0') + contents,
		'Type="Shape" Master="2"',
	);
const LAYER = (lock = 0) =>
	`<Section N="Layer"><Row IX="0">${c('Name', 'Flowchart')}${c('Color', 255)}${c('Lock', lock)}</Row></Section>`;
const source = (
	options: {
		page?: string;
		definition?: string;
		lock?: number;
		document?: string;
		connects?: string;
	} = {},
) =>
	fixture({
		...(options.document ? { document: options.document } : {}),
		masters: [{ id: '2', shapes: options.definition ?? master() }],
		pages: [
			{
				id: '0',
				contents: `<Shapes>${options.page ?? instance()}</Shapes>${options.connects ?? ''}`,
				pageCells: LAYER(options.lock),
			},
		],
	});
const part = async (bytes: Uint8Array, path: string) =>
	(await JSZip.loadAsync(bytes)).file(path)!.async('string');
const resize = (width: number, height: number, extra: object = {}): VisioEdit => ({
	type: 'resize-shape',
	pageId: '0',
	shapeId: '1',
	width,
	height,
	...extra,
});
const first = async (bytes: Uint8Array) => (await parseVsdx(bytes)).pages[0]!.shapes[0]!;
const refused = async (bytes: Uint8Array, edits: VisioEdit[]) => {
	const before = bytes.slice();
	const error = await editVsdx(bytes, edits).then(
		() => undefined,
		(caught: { code?: string }) => caught,
	);
	expect(bytes).toEqual(before);
	return error?.code;
};

describe('resizing stencil (master) instances', () => {
	it('writes the size locally and refreshes the inherited caches, as Visio does', async () => {
		const bytes = await source();
		const saved = await editVsdx(bytes, [resize(2.5, 1.25)]);
		expect(saved.changedParts).toEqual([PAGE]);
		expect(await part(saved.bytes, MASTER)).toBe(await part(bytes, MASTER));
		const page = await part(saved.bytes, PAGE);
		// Local values, tagged with inches like Visio's; the pin is untouched.
		expect(page).toContain('<Cell N="Width" V="2.5" U="IN"/><Cell N="Height" V="1.25" U="IN"/>');
		expect(page).toContain('<Cell N="PinX" V="2"/><Cell N="PinY" V="6"/>');
		// Every inherited cell that follows the size keeps the master's formula.
		for (const cache of [
			'<Cell N="LocPinX" V="1.25" U="IN" F="Inh"/>',
			'<Cell N="LocPinY" V="0.625" U="IN" F="Inh"/>',
			'<Cell N="TxtWidth" V="2" U="IN" F="Inh"/>',
			'<Cell N="TxtLocPinX" V="1" U="IN" F="Inh"/>',
			'<Section N="Scratch"><Row IX="0"><Cell N="X" V="0.25" U="IN" F="Inh"/></Row></Section>',
			'<Row T="Connection" IX="1"><Cell N="X" V="2.5" U="IN" F="Inh"/><Cell N="Y" V="0.625" U="IN" F="Inh"/></Row>',
			'<Row T="LineTo" IX="2"><Cell N="X" V="2.25" U="IN" F="Inh"/></Row>',
			'<Row T="LineTo" IX="3"><Cell N="X" V="2.5" U="IN" F="Inh"/><Cell N="Y" V="1.25" U="IN" F="Inh"/></Row>',
			'<Row T="LineTo" IX="4"><Cell N="Y" V="1.25" U="IN" F="Inh"/></Row>',
			// The menu entry that follows the size is recomputed; the text-driven one is left to Visio.
			'<Section N="Actions"><Row N="SetDefaultSize"><Cell N="Invisible" V="0" F="Inh"/></Row></Section>',
		])
			expect(page).toContain(cache);
		// Unchanged values are not written: X of the first and last rows stay inherited.
		expect(page).not.toMatch(/<Row T="MoveTo"/);
		expect(page).not.toMatch(/<Row T="LineTo" IX="5"/);
		expect(page).not.toContain('ResizeWithText');
		const model = await first(saved.bytes);
		expect([model.width, model.height]).toEqual([2.5, 1.25]);
		expect(model.masterId).toBe('2');
	});

	it('updates the same caches on a second resize and accepts the master size again', async () => {
		const once = await editVsdx(await source(), [resize(2.5, 1.25)]);
		const twice = await editVsdx(once.bytes, [resize(4, 2)]);
		const page = await part(twice.bytes, PAGE);
		expect(page.match(/N="LocPinX"/g)).toHaveLength(1);
		expect(page.match(/<Section N="Geometry"/g)).toHaveLength(1);
		expect(page).toContain('<Row T="LineTo" IX="2"><Cell N="X" V="3.6" U="IN" F="Inh"/></Row>');
		const back = await editVsdx(twice.bytes, [resize(1, 0.75)]);
		const model = await first(back.bytes);
		expect([model.width, model.height]).toEqual([1, 0.75]);
		expect(await part(back.bytes, PAGE)).toContain('<Cell N="LocPinX" V="0.5" U="IN" F="Inh"/>');
		expect((await editVsdx(back.bytes, [resize(1, 0.75)])).changedParts).toEqual([]);
	});

	it('keeps the height asked for when the master sizes it from the text', async () => {
		// Only the width changes, but the inherited height formula needs text metrics.
		const saved = await editVsdx(await source(), [resize(2, 0.75)]);
		const page = await part(saved.bytes, PAGE);
		expect(page).toContain('<Cell N="Width" V="2" U="IN"/><Cell N="Height" V="0.75" U="IN"/>');
		// A master whose height is a plain value keeps inheriting it.
		const plain = await source({
			definition: master({ cells: transform.replace(' F="User.ResizeTxtHeight"', '') }),
		});
		const wide = await part((await editVsdx(plain, [resize(2, 0.75)])).bytes, PAGE);
		expect(wide).toContain('<Cell N="Width" V="2" U="IN"/>');
		expect(wide).not.toContain('N="Height"');
	});

	it('holds the opposite corner when resized from a handle, also when rotated', async () => {
		const saved = await editVsdx(await source(), [resize(2, 1.75, { anchor: { x: 0, y: 0 } })]);
		const model = await first(saved.bytes);
		// The bottom-left corner was at (1.5, 5.625) and stays there.
		expect(model.transform[4]).toBeCloseTo(1.5);
		expect(model.transform[5]).toBeCloseTo(5.625);
		expect(await part(saved.bytes, PAGE)).toContain(
			'<Cell N="PinX" V="2.5"/><Cell N="PinY" V="6.5"/>',
		);
		const turned = await source({ page: instance(c('Angle', Math.PI / 2)) });
		const before = await first(turned);
		const after = await first(
			(await editVsdx(turned, [resize(2, 0.75, { anchor: { x: 0, y: 0.5 } })])).bytes,
		);
		const corner = (m: readonly number[], height: number) => [
			m[4]! + m[2]! * (height / 2),
			m[5]! + m[3]! * (height / 2),
		];
		expect(corner(after.transform, 0.75)[0]).toBeCloseTo(corner(before.transform, 0.75)[0]!);
		expect(corner(after.transform, 0.75)[1]).toBeCloseTo(corner(before.transform, 0.75)[1]!);
	});

	it('rotates and flips with local cells only', async () => {
		const bytes = await source();
		const rotated = await editVsdx(bytes, [
			{ type: 'rotate-shape', pageId: '0', shapeId: '1', angle: 0.5 },
		]);
		expect(await part(rotated.bytes, PAGE)).toContain('<Cell N="Angle" V="0.5"/>');
		expect((await first(rotated.bytes)).rotation?.angle).toBeCloseTo(0.5);
		const flipped = await editVsdx(rotated.bytes, [
			{ type: 'flip-shape', pageId: '0', shapeId: '1', axis: 'horizontal' },
		]);
		const page = await part(flipped.bytes, PAGE);
		expect(page).toContain('<Cell N="FlipX" V="1"/>');
		expect(page).toContain('<Cell N="Angle" V="-0.5"/>');
		expect(await part(flipped.bytes, MASTER)).toBe(await part(bytes, MASTER));
	});

	it('moves an instance whose master reads its position, refreshing that cache', async () => {
		// The pin-only move proof refuses a master cell that reads PinX; this path recomputes it.
		const definition = master({
			extra: `<Section N="Control"><Row N="Row_1">${len('X', 1.5, 'PinX-Width*0.5')}${len('Y', 0)}</Row></Section>`,
		});
		const locks = ['LockMoveX', 'LockMoveY', 'LockWidth', 'LockHeight', 'LockAspect', 'LockDelete'];
		const document = `<StyleSheets><StyleSheet ID="0">${locks.map((name) => c(name, 0)).join('')}</StyleSheet></StyleSheets>`;
		const saved = await editVsdx(await source({ definition, document }), [
			{ type: 'move-shape', pageId: '0', shapeId: '1', x: 5, y: 6 },
		]);
		const page = await part(saved.bytes, PAGE);
		expect(page).toContain('<Cell N="PinX" V="5"/><Cell N="PinY" V="6"/>');
		expect(page).toContain(
			'<Section N="Control"><Row N="Row_1"><Cell N="X" V="4.5" U="IN" F="Inh"/></Row></Section>',
		);
		expect((await first(saved.bytes)).transform[4]).toBeCloseTo(4.5);
	});

	it('refuses to leave a glued connector behind', async () => {
		// Visio does not lay connectors out again on open, so one that cannot be rerouted here
		// (Visio's own Dynamic connector is a stencil instance too) stops the edit.
		const connector = shape(
			'9',
			len('BeginX', 2) + len('BeginY', 6) + len('EndX', 4) + len('EndY', 6),
			'Master="3"',
		);
		const bytes = await source({
			page: instance() + connector,
			connects:
				'<Connects><Connect FromSheet="9" FromCell="BeginX" FromPart="9" ToSheet="1" ToCell="PinX" ToPart="3"/></Connects>',
		});
		for (const edit of [
			resize(2, 1),
			{ type: 'move-shape', pageId: '0', shapeId: '1', x: 5, y: 6 },
			{ type: 'rotate-shape', pageId: '0', shapeId: '1', angle: 1 },
		] as VisioEdit[])
			// The connector check answers first, in plain words; the instance path would refuse too.
			expect(await refused(bytes, [edit])).toBe('UNSUPPORTED_GEOMETRY_EDIT');
		// Formatting does not move anything and stays possible.
		await editVsdx(bytes, [
			{ type: 'format-shape', pageId: '0', shapeId: '1', fillColor: '#ff0000' },
		]);
	});

	it('refuses what it cannot compute or may not change, leaving the file as it was', async () => {
		// A drawn cell with a function outside the evaluated subset.
		expect(
			await refused(
				await source({ definition: master({ geometry: len('X', 1, 'Width*ROUND(1,0)') }) }),
				[resize(2, 1)],
			),
		).toBe('EDIT_UNSUPPORTED_DEPENDENCY');
		const withCell = (cells: string) => source({ definition: master({ cells }) });
		expect(
			await refused(await withCell(transform.replace('User.DefaultWidth', 'GUARD(1IN)')), [
				resize(2, 0.75),
			]),
		).toBe('EDIT_PROTECTED_CELL');
		expect(await refused(await withCell(transform + c('LockWidth', 1)), [resize(2, 0.75)])).toBe(
			'EDIT_PROTECTED_CELL',
		);
		expect(await refused(await withCell(transform + c('LockAspect', 1)), [resize(2, 0.75)])).toBe(
			'EDIT_PROTECTED_CELL',
		);
		// LockAspect allows a proportional resize; LockHeight allows a wider shape.
		await editVsdx(await withCell(transform + c('LockAspect', 1)), [resize(2, 1.5)]);
		expect(
			await refused(await withCell(transform + c('LockRotate', 1)), [
				{ type: 'rotate-shape', pageId: '0', shapeId: '1', angle: 1 },
			]),
		).toBe('EDIT_PROTECTED_CELL');
		// Stencil lines and connectors, group masters and missing masters.
		expect(await refused(await withCell(transform + len('BeginX', 0)), [resize(2, 0.75)])).toBe(
			'UNSUPPORTED_GEOMETRY_EDIT',
		);
		expect(
			await refused(
				await source({
					definition: shape('6', transform + `<Shapes>${shape('7')}</Shapes>`, 'Type="Group"'),
				}),
				[resize(2, 1)],
			),
		).toBe('UNSUPPORTED_INSTANCE_EDIT');
		expect(
			await refused(
				await fixture({ pages: [{ id: '0', contents: `<Shapes>${instance()}</Shapes>` }] }),
				[resize(2, 1)],
			),
		).toBe('UNSUPPORTED_INSTANCE_EDIT');
		// Another shape that computes from this one cannot be recalculated.
		expect(
			await refused(
				await source({
					page: instance() + shape('2', len('Width', 1, 'Sheet.1!Width') + len('Height', 1)),
				}),
				[resize(2, 1)],
			),
		).toBe('EDIT_UNSUPPORTED_DEPENDENCY');
		expect(await refused(await source(), [resize(0, 1)])).toBeDefined();
	});
});

describe('formatting stencil (master) instances', () => {
	const target = { pageId: '0', shapeId: '1' } as const;

	it('writes fill, line and text formatting as local cells over the master', async () => {
		const bytes = await source({ page: instance('<Text>Label\n</Text>') });
		const saved = await editVsdx(bytes, [
			{
				type: 'format-shape',
				...target,
				fillColor: '#ff0000',
				lineColor: '#0000ff',
				lineWeight: 2,
			},
			{
				type: 'format-text',
				...target,
				bold: true,
				fontSize: 14,
				horizontalAlign: 'left',
				verticalAlign: 'top',
			},
		]);
		expect(saved.changedParts).toEqual([PAGE]);
		expect(await part(saved.bytes, MASTER)).toBe(await part(bytes, MASTER));
		const page = await part(saved.bytes, PAGE);
		expect(page).toContain('<Cell N="FillForegnd" V="#ff0000" F="RGB(255,0,0)"/>');
		expect(page).toContain('<Cell N="LineColor" V="#0000ff" F="RGB(0,0,255)"/>');
		expect(page).toContain('<Cell N="LineWeight" V="0.027777777777777776" U="PT"/>');
		expect(page).toContain('<Cell N="VerticalAlign" V="0"/>');
		expect(page).toMatch(
			/<Section N="Character"><Row IX="0"><Cell N="Size" V="0\.1944\d+" U="PT"\/><Cell N="Style" V="1"\/><\/Row><\/Section><Section N="Paragraph"><Row IX="0"><Cell N="HorzAlign" V="0"\/><\/Row><\/Section><Text>/,
		);
		// No size cell: the instance still inherits its geometry.
		expect(page).not.toContain('N="Width"');
		const model = await first(saved.bytes);
		expect(model.style.fill).toBe('#ff0000');
		expect(model.style.lineColor).toBe('#0000ff');
		expect(model.style.lineWidth * 72).toBeCloseTo(2);
		expect(model.text.runs[0]).toMatchObject({ bold: true });
		expect(model.text.runs[0]!.fontSize * 72).toBeCloseTo(14);
		expect(model.text.horizontalAlign).toBe('left');
		// The same formatting again changes nothing.
		expect(
			(await editVsdx(saved.bytes, [{ type: 'format-text', ...target, bold: true }])).changedParts,
		).toEqual([]);
	});

	it('overrides the master and its own earlier override, and survives a resize', async () => {
		const definition = master({
			extra: `<Section N="Character"><Row IX="0">${c('Style', 1)}${c('Size', 0.125, '', 'PT')}</Row></Section>`,
			cells: transform + c('FillForegnd', '#00ff00') + c('FillPattern', 1),
		});
		const bytes = await source({ definition, page: instance('<Text>Label\n</Text>') });
		// The master is already bold: asking for bold writes nothing.
		expect(
			(await editVsdx(bytes, [{ type: 'format-text', ...target, bold: true }])).changedParts,
		).toEqual([]);
		const plain = await editVsdx(bytes, [
			{ type: 'format-text', ...target, bold: false, italic: true },
		]);
		expect(await part(plain.bytes, PAGE)).toContain(
			'<Section N="Character"><Row IX="0"><Cell N="Style" V="2"/></Row></Section>',
		);
		const again = await editVsdx(plain.bytes, [
			{ type: 'format-text', ...target, bold: true },
			{ type: 'format-shape', ...target, fillColor: '#123456' },
			resize(2, 1),
		]);
		const page = await part(again.bytes, PAGE);
		expect(page.match(/N="Style"/g)).toHaveLength(1);
		expect(page).toContain('<Cell N="Style" V="3"/>');
		const model = await first(again.bytes);
		expect(model.style.fill).toBe('#123456');
		expect([model.width, model.height]).toEqual([2, 1]);
		expect(model.text.runs[0]).toMatchObject({ bold: true, italic: true });
		// Master size inherited from the master row, not restated.
		expect(model.text.runs[0]!.fontSize * 72).toBeCloseTo(9);
	});

	it('turns the text block (Rotate Text) with local proportional cells', async () => {
		const bytes = await source({ page: instance('<Text>Label\n</Text>') });
		const saved = await editVsdx(bytes, [
			{
				type: 'format-text',
				...target,
				textBlock: { x: 0.5, y: 0.5, width: 0.8, height: 1, angle: Math.PI / 2 },
			},
		]);
		const page = await part(saved.bytes, PAGE);
		expect(page).toMatch(/<Cell N="TxtAngle" V="1\.57079\d+" U="DEG"\/>/);
		// Cells that already hold these proportions in the master are not restated.
		expect(page).not.toContain('N="TxtWidth"');
		const text = (await first(saved.bytes)).text.transform;
		expect(Math.atan2(text[1], text[0])).toBeCloseTo(Math.PI / 2);
	});

	it('refuses protected, locked-layer and formula-fed formatting', async () => {
		const edit: VisioEdit = { type: 'format-shape', ...target, fillColor: '#ff0000' };
		expect(
			await refused(
				await source({ definition: master({ cells: transform + c('LockFormat', 1) }) }),
				[edit],
			),
		).toBe('EDIT_PROTECTED_CELL');
		expect(await refused(await source({ lock: 1 }), [edit])).toBe('EDIT_PROTECTED_CELL');
		// A master cell computed from the fill cannot be refreshed.
		expect(
			await refused(
				await source({
					definition: master({ cells: transform + c('LineColor', '#000000', 'FillForegnd') }),
				}),
				[edit],
			),
		).toBe('EDIT_UNSUPPORTED_FORMAT_DEPENDENCY');
		expect(
			await refused(
				await source({
					definition: shape('6', transform + `<Shapes>${shape('7')}</Shapes>`, 'Type="Group"'),
				}),
				[edit],
			),
		).toBe('UNSUPPORTED_FORMAT_EDIT');
	});
});
