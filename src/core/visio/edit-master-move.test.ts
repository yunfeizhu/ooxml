import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { parseXml } from '../xml/index';
import { editVsdx, type VisioEdit } from './edit';
import { parseVsdx } from './parser';
import { VisioPackageError } from './package-common';
import { cell, fixture, rectangle, section, shape } from './test-fixtures';

const locks = ['LockMoveX', 'LockMoveY', 'LockWidth', 'LockHeight', 'LockAspect', 'LockDelete'];
const dimensions = (inherited = false) =>
	cell('PinX', 2) +
	cell('PinY', 3) +
	cell('Width', 3) +
	cell('Height', 3) +
	cell('LocPinX', 1.5, inherited ? 'Inh' : 'Width*0.5') +
	cell('LocPinY', 1.5, inherited ? 'Inh' : 'Height*0.5') +
	cell('Angle', 0);
const command = (): Extract<VisioEdit, { type: 'move-shape' }> => ({
	type: 'move-shape',
	pageId: '0',
	shapeId: '1',
	x: 5,
	y: 6,
});
const source = (
	options: {
		template?: string;
		templateAttrs?: string;
		local?: string;
		localAttrs?: string;
		sibling?: string;
		document?: string;
		trailing?: string;
	} = {},
) =>
	fixture({
		document:
			options.document ??
			`<StyleSheets><StyleSheet ID="0">${locks.map((name) => cell(name, 0)).join('')}</StyleSheet></StyleSheets>`,
		masters: [
			{
				id: '7',
				shapes: shape(
					'8',
					options.template ?? dimensions() + rectangle,
					options.templateAttrs ?? 'Type="Shape"',
				),
			},
		],
		pages: [
			{
				id: '0',
				contents: `<Shapes>${shape('1', options.local ?? dimensions(true) + rectangle, options.localAttrs ?? 'Type="Shape" Master="7"')}${options.sibling ?? ''}</Shapes>${options.trailing ?? ''}`,
			},
		],
	});
async function rejected(bytes: Uint8Array, commands: VisioEdit[] = [command()]) {
	const snapshot = bytes.slice();
	let error: unknown;
	try {
		await editVsdx(bytes, commands);
	} catch (caught) {
		error = caught;
	}
	expect(error).toBeInstanceOf(VisioPackageError);
	expect(bytes).toEqual(snapshot);
	return error as VisioPackageError;
}

