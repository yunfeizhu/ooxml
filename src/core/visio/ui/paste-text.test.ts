import { expect, it } from 'vitest';
import { editVsdx } from '../edit';
import { parseVsdx } from '../parser';
import { fixture } from '../test-fixtures';
import { visioPasteTextCommand, visioPasteTextValue } from './paste-text';

it('pastes clipboard text as one centred text box', async () => {
	const blank = await fixture({ pages: [{ id: '0', contents: '', width: 8, height: 6 }] });
	const page = (await parseVsdx(blank)).pages[0]!;
	const command = visioPasteTextCommand(page, 'First line\r\nSecond\u0007 line\n\n')!;
	expect(command).toMatchObject({
		type: 'create-text-box',
		x: 4,
		y: 3,
		text: 'First line\nSecond line',
	});
	const edited = await editVsdx(blank, [command]);
	const shape = (await parseVsdx(edited.bytes)).pages[0]!.shapes[0]!;
	expect(shape.text.plainText).toBe('First line\nSecond line');
	expect(visioPasteTextCommand(page, '   ')).toBeUndefined();
	expect(visioPasteTextCommand(page, 'x'.repeat(40_000))).toBeUndefined();
	expect(visioPasteTextValue('a\ud800b')).toBe('a�b');
	expect(visioPasteTextCommand({ ...page, drawingToPageScale: 2 }, 'scaled')).toMatchObject({
		x: 2,
		y: 1.5,
	});
});
