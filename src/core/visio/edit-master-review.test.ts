import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { editVsdx } from './edit';
import { analyzeVisioMasterFormula } from './formula-master';
import { assertVisioMasterIndependence } from './edit-master-scope';
import { VisioPackage } from './package';
import { cell, fixture, rectangle, section, row, shape } from './test-fixtures';

const dimensions = cell('PinX', 2) + cell('PinY', 3) + cell('Width', 2) + cell('Height', 1);
const target = shape('1', dimensions + rectangle + '<Text>Local</Text>');
const move = { type: 'move-shape' as const, pageId: '0', shapeId: '1', x: 4, y: 5 };
const master = (extra = '', id = '10', text = '<Text>Router</Text>') =>
	shape(id, dimensions + rectangle + extra + text);
const instance = (extra = '', attrs = 'Master="7" MasterShape="10"') => shape('2', extra, attrs);
const source = (masterShape = master(), pageInstance = instance(), unused = '') =>
	fixture({
		masters: [{ id: '7', shapes: masterShape }, ...(unused ? [{ id: '8', shapes: unused }] : [])],
		pages: [{ id: '0', contents: `<Shapes>${target}${pageInstance}</Shapes>` }],
	});
const refused = (promise: Promise<unknown>) =>
	expect(promise.then(() => 'saved')).rejects.toThrow();

