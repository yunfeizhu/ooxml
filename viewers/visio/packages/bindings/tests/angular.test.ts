import { beforeEach, expect, it, vi } from 'vitest';
import { current, emit, reset } from './mock-binding';
import '@angular/compiler';
import { createApplication } from '@angular/platform-browser';
import {
	createComponent,
	provideZonelessChangeDetection,
	reflectComponentType,
} from '@angular/core';
import { VisioViewerComponent } from '../src/angular';
import { propertyKeys } from '../src/common';
beforeEach(reset);
it('Angular mounts with real native lifecycle and zoneless input/output updates', async () => {
	expect(
		reflectComponentType(VisioViewerComponent)
			?.inputs.map((input) => input.propName)
			.sort(),
	).toEqual([...propertyKeys, 'events'].sort());
	const host = document.createElement('div');
	document.body.append(host);
	const app = await createApplication({ providers: [provideZonelessChangeDetection()] });
	const component = createComponent(VisioViewerComponent, {
		environmentInjector: app.injector,
		hostElement: host,
	});
	const first = vi.fn();
	const latest = vi.fn();
	const native = vi.fn();
	component.setInput('document', null);
	component.setInput('pageIndex', 0);
	component.setInput('zoom', 2);
	component.setInput('showToolbar', false);
	component.setInput('events', { 'zoom-change': first });
	component.instance.zoomChange.subscribe(native);
	const changed = vi.fn();
	component.instance.documentChange.subscribe(changed);
	const selectionChanged = vi.fn();
	component.instance.selectionChange.subscribe(selectionChanged);
	const addIn = vi.fn();
	component.instance.ribbonAddIn.subscribe(addIn);
	app.attachView(component.hostView);
	component.changeDetectorRef.detectChanges();
	const change = {
		document: { format: 'vsdx' as const, pages: [], diagnostics: [] },
		dirty: true,
		kind: 'edit' as const,
	};
	emit('document-change', change);
	expect(changed).toHaveBeenCalledWith(change);
	const selection = Object.freeze([{ id: 'shape', name: 'Shape', pageId: 'page' }]);
	emit('selection-change', selection);
	expect(selectionChanged).toHaveBeenCalledWith(selection);
	emit('office-ribbon-add-in', { tab: 'reports', command: 'export' });
	expect(addIn).toHaveBeenCalledWith({ tab: 'reports', command: 'export' });
	const live = current();
	const retained = component.instance;
	await retained.replacePlainText('page', 'shape', 'Changed');
	expect(live.binding.replacePlainText).toHaveBeenCalledWith('page', 'shape', 'Changed');
	await retained.undo();
	await retained.redo();
	retained.cancelEdit();
	expect(live.binding.undo).toHaveBeenCalledOnce();
	expect(live.binding.redo).toHaveBeenCalledOnce();
	expect(live.binding.cancelEdit).toHaveBeenCalledOnce();
	expect(retained.exportVsdx().dirty).toBe(true);
	retained.setLayerVisibility('background', '0', true);
	expect(live.binding.setLayerVisibility).toHaveBeenCalledWith('background', '0', true);
	retained.resetLayerVisibility('background');
	expect(live.binding.resetLayerVisibility).toHaveBeenCalledWith('background');
	expect(live.options).toMatchObject({ document: null, pageIndex: 0, zoom: 2, showToolbar: false });
	component.setInput('zoom', 3);
	component.setInput('showToolbar', true);
	component.setInput('events', { 'zoom-change': latest });
	component.changeDetectorRef.detectChanges();
	emit('zoom-change', 3);
	expect(current()).toBe(live);
	expect(first).not.toHaveBeenCalled();
	expect(latest).toHaveBeenCalledWith(3);
	expect(native).toHaveBeenCalledWith(3);
	component.setInput('events', undefined);
	component.changeDetectorRef.detectChanges();
	emit('zoom-change', 4);
	expect(latest).toHaveBeenCalledOnce();
	app.detachView(component.hostView);
	component.destroy();
	app.destroy();
	expect(live.destroy).toHaveBeenCalledOnce();
	expect(() => retained.fit()).toThrow('not mounted');
	expect(() => retained.setLayerVisibility('background', '0', null)).toThrow('not mounted');
	expect(() => retained.resetLayerVisibility()).toThrow('not mounted');
	host.remove();
});
