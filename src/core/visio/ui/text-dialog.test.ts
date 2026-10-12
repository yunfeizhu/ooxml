import { describe, expect, it } from 'vitest';
import { parseVsdx, editVsdx } from '../index';
import { cell, fixture, rectangle, section, shape } from '../test-fixtures';
import { visioTextDialogPatch, visioTextDialogValues } from './text-dialog';

const source = () =>
	fixture({
		pages: [
			{
				id: '0',
				contents: `<Shapes>${shape(
					'1',
					cell('Width', 2) +
						cell('Height', 1) +
						rectangle +
						section('Paragraph', `<Row IX="0">${cell('Bullet', 2) + cell('SpLine', -1.5)}</Row>`) +
						'<Text>Hello</Text>',
				)}</Shapes>`,
			},
		],
	});

describe('Text dialog values', () => {
	it('reads defaults and writes only changed fields back through format-text', async () => {
		const bytes = await source();
		const shape = (await parseVsdx(bytes)).pages[0]!.shapes[0]!;
		const initial = visioTextDialogValues(shape);
		expect(initial).toMatchObject({
			fontSize: 10,
			bulletStyle: 2,
			lineSpacingKind: 'multiple',
			lineSpacing: 1.5,
			textBackground: 'none',
			language: 0,
			marginLeft: 2.88,
		});
		expect(visioTextDialogPatch(initial, initial)).toEqual({});
		const patch = visioTextDialogPatch(initial, {
			...initial,
			textCase: 'all-caps',
			marginTop: 6,
			lineSpacing: 2,
			language: 1036,
			bulletText: '*',
		});
		expect(patch).toEqual({
			textCase: 'all-caps',
			margins: { top: 6 },
			lineSpacing: { kind: 'multiple', value: 2 },
			language: 1036,
			bulletText: '*',
		});
		const saved = await editVsdx(bytes, [
			{ type: 'format-text', pageId: '0', shapeId: '1', ...patch },
		]);
		const after = visioTextDialogValues((await parseVsdx(saved.bytes)).pages[0]!.shapes[0]!);
		expect(after).toMatchObject({
			textCase: 'all-caps',
			marginTop: 6,
			lineSpacing: 2,
			language: 1036,
			bulletStyle: 1,
			bulletText: '*',
		});
	});
});
