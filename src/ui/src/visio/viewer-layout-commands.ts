import type { ViewerController, ViewerState } from './controller';
import type { VisioLayoutAction } from './ribbon-action';
import type { RibbonCommand } from './ribbon-parts';
import { ViewerAutoConnect } from './viewer-auto-connect';
import { ViewerExplorer } from './viewer-explorer';
import { ViewerGuides } from './viewer-guides';
import { ViewerLayerAssign } from './viewer-layer-assign';
import { ViewerLayerProperties } from './viewer-layer-properties';
import { ViewerLayout } from './viewer-layout';
import { ViewerPasteSpecial } from './viewer-paste-special';
import { ViewerSelectType } from './viewer-select-type';

/** Where Help and Show Training lead: the viewer's own guide, not Microsoft's help. */
export const VISIO_GUIDE_URL = 'https://christophervr.github.io/ooxml/visio/';

export interface LayoutCommandHost {
	root: ShadowRoot;
	viewport: HTMLElement;
	/** The drawing window wrapper holding the rulers. */
	rulers: HTMLElement;
	controller: ViewerController;
	announce(message: string): void;
	/** The command runner shared with the other ribbon commands (status and focus handling). */
	edit(run: () => Promise<void>, message: string): void;
	/** Paste the viewer's own shape clipboard, as Ctrl+V does. */
	pasteShapes(): Promise<void>;
	/** Whether the Pointer tool is the current tool (AutoConnect arrows belong to it). */
	pointerTool(): boolean;
}

/**
 * Arrangement, layout, layers, selection, view aids and help commands: Auto Align & Space,
 * Re-Layout Page and its Layout dialog, Assign to Layer, Layer Properties, Select by Type, Paste Special, Guides,
 * Dynamic Grid, AutoConnect, Drawing Explorer, Help and Show Training.
 */
export class ViewerLayoutCommands {
	readonly layout: ViewerLayout;
	readonly layers: ViewerLayerAssign;
	readonly layerProperties: ViewerLayerProperties;
	readonly select: ViewerSelectType;
	readonly paste: ViewerPasteSpecial;
	readonly guides: ViewerGuides;
	readonly explorer: ViewerExplorer;
	readonly autoConnect: ViewerAutoConnect;
	constructor(private readonly host: LayoutCommandHost) {
		const { root, controller, announce } = host;
		this.layout = new ViewerLayout(root, controller, host.edit);
		this.layers = new ViewerLayerAssign(root, controller, announce);
		this.layerProperties = new ViewerLayerProperties(root, controller, announce);
		this.select = new ViewerSelectType(root, controller, announce);
		this.paste = new ViewerPasteSpecial(root, controller, announce, host.pasteShapes);
		this.guides = new ViewerGuides(root, host.viewport, host.rulers, controller, announce);
		this.explorer = new ViewerExplorer(root, controller, announce);
		this.autoConnect = new ViewerAutoConnect({
			root,
			viewport: host.viewport,
			controller,
			announce,
			edit: host.edit,
			pointerTool: host.pointerTool,
		});
	}
	run(action: VisioLayoutAction): void {
		switch (action.type) {
			case 'auto-align':
				return this.layout.autoAlign();
			case 're-layout':
				return this.layout.reLayout(action.style);
			case 'layout-options':
				return this.layout.showOptions();
			case 'assign-layers':
				return this.layers.open();
			case 'layer-properties':
				return this.layerProperties.open();
			case 'select-by-type':
				return this.select.open();
			case 'paste-special':
				return this.paste.open();
			case 'guides':
				return this.guides.toggleGuides();
			case 'dynamic-grid':
				return this.guides.toggleDynamicGrid();
			case 'auto-connect':
				return this.autoConnect.toggle();
			case 'drawing-explorer':
				return this.explorer.open();
			case 'help': {
				const view = this.host.root.ownerDocument.defaultView;
				view?.open(VISIO_GUIDE_URL, '_blank', 'noopener,noreferrer');
				this.host.announce(
					action.topic === 'help'
						? 'Opened the Visio viewer guide in a new tab.'
						: 'Opened the Visio viewer guide in a new tab; there are no training videos.',
				);
				return;
			}
		}
	}
	wire(): () => void {
		const guides = this.guides.wire(),
			autoConnect = this.autoConnect.wire();
		return () => {
			guides();
			autoConnect();
		};
	}
	close(): void {
		for (const dialog of [
			this.layout.options,
			this.layers.dialog,
			this.select.dialog,
			this.paste.dialog,
			this.explorer.dialog,
		])
			if (dialog.open) dialog.close();
	}
	render(state: ViewerState): void {
		this.layout.render(state);
		this.layers.render(state);
		this.layerProperties.render(state);
		this.select.render(state);
		this.paste.render(state);
		this.guides.render(state);
		this.explorer.render(state);
		this.autoConnect.render(state);
		const explorer = this.host.root.querySelector<RibbonCommand>('[command="drawing-explorer"]');
		if (explorer) explorer.disabled = !state.document;
	}
}
