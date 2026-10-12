import { describe, expect, it } from 'vitest';
import { createVsdx } from '../create-document';
import { editVsdx } from '../edit';
import { parseVsdx } from '../parser';
import { visioSubprocessCommand } from './subprocess';

describe('subprocess commands', () => {
	it('plans Create New and Create from Selection that core accepts', async () => {
		const bytes = (
			await editVsdx(await createVsdx(), [
				{ type: 'create-rectangle', pageId: '0', shapeId: '1', x: 2, y: 3, width: 2, height: 1 },
				{ type: 'create-rectangle', pageId: '0', shapeId: '2', x: 6, y: 5, width: 2, height: 1 },
			])
		).bytes;
		const document = await parseVsdx(bytes);
		const page = document.pages[0]!;
		expect(visioSubprocessCommand(document, page, ['1', '2'], 'new')).toBeUndefined();
		expect(visioSubprocessCommand(document, page, ['9'], 'selection')).toBeUndefined();
		expect(visioSubprocessCommand(document, page, ['1'], 'new')).toEqual({
			type: 'create-subprocess',
			pageId: '0',
			newPageId: '1',
			name: 'Page-2',
			shapeId: '1',
		});
		const command = visioSubprocessCommand(document, page, ['1', '2'], 'selection')!;
		expect(command.selection).toEqual({
			shapeIds: ['1', '2'],
			shapeId: '3',
			x: 4,
			y: 4,
			width: 1.5,
			height: 0.75,
		});
		const moved = await parseVsdx((await editVsdx(bytes, [command])).bytes);
		expect(moved.pages.map((item) => item.shapes.map((shape) => shape.id))).toEqual([
			['3'],
			['1', '2'],
		]);
	});
});
