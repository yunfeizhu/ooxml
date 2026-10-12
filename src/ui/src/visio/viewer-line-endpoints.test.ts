// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { demoDocument } from 'ooxml-core/visio/ui';
import { ViewerLineEndpoints } from './viewer-line-endpoints';
import { ViewerController } from './controller';

afterEach(() => document.body.replaceChildren());
it('owns selected local handles, zoom sizing, tool changes and disposal', async () => {
	const model = structuredClone(demoDocument);
	const shape = model.pages[0]!.shapes[0]!;
	Object.assign(shape, {
		kind: 'connector',
		width: 2,
		height: 0,
		geometry: [{ path: 'M 0 0 L 2 0', fill: false, stroke: true }],
	});
	const controller = new ViewerController(async () => model);
	await controller.load(new Uint8Array([1]));
	controller.selectShape({ id: shape.id, name: shape.name, pageId: model.pages[0]!.id });
	const viewport = document.createElement('div');
	viewport.innerHTML = `<svg class="paper"><g data-shape-id="${shape.id}" data-selected="true"></g></svg>`;
	document.body.append(viewport);
	let active = true;
	const tool = new ViewerLineEndpoints(viewport, controller, {
		active: () => active,
		announce: vi.fn(),
	});
	const dispose = tool.wire();
	tool.render(controller.state);
	expect(viewport.querySelectorAll('[data-line-endpoint]')).toHaveLength(2);
	const firstRadius = Number(viewport.querySelector('circle')!.getAttribute('r'));
	controller.setZoom(controller.state.zoom * 2);
	tool.render(controller.state);
	expect(Number(viewport.querySelector('circle')!.getAttribute('r'))).toBe(firstRadius / 2);
	const other = model.pages[0]!.shapes[1]!;
	controller.selectShapes([
		{ id: shape.id, name: shape.name, pageId: model.pages[0]!.id },
		{ id: other.id, name: other.name, pageId: model.pages[0]!.id },
	]);
	tool.render(controller.state);
	expect(controller.state.selectedShape?.id).toBe(shape.id);
	expect(viewport.querySelectorAll('[data-line-endpoint]')).toHaveLength(0);
	controller.selectShape({ id: shape.id, name: shape.name, pageId: model.pages[0]!.id });
	tool.render(controller.state);
	expect(viewport.querySelectorAll('[data-line-endpoint]')).toHaveLength(2);
	active = false;
	tool.render(controller.state);
	expect(viewport.querySelectorAll('[data-line-endpoint]')).toHaveLength(0);
	active = true;
	tool.render(controller.state);
	dispose();
	expect(viewport.querySelectorAll('[data-line-endpoint]')).toHaveLength(0);
});
