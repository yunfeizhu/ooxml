import { expect, vi } from 'vitest';
import JSZip from 'jszip';
import {
	captureVisioClipboard,
	serializeVisioClipboard,
	editVsdx,
	parseVsdx,
	type VisioEdit,
} from 'ooxml-core/visio';
import { ViewerController } from '../controller';
import { ViewerCommands } from '../viewer-commands';
import { createRibbon } from '../ribbon';
import { createRulers } from '../viewer-ruler';
import { registerViewerControls } from '../office-ui';
import type { OfficeUiColorGrid } from '../../controls';
import type { ColorTarget } from '../ribbon-color-menu';
import { createVsdxFixture } from './fixture.mjs';

export async function setupFormattingViewer(source = true, mixedText = false) {
	registerViewerControls();
	const zip = await JSZip.loadAsync(await createVsdxFixture('Formatted shape'));
	const documentXml = await zip.file('visio/document.xml')!.async('string');
	zip.file(
		'visio/document.xml',
		documentXml.replace(
			'/>',
			'><FaceNames><FaceName ID="0" Name="Arial"/><FaceName ID="1" Name="Calibri"/></FaceNames></VisioDocument>',
		),
	);
	if (mixedText) {
		const pageXml = await zip.file('visio/pages/page1.xml')!.async('string');
		zip.file(
			'visio/pages/page1.xml',
			pageXml.replace(
				'<Text>Formatted shape</Text>',
				'<Section N="Character"><Row IX="0"><Cell N="Style" V="0"/></Row><Row IX="1"><Cell N="Style" V="1"/></Row></Section><Text><cp IX="0"/>Plain <cp IX="1"/>bold</Text>',
			),
		);
	}
	const bytes = await zip.generateAsync({ type: 'uint8array' });
	const edits: VisioEdit[][] = [];
	const controller = new ViewerController(
		parseVsdx,
		() => {},
		async (bytes, commands) => {
			edits.push([...commands]);
			const result = await editVsdx(bytes, commands);
			return { ...result, document: await parseVsdx(result.bytes) };
		},
		async (bytes, pageId, shapeIds) =>
			serializeVisioClipboard(await captureVisioClipboard(bytes, pageId, shapeIds)),
	);
	if (source) await controller.load(bytes);
	else controller.setDocument(await parseVsdx(bytes));
	const host = document.createElement('div');
	document.body.append(host);
	const root = host.attachShadow({ mode: 'open' });
	const viewport = document.createElement('div');
	viewport.tabIndex = 0;
	root.append(createRibbon(document), viewport);
	const feedback: string[] = [];
	const commands = new ViewerCommands({
		root,
		viewport,
		controller,
		rulers: createRulers(viewport),
		fit: () => {},
		togglePane: () => {},
		reveal: () => {},
		focusSearch: () => {},
		togglePanZoom: () => {},
		toggleSizePosition: () => {},
		announce: (message) => feedback.push(message),
	});
	const dispose = commands.wire();
	controller.subscribe((state) => commands.render(state));
	const button = (id: string) =>
		root.querySelector<HTMLElement & { disabled: boolean }>(`[command="${id}"]`)!;
	// Undo and Redo are on the title bar's Quick Access Toolbar, which this ribbon-only harness
	// does not mount: run the same history action they emit.
	const press = (id: string) =>
		id === 'undo' || id === 'redo'
			? commands.run({ type: 'history', key: id })
			: button(id).shadowRoot!.querySelector<HTMLButtonElement>('button')!.click();
	const combo = (id: string) =>
		root.querySelector<HTMLElement & { value: string; disabled: boolean }>(`[data-combo="${id}"]`)!;
	const select = (id: string, value: string) => {
		combo(id).value = value;
		combo(id).dispatchEvent(new Event('change', { bubbles: true }));
	};
	/** The colour picker inside Home > Fill, Line or Font Color. */
	const grid = (target: ColorTarget) =>
		root.querySelector<OfficeUiColorGrid>(
			`office-ui-menu-button office-ui-color-grid[data-color-grid="${target}"]`,
		)!;
	/** Click a swatch (`#rrggbb`), No Fill / No Line (`none`) or More Colors (`more`). */
	const pickColor = (target: ColorTarget, color: string) =>
		grid(target)
			.shadowRoot!.querySelector<HTMLButtonElement>(
				color.startsWith('#') ? `[data-color="${color}"]` : `[data-command="${color}"]`,
			)!
			.click();
	const done = () => vi.waitFor(() => expect(controller.state.edit.busy).toBe(false));
	const shape = () => controller.state.document!.pages[0]!.shapes[0]!;
	const selection = () => controller.selectShape({ id: '1', name: 'Import test', pageId: '1' });
	return {
		root,
		viewport,
		controller,
		commands,
		edits,
		bytes,
		feedback,
		button,
		press,
		grid,
		pickColor,
		combo,
		select,
		done,
		shape,
		selection,
		dispose,
	};
}