describe('independent active master locality review', () => {
	it.each([
		'SETATREF(User.target)',
		'TEXTWIDTH(TheText)',
		'TEXTHEIGHT(TheText,Width)',
		'SHAPETEXT(TheText)',
		'LUM("FillForegnd")',
		'STRSAME("a","b")',
	])('recognizes bounded local dependencies: %s', (formula) => {
		expect(analyzeVisioMasterFormula(formula, { textFieldFree: true }).dynamic).toBe(false);
	});
	it.each([
		'SETATREF(User.target,Width)',
		'SETATREF("User.target")',
		'SETATREFEVAL(User.target)',
		'TEXTWIDTH(Sheet.1!TheText)',
		'SHAPETEXT(Sheet.1!TheText)',
		'EVALCELL("Width")',
		'LUM("Sheet.1!Width")',
	])('refuses unknown or overloaded dependencies: %s', (formula) => {
		expect(analyzeVisioMasterFormula(formula, { textFieldFree: true }).dynamic).toBe(true);
	});
	it('keeps text measurement dynamic when fields are not ruled out', () => {
		expect(analyzeVisioMasterFormula('TEXTWIDTH(TheText)', { textFieldFree: false }).dynamic).toBe(
			true,
		);
	});
	it('moves an unrelated local shape beside an independent active master without changing its part', async () => {
		const extra =
			cell('LocPinX', 1, 'SETATREF(User.target)') +
			section(
				'User',
				row(0, '', cell('Value', 1)).replace('<Row IX="0"', '<Row N="target" IX="0"'),
			) +
			cell('TxtWidth', 1, 'TEXTWIDTH(TheText)');
		const bytes = await source(master(extra));
		const saved = await editVsdx(bytes, [move]);
		const before = await JSZip.loadAsync(bytes),
			after = await JSZip.loadAsync(saved.bytes);
		expect(await after.file('visio/masters/master1.xml')!.async('uint8array')).toEqual(
			await before.file('visio/masters/master1.xml')!.async('uint8array'),
		);
	});
	it('keeps master-local Sheet IDs distinct from matching page shape IDs', async () => {
		await expect(
			editVsdx(
				await source(
					master(cell('LocPinX', 1, 'Sheet.1!Width*0.5'), '1'),
					instance('', 'Master="7" MasterShape="1"'),
				),
				[move],
			),
		).resolves.toHaveProperty('bytes');
	});
	it('refuses a local instance override that brings a master dependency into the edited page closure', async () => {
		const extra =
			cell('LocPinX', 1, 'SETATREF(User.target)') +
			section('User', '<Row N="target">' + cell('Value', 1) + '</Row>');
		const override = section(
			'User',
			'<Row N="target">' + cell('Value', 2, 'Sheet.1!PinX') + '</Row>',
		);
		await refused(editVsdx(await source(master(extra), instance(override)), [move]));
	});
	// A formula the proof cannot follow reads its own shape unless it names another sheet. Every
	// Visio stencil shape carries some (menus, add-on calls, container lookups).
	it.each([
		'SETATREF(User.target,Width)',
		'SETATREF("User.target")',
		'INDIRECT("Width")',
		'UNKNOWN(Width)',
		'IFERROR(CONTAINERSHEETREF(1,"Swimlane")!User.Heading,"")',
		'UNKNOWN(ThePage!PageScale)',
	])('admits an opaque active master formula that names no other sheet: %s', async (formula) => {
		await expect(
			editVsdx(await source(master(cell('LocPinX', 1, formula.replaceAll('"', '&quot;')))), [move]),
		).resolves.toHaveProperty('bytes');
	});
	it.each([
		'INDIRECT("Sheet.1!PinX")',
		'UNKNOWN(Sheet.1!PinX)',
		'UNKNOWN(Local!PinX)',
		'UNKNOWN(CONTAINERSHEETREF(1)!PinX)',
	])('refuses an opaque active master formula that names a sheet: %s', async (formula) => {
		await refused(
			editVsdx(await source(master(cell('LocPinX', 1, formula.replaceAll('"', '&quot;')))), [move]),
		);
	});
	it('admits active master text measurement with inherited text field placeholders', async () => {
		await expect(
			editVsdx(
				await source(
					master(
						cell('TxtWidth', 1, 'TEXTWIDTH(TheText)'),
						'10',
						'<Text><fld IX="0">Router</fld></Text>',
					),
				),
				[move],
			),
		).resolves.toHaveProperty('bytes');
	});
	it('refuses unresolved master Sheet references rather than resolving them against a page ID', async () => {
		await refused(
			editVsdx(await source(master(cell('LocPinX', 1, 'SETATREF(Sheet.1!Width)'))), [move]),
		);
	});
	it('refuses ambiguous or nonexistent MasterShape mappings', async () => {
		await refused(
			editVsdx(await source(master() + master('', '11'), instance('', 'Master="7"')), [move]),
		);
		await refused(
			editVsdx(await source(master(), instance('', 'Master="7" MasterShape="999"')), [move]),
		);
	});
	it('preserves unused unknown master definitions beside an independently provable active master', async () => {
		await expect(
			editVsdx(await source(master(), instance(), master(cell('LocPinX', 1, 'UNKNOWN(Width)'))), [
				move,
			]),
		).resolves.toHaveProperty('bytes');
	});
	it('refuses an instance formula reading a missing cell on an existing non-master page shape', async () => {
		const bytes = await fixture({
			masters: [{ id: '7', shapes: master() }],
			pages: [
				{
					id: '0',
					contents: `<Shapes>${target}${instance(cell('LocPinX', 1, 'Sheet.3!User.absent'))}${shape('3', dimensions + rectangle)}</Shapes>`,
				},
			],
		});
		await refused(editVsdx(bytes, [move]));
	});
	it('refuses formulas outside the supported master sheet-cell locations', async () => {
		const bytes = await source(
			master().replace('<Shape ID="10"', '<Shape ID="10" F="UNKNOWN(Width)"'),
		);
		await refused(editVsdx(bytes, [move]));
	});
	it('follows text fields inherited from a master Field section', async () => {
		const field = (formula = '') => section('Field', row(0, '', cell('Value', 1, formula)));
		await expect(
			editVsdx(await source(master(cell('TxtWidth', 1, 'TEXTWIDTH(TheText)') + field())), [move]),
		).resolves.toHaveProperty('bytes');
		// A field that reads the moved shape still refuses the edit.
		await refused(
			editVsdx(
				await source(master(cell('TxtWidth', 1, 'TEXTWIDTH(TheText)') + field('Sheet.1!PinX'))),
				[move],
			),
		);
	});
	it('resolves named Controls default X references through existing local cells', async () => {
		const controls =
			'<Section N="Controls"><Row IX="0" N="Row_1"><Cell N="X" V="1"/><Cell N="Y" V="1"/></Row></Section>';
		await expect(
			editVsdx(await source(master(controls + cell('LocPinX', 1, 'Controls.Row_1'))), [move]),
		).resolves.toHaveProperty('bytes');
	});
	it('rebinds named Controls aliases when a local index-only override blocks the template formula', async () => {
		const controls =
			'<Section N="Controls"><Row IX="0" N="Row_1"><Cell N="X" V="1" F="UNKNOWN(Width)"/><Cell N="Y" V="1"/></Row></Section>';
		const override =
			'<Section N="Controls"><Row IX="0"><Cell N="X" V="1" F="No Formula"/></Row></Section>';
		await expect(
			editVsdx(
				await source(master(controls + cell('LocPinX', 1, 'Controls.Row_1')), instance(override)),
				[move],
			),
		).resolves.toHaveProperty('bytes');
	});
	it('refuses an affected indexed Controls override reached through a template named alias', async () => {
		const controls =
			'<Section N="Controls"><Row IX="0" N="Row_1"><Cell N="X" V="1"/><Cell N="Y" V="1"/></Row></Section>';
		const override =
			'<Section N="Controls"><Row IX="0"><Cell N="X" V="2" F="Sheet.1!PinX"/></Row></Section>';
		await refused(
			editVsdx(
				await source(master(controls + cell('LocPinX', 1, 'Controls.Row_1')), instance(override)),
				[move],
			),
		);
	});
	it('bounds multiplied effective master construction before allocating all bindings', async () => {
		const manyCells =
			'<Section N="User">' +
			Array.from({ length: 400 }, (_, i) => `<Row N="item${i}"><Cell N="Value" V="1"/></Row>`).join(
				'',
			) +
			'</Section>';
		const manyInstances = Array.from({ length: 120 }, (_, i) =>
			shape(String(i + 2), '', 'Master="7" MasterShape="10"'),
		).join('');
		const bytes = await source(master(manyCells), manyInstances);
		await expect(editVsdx(bytes, [move]).then(() => 'saved')).rejects.toThrow(
			/construction budget/,
		);
	});
	it('does not hide a selected line-style dependency behind a later category cell collision', async () => {
		const document =
			'<StyleSheets><StyleSheet ID="42"><Cell N="LineWeight" V="0.02" F="INDIRECT(&quot;Width&quot;)"/></StyleSheet><StyleSheet ID="43"><Cell N="LineWeight" V="0.02" F="No Formula"/></StyleSheet></StyleSheets>';
		const styled = master().replace(
			'<Shape ID="10"',
			'<Shape ID="10" LineStyle="42" FillStyle="43" TextStyle="43"',
		);
		const bytes = await fixture({
			document,
			masters: [{ id: '7', shapes: styled }],
			pages: [{ id: '0', contents: `<Shapes>${target}${instance()}</Shapes>` }],
		});
		await refused(editVsdx(bytes, [move]));
	});
	it('rejects a master read through an inherited local page cell before same-sheet edited dimensions', async () => {
		const document = `<StyleSheets><StyleSheet ID="42">${cell('LocPinX', 1, 'Width*0.5')}</StyleSheet></StyleSheets>`;
		const styledTarget = shape(
			'1',
			dimensions + cell('LocPinX', 1, 'Inh') + rectangle,
			'LineStyle="42" FillStyle="42" TextStyle="42"',
		);
		const bytes = await fixture({
			document,
			masters: [{ id: '7', shapes: master() }],
			pages: [
				{
					id: '0',
					contents: `<Shapes>${styledTarget}${instance(cell('LocPinX', 1, 'Sheet.1!LocPinX'))}</Shapes>`,
				},
			],
		});
		const pkg = await VisioPackage.open(bytes);
		const root = await pkg.readXml('visio/pages/page1.xml', 'PageContents');
		const resize = {
			type: 'resize-shape' as const,
			pageId: '0',
			shapeId: '1',
			width: 4,
			height: 2,
		};
		// Exercise the master proof directly so a separate style guard cannot conceal an unsafe proof.
		await refused(assertVisioMasterIndependence(pkg, new Map([['0', root]]), [resize], () => {}));
		await refused(editVsdx(bytes, [resize]));
	});
});
