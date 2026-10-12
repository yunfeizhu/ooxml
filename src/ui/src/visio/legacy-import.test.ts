import { describe, it, expect, vi } from 'vitest';
import type { VisioDocument } from 'ooxml-core/visio';
import { ViewerController } from './controller';
import { demoDocument } from 'ooxml-core/visio/ui';
import { assertViewableDocument } from 'ooxml-core/visio/ui';

describe('legacy VSD preview routing', () => {
	it('accepts a bounded legacy scene while retaining the shared scene guards', () => {
		const legacy: VisioDocument = { ...structuredClone(demoDocument), format: 'vsd' };
		expect(() => assertViewableDocument(legacy)).not.toThrow();
		legacy.pages[0]!.width = Infinity;
		expect(() => assertViewableDocument(legacy)).toThrow('page width');
	});
	it('loads legacy scenes without enabling VSDX source editing or export', async () => {
		const legacy: VisioDocument = { ...structuredClone(demoDocument), format: 'vsd' };
		const editor = vi.fn();
		const controller = new ViewerController(async () => legacy, undefined, editor);
		await controller.load(new Uint8Array([1, 2]));
		expect(controller.state.document).toBe(legacy);
		expect(controller.state.edit.sourceAvailable).toBe(false);
		controller.cancelLoad();
		controller.cancelEdit();
		expect(controller.state.edit.sourceAvailable).toBe(false);
		expect(() => controller.exportVsdx()).toThrow('Open a .vsdx file');
		await expect(controller.replacePlainText('1', '1', 'x')).rejects.toThrow();
		expect(editor).not.toHaveBeenCalled();
		// A caller changing the mutable scene cannot grant source-format privileges.
		legacy.format = 'vsdx';
		expect(() => controller.exportVsdx()).toThrow('Open a .vsdx file');
		await expect(controller.undo()).rejects.toThrow('Open a .vsdx file');
		controller.destroy();
	});
	it('keeps original VSDX export enabled when returning from a legacy preview', async () => {
		const legacy: VisioDocument = { ...structuredClone(demoDocument), format: 'vsd' };
		const parser = vi.fn().mockResolvedValueOnce(legacy).mockResolvedValueOnce(demoDocument);
		const controller = new ViewerController(parser);
		await controller.load(new Uint8Array([1]));
		await controller.load(new Uint8Array([2, 3]));
		expect(controller.state.edit.sourceAvailable).toBe(true);
		expect([...controller.exportVsdx().bytes]).toEqual([2, 3]);
		controller.destroy();
	});
});
