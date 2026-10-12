import { expect, vi } from 'vitest';
import JSZip from 'jszip';
import { editVsdx, parseVsdx, type VisioEdit } from 'ooxml-core/visio';
import { ViewerController } from '../controller';
import { ViewerPointerGestures } from '../viewer-pointer-gestures';
import { wireViewerInputs } from '../viewer-input';
import { renderPage } from '../render-svg';
import { createVsdxFixture } from './fixture.mjs';

export async function pointerViewer(protectedSecond = false, source = true, resizable = false) {
	const zip = await JSZip.loadAsync(await createVsdxFixture('Movable'));
	const xml = await zip.file('visio/pages/page1.xml')!.async('string');
	const first = xml.match(/<Shape .*?<\/Shape>/s)![0];
	const second = first
		.replace('ID="1"', 'ID="2"')
		.replace('NameU="Import test"', 'NameU="Second"')
		.replace('N="PinX" V="4"', 'N="PinX" V="7"')
		.replace('<Text>', `${protectedSecond ? '<Cell N="LockMoveX" V="1"/>' : ''}<Text>`);
	zip.file('visio/pages/page1.xml', xml.replace('</Shapes>', second + '</Shapes>'));
	if (resizable) {
		const page = await zip.file('visio/pages/page1.xml')!.async('string');
		zip.file(
			'visio/pages/page1.xml',
			page
				.replaceAll('N="X" V="3"/>', 'N="X" V="3" F="Width"/>')
				.replaceAll('N="Y" V="1"/>', 'N="Y" V="1" F="Height"/>'),
		);
	}
	const bytes = await zip.generateAsync({ type: 'uint8array' });
	const edits: VisioEdit[][] = [];
	const controller = new ViewerController(
		parseVsdx,
		vi.fn(),
		async (bytes, commands) => {
			edits.push([...commands]);
			const result = await editVsdx(bytes, commands);
			return { ...result, document: await parseVsdx(result.bytes) };
		},
		async () => 'unused',
	);
	if (source) await controller.load(bytes);
	else controller.setDocument(await parseVsdx(bytes));
	const viewport = document.createElement('div');
	viewport.tabIndex = 0;
	document.body.append(viewport);
	const rendered = renderPage(controller.state.document!, controller.state.document!.pages[0]!);
	viewport.append(rendered.svg);
	const svg = rendered.svg;
	// Ten client pixels represent one physical page inch; production uses the browser's CTM.
	Object.defineProperty(svg, 'getScreenCTM', {
		value: () => ({ a: 10, b: 0, inverse: () => ({}) }),
		configurable: true,
	});
	vi.stubGlobal(
		'DOMPoint',
		class {
			constructor(
				public x: number,
				public y: number,
			) {}
			matrixTransform() {
				return { x: this.x / 10, y: this.y / 10 };
			}
		},
	);
	let active = true;
	const feedback: string[] = [];
	const tool = new ViewerPointerGestures(viewport, controller, {
		active: () => active,
		announce: (message) => feedback.push(message),
	});
	const dispose = tool.wire();
	const unsubscribe = controller.subscribe((state) => tool.render(state));
	const inputs = wireViewerInputs(
		{
			viewport,
			zoomSlider: document.createElement('input') as HTMLInputElement & { value: number },
		},
		controller,
		vi.fn(),
		(message) => feedback.push(message),
	);
	const group = (id = '1') => svg.querySelector<SVGGElement>(`[data-shape-id="${id}"]`)!;
	const select = (ids = ['1']) =>
		controller.selectShapes(
			ids.map((id) => ({ id, name: group(id).dataset.shapeName ?? '', pageId: '1' })),
		);
	const pointer = (
		type: string,
		target: Element,
		x = 40,
		y = 40,
		extra: Record<string, unknown> = {},
	) => {
		const event = new Event(type, { bubbles: true, cancelable: true });
		Object.defineProperties(
			event,
			Object.fromEntries(
				Object.entries({ pointerId: 7, button: 0, clientX: x, clientY: y, ...extra }).map(
					([key, value]) => [key, { value }],
				),
			),
		);
		target.dispatchEvent(event);
		return event;
	};
	const done = () => vi.waitFor(() => expect(controller.state.edit.busy).toBe(false));
	return {
		controller,
		viewport,
		svg,
		group,
		select,
		pointer,
		bytes,
		edits,
		feedback,
		done,
		inactive() {
			active = false;
			tool.render(controller.state);
		},
		dispose() {
			unsubscribe();
			dispose();
			inputs();
			rendered.dispose();
			controller.destroy();
		},
	};
}
