import type { RibbonAddInCommandDetail, RibbonAddInTab } from '../../ribbon/index';
import type { VisioDocument } from '../index';

export interface ViewerProperties {
	document: VisioDocument | null;
	pageIndex: number;
	zoom: number;
	showToolbar: boolean;
	/** Tabs the host adds after Help, as an Office add-in does. */
	ribbonAddIns: readonly RibbonAddInTab[];
}
/** A page-scoped shape identity. Omitted pageId means the currently displayed page. */
export interface VisioShapeSelection {
	readonly id: string;
	readonly name: string;
	readonly pageId?: string;
}
export interface ViewerEvents {
	'document-load': VisioDocument;
	'document-change': {
		document: VisioDocument;
		dirty: boolean;
		kind: 'edit' | 'undo' | 'redo' | 'remote';
	};
	'document-error': Error;
	'page-change': number;
	'zoom-change': number;
	'shape-select': VisioShapeSelection | null;
	/** Ordered immutable selection; the first entry is the primary selectedShape. */
	'selection-change': readonly VisioShapeSelection[];
	/** A command of a host tab (`ribbonAddIns`) was chosen. */
	'office-ribbon-add-in': RibbonAddInCommandDetail;
}
export type ViewerCallbacks = {
	[K in keyof ViewerEvents]?: (detail: ViewerEvents[K]) => void;
};
export const propertyKeys = [
	'document',
	'pageIndex',
	'zoom',
	'showToolbar',
	'ribbonAddIns',
] as const satisfies readonly (keyof ViewerProperties)[];
export const eventKeys = [
	'document-load',
	'document-change',
	'document-error',
	'page-change',
	'zoom-change',
	'shape-select',
	'selection-change',
	'office-ribbon-add-in',
] as const satisfies readonly (keyof ViewerEvents)[];
// Adding a contract member must also update the inventories used by every adapter.
const allProperties: Record<
	Exclude<keyof ViewerProperties, (typeof propertyKeys)[number]>,
	never
> = {};
const allEvents: Record<Exclude<keyof ViewerEvents, (typeof eventKeys)[number]>, never> = {};
void allProperties;
void allEvents;
export type VsdxSource = ArrayBuffer | Uint8Array | Blob;
export interface ViewerOptions extends Partial<ViewerProperties> {
	events?: ViewerCallbacks;
}