describe('proven local master rotation-pin moves', () => {
	it('moves only explicit local pin leaves without detaching or changing inherited caches', async () => {
		const bytes = await source(),
			snapshot = bytes.slice();
		const result = await editVsdx(bytes, [command()]);
		expect(result.changedParts).toEqual(['visio/pages/page1.xml']);
		const before = await JSZip.loadAsync(bytes),
			after = await JSZip.loadAsync(result.bytes);
		for (const [path, part] of Object.entries(before.files))
			if (!part.dir && path !== result.changedParts[0])
				expect(await after.file(path)!.async('uint8array')).toEqual(await part.async('uint8array'));
		const doc = parseXml(await after.file('visio/pages/page1.xml')!.async('string'));
		const target = doc.documentElement.getElementsByTagName('Shape')[0]!;
		expect(target.getAttribute('Master')).toBe('7');
		const cached = Array.from(target.getElementsByTagName('Cell'));
		expect(
			cached
				.filter((node) => ['LocPinX', 'LocPinY'].includes(node.getAttribute('N')!))
				.map((node) => [node.getAttribute('V'), node.getAttribute('F')]),
		).toEqual([
			['1.5', 'Inh'],
			['1.5', 'Inh'],
		]);
		const scene = await parseVsdx(result.bytes);
		expect(scene.pages[0]!.shapes[0]!.transform.slice(4)).toEqual([3.5, 4.5]);
		expect(bytes).toEqual(snapshot);
	});
	it('keeps unsupported deletion atomic even after an admitted move', async () => {
		for (const edit of [{ type: 'delete-shape' as const, pageId: '0', shapeId: '1' }])
			expect((await rejected(await source(), [command(), edit])).code).toBe(
				'UNSUPPORTED_GEOMETRY_EDIT',
			);
	});
	it.each(['LockMoveX', 'LockMoveY'])(
		'refuses effective inherited movement protection %s',
		async (lock) => {
			expect(
				(await rejected(await source({ template: dimensions() + rectangle + cell(lock, 1) }))).code,
			).toBe('EDIT_PROTECTED_CELL');
		},
	);
	it.each(['GUARD(2)', 'SETATREF(User.Pin)', 'Inh'])(
		'refuses protected or inherited local PinX %s',
		async (formula) => {
			await rejected(
				await source({
					local: dimensions(true).replace(cell('PinX', 2), cell('PinX', 2, formula)) + rectangle,
				}),
			);
		},
	);
	it('refuses a guarded inherited master pin despite an unguarded local override', async () => {
		expect(
			(
				await rejected(
					await source({
						template:
							dimensions().replace(cell('PinX', 2), cell('PinX', 2, 'GUARD(2)')) + rectangle,
					}),
				)
			).code,
		).toBe('EDIT_PROTECTED_CELL');
	});
	it.each(['GUARD(2)', 'SETATREF(User.Pin)'])(
		'refuses protected style ancestry delegated by a template pin: %s',
		async (formula) => {
			const document = `<StyleSheets><StyleSheet ID="0">${locks.map((name) => cell(name, 0)).join('')}${cell('PinX', 2, formula)}</StyleSheet><StyleSheet ID="1" LineStyle="0">${cell('PinX', 2, 'Inh')}</StyleSheet></StyleSheets>`;
			const bytes = await source({
				document,
				templateAttrs: 'Type="Shape" LineStyle="1"',
				template: dimensions().replace(cell('PinX', 2), cell('PinX', 2, 'Inh')) + rectangle,
			});
			expect((await rejected(bytes)).code).toBe('EDIT_PROTECTED_CELL');
		},
	);
	it.each(['1', 'AND(1,1)', 'BITAND(3,1)'])(
		'refuses stale effective zero protection cache: %s',
		async (formula) => {
			expect(
				(
					await rejected(
						await source({ template: dimensions() + rectangle + cell('LockMoveX', 0, formula) }),
					)
				).code,
			).toBe('EDIT_PROTECTED_CELL');
		},
	);
	it('allows two successive moves while preserving master and inherited caches', async () => {
		const bytes = await source();
		const result = await editVsdx(bytes, [command(), { ...command(), x: 7, y: 8 }]);
		const scene = await parseVsdx(result.bytes);
		expect(scene.pages[0]!.shapes[0]!.transform.slice(4)).toEqual([5.5, 6.5]);
	});
	it('refuses two moved instances when one effective cache reads the other pin', async () => {
		const dependency = section(
			'User',
			'<Row N="Other">' + cell('Value', 2, 'Sheet.1!PinX') + '</Row>',
		);
		const bytes = await source({
			sibling: shape('2', dimensions(true) + rectangle + dependency, 'Type="Shape" Master="7"'),
		});
		await rejected(bytes, [command(), { ...command(), shapeId: '2' }]);
	});
	it('refuses a dimensional effective OneD zero cache', async () => {
		await rejected(
			await source({ template: dimensions() + rectangle + '<Cell N="OneD" V="0" U="DL"/>' }),
		);
	});
	it.each([
		'<Cell N="PinX" V="2" E="#VALUE!" F="No Formula"/>',
		'<Cell N="PinX" V="2" F="UNKNOWN(2)"/>',
	])('refuses unresolved inherited pin caches: %s', async (pin) => {
		await rejected(
			await source({ template: dimensions().replace(cell('PinX', 2), pin) + rectangle }),
		);
	});
	it('bounds aggregate preparation across repeated commands and lock formulas', async () => {
		const formula = `AND(${Array.from({ length: 120 }, () => '0').join(',')})`;
		const bytes = await source({
			template: dimensions() + rectangle + cell('LockMoveX', 0, formula),
		});
		expect((await rejected(bytes, Array.from({ length: 500 }, command))).code).toBe(
			'EDIT_UNSUPPORTED_PACKAGE_DEPENDENCY',
		);
	});
	it.each(['Type="Group"', 'Type="Foreign"', 'Type="Shape" Master="9"'])(
		'refuses unsafe effective template semantics %s',
		async (templateAttrs) => {
			await rejected(await source({ templateAttrs }));
		},
	);
	it('refuses effective 1D metadata and glued connections', async () => {
		await rejected(await source({ template: dimensions() + rectangle + cell('OneD', 1) }));
		await rejected(
			await source({
				sibling: shape('2', dimensions() + rectangle, 'Type="Shape"'),
				trailing:
					'<Connects><Connect FromSheet="2" ToSheet="1" FromCell="BeginX" ToCell="PinX"/></Connects>',
			}),
		);
	});
	it('recomputes direct and transitive inherited dependencies of a moved pin', async () => {
		// The pin-only proof refuses these; the instance path then refreshes the inherited caches,
		// as Visio does, instead of refusing the move.
		for (const [extra, caches] of [
			[cell('TxtPinX', 2, 'PinX'), ['<Cell N="TxtPinX" V="5" U="IN" F="Inh"/>']],
			[
				section(
					'User',
					'<Row N="A">' +
						cell('Value', 2, 'PinX') +
						'</Row><Row N="B">' +
						cell('Value', 2, 'User.A') +
						'</Row>',
				),
				[
					'<Row N="A"><Cell N="Value" V="5" F="Inh"/></Row>',
					'<Row N="B"><Cell N="Value" V="5" F="Inh"/></Row>',
				],
			],
		] as const) {
			const result = await editVsdx(await source({ template: dimensions() + rectangle + extra }), [
				command(),
			]);
			const page = await (
				await JSZip.loadAsync(result.bytes)
			)
				.file('visio/pages/page1.xml')!
				.async('string');
			for (const cache of caches) expect(page).toContain(cache);
		}
	});
	it('refuses local, other-instance and page cache dependencies on a master pin', async () => {
		const dependency = section(
			'User',
			'<Row N="Other">' + cell('Value', 2, 'Sheet.1!PinX') + '</Row>',
		);
		await rejected(
			await source({ local: dimensions(true) + rectangle + cell('TxtPinX', 2, 'PinX') }),
		);
		for (const attrs of ['Type="Shape"', 'Type="Shape" Master="7"'])
			await rejected(
				await source({ sibling: shape('2', dimensions(true) + rectangle + dependency, attrs) }),
			);
	});
	it('refuses unknown/dynamic effective dependencies and missing effective transform proof', async () => {
		await rejected(
			await source({
				template: dimensions() + rectangle + cell('TxtPinX', 2, 'INDIRECT(&quot;PinX&quot;)'),
			}),
		);
		await rejected(
			await source({
				template: dimensions().replace(cell('LocPinX', 1.5, 'Width*0.5'), '') + rectangle,
				local: dimensions(true).replace(cell('LocPinX', 1.5, 'Inh'), '') + rectangle,
			}),
		);
	});
});
