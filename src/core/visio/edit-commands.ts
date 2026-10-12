import { fail } from './package-common';
import { isVisioOutlineShape, type VisioOutlineShape } from './stencil-shapes';
import {
	isVisioConnectorEdit,
	snapshotConnectorEdit,
	snapshotConnectorGlue,
	snapshotConnectorRoute,
	type VisioConnectorEdit,
	type VisioConnectorGlue,
	type VisioConnectorRoute,
} from './edit-connector-commands';
export { snapshotConnectorGlue } from './edit-connector-commands';
export type {
	VisioConnectorGlue,
	VisioConnectorRoute,
	VisioConnectorEdit,
	VisioAddConnectionPointEdit,
	VisioDeleteConnectionPointEdit,
	VisioGlueConnectorEdit,
	VisioConnectorRouteEdit,
} from './edit-connector-commands';
import { snapshotTextRanges, type VisioTextRangesEdit } from './edit-text-range-commands';
export type { VisioTextRange, VisioTextRangesEdit } from './edit-text-range-commands';
import { snapshotResizeAnchor, type VisioResizeAnchor } from './resize-anchor';
export type { VisioResizeAnchor } from './resize-anchor';
import { snapshotDuplicateShapes, type VisioDuplicateShapesEdit } from './edit-duplicate-commands';
export type { VisioDuplicateShapesEdit } from './edit-duplicate-commands';
import { snapshotPasteShapes, type VisioPasteShapesEdit } from './edit-paste-commands';
import { snapshotPathCreation, type VisioPathCreateEdit } from './edit-path-commands';
export type { VisioPathCreateEdit, VisioPathSegment } from './edit-path-commands';
import { snapshotChangeShape, type VisioChangeShapeEdit } from './edit-change-shape-commands';
export type { VisioChangeShapeEdit, VisioChangeShapeTarget } from './edit-change-shape-commands';
import { isVisioGroupEdit, snapshotGroupEdit, type VisioGroupEdit } from './edit-group-commands';
import {
	isVisioPageSetupEdit,
	snapshotPageSetupEdit,
	type VisioPageSetupEdits,
} from './edit-page-setup-commands';
export type {
	VisioPageSetupEdit,
	VisioPagePropertiesEdit,
	VisioPageDecorationEdit,
	VisioPageSetupEdits,
	VisioScaleUnit,
} from './edit-page-setup-commands';
import { snapshotShapeDataEdit, type VisioShapeDataEdit } from './edit-shape-data-commands';
export type {
	VisioShapeDataEdit,
	VisioShapeDataFields,
	VisioShapeDataType,
} from './edit-shape-data-commands';
import { isVisioDataEdit, snapshotDataEdit, type VisioDataEdit } from './edit-data-commands';
export type {
	VisioDataEdit,
	VisioDataImportEdit,
	VisioDataRefreshEdit,
	VisioDataDeleteEdit,
	VisioDataLinkEdit,
	VisioDataUnlinkEdit,
} from './edit-data-commands';
export type {
	VisioGroupEdit,
	VisioGroupShapesEdit,
	VisioUngroupShapeEdit,
} from './edit-group-commands';
export type { VisioPasteShapesEdit } from './edit-paste-commands';
import { snapshotPageTheme, type VisioPageThemeEdit } from './edit-page-theme-commands';
export type { VisioPageThemeEdit } from './edit-page-theme-commands';
import {
	isVisioCommentEdit,
	snapshotCommentEdit,
	type VisioCommentEdit,
} from './edit-comment-commands';
export type {
	VisioCommentEdit,
	VisioCommentAddEdit,
	VisioCommentUpdateEdit,
	VisioCommentDeleteEdit,
} from './edit-comment-commands';
import { snapshotSubprocessEdit, type VisioSubprocessEdit } from './edit-subprocess-commands';
export type { VisioSubprocessEdit, VisioSubprocessSelection } from './edit-subprocess-commands';
import {
	isVisioDiagramPartEdit,
	snapshotDiagramPartEdit,
	type VisioDiagramPartEdit,
} from './edit-diagram-parts-commands';
export type {
	VisioDiagramPartEdit,
	VisioInsertContainerEdit,
	VisioInsertCalloutEdit,
} from './edit-diagram-parts-commands';
import { snapshotAssignLayers, type VisioAssignLayersEdit } from './edit-layer-commands';
export type { VisioAssignLayersEdit } from './edit-layer-commands';
import { snapshotLayerProperties, type VisioLayerPropertiesEdit } from './edit-layer-properties';
export type { VisioLayerPropertiesEdit } from './edit-layer-properties';
import { snapshotMasterInstance, type VisioMasterInstanceEdit } from './edit-master-instance';
export type { VisioMasterInstanceEdit } from './edit-master-instance';
import { snapshotStencilMasterDrop, type VisioStencilMasterDropEdit } from './edit-master-drop';
export type { VisioStencilMasterDropEdit } from './edit-master-drop';
import { isVisioGuideEdit, snapshotGuideEdit, type VisioGuideEdit } from './edit-guide-commands';
export type { VisioGuideEdit } from './edit-guide-commands';
import { snapshotTextFieldInsert, type VisioTextFieldInsertEdit } from './edit-text-field-commands';
export type { VisioTextFieldInsertEdit } from './edit-text-field-commands';
import {
	isVisioFormatEdit,
	snapshotFormatting,
	type VisioFormatEdit,
} from './edit-formatting-commands';
import {
	isVisioMetadataEdit,
	snapshotMetadataEdit,
	snapshotPictureInsert,
	type VisioMetadataEdit,
	type VisioPictureInsertEdit,
} from './edit-metadata-commands';
export type {
	VisioMetadataEdit,
	VisioPictureInsertEdit,
	VisioShapeHyperlinkEdit,
	VisioShapeScreenTipEdit,
	VisioHyperlinkFields,
} from './edit-metadata-commands';
export type {
	VisioFormatEdit,
	VisioTextFormatEdit,
	VisioShapeFormatEdit,
} from './edit-formatting-commands';

export interface VisioShapeOrderEdit {
	type: 'reorder-shape';
	pageId: string;
	shapeId: string;
	order: 'front' | 'back' | 'forward' | 'backward';
}

export interface VisioTextEdit {
	type: 'replace-plain-text';
	pageId: string;
	shapeId: string;
	text: string;
}
interface Target {
	pageId: string;
	shapeId: string;
}
type BoxCreation = Target & { x: number; y: number; width: number; height: number; text?: string };
/** Drawing inches; bottom-left origin, up-positive rotation pin. Rotation angles use radians. */
export type VisioGeometryEdit =
	| (Target & {
			type: 'create-line';
			beginX: number;
			beginY: number;
			endX: number;
			endY: number;
			/** Present for a connector: the shapes (or connection points) each end is glued to. */
			connect?: VisioConnectorGlue;
			/** A connector's route; omitted means straight. */
			route?: VisioConnectorRoute;
	  })
	| (BoxCreation & { type: 'create-rectangle'; shape?: VisioOutlineShape })
	| (BoxCreation & { type: 'create-ellipse' })
	| (BoxCreation & { type: 'create-text-box'; text: string })
	| VisioPathCreateEdit
	| (Target & { type: 'move-shape'; x: number; y: number })
	| (Target & { type: 'resize-shape'; width: number; height: number; anchor?: VisioResizeAnchor })
	| (Target & { type: 'rotate-shape'; angle: number })
	| (Target & { type: 'flip-shape'; axis: 'horizontal' | 'vertical' })
	| (Target & { type: 'move-line-endpoint'; endpoint: 'begin' | 'end'; x: number; y: number })
	| (Target & { type: 'delete-shape' })
	| VisioConnectorEdit;
/** Insert a blank foreground page after an existing page, copying its PageSheet settings. */
export interface VisioPageInsert {
	type: 'insert-page';
	pageId: string;
	afterPageId: string;
	name: string;
}
/** Move an existing page to a zero-based index in the complete page list. */
export interface VisioPageReorder {
	type: 'reorder-page';
	pageId: string;
	index: number;
}
/** Rename the local page name; an already custom universal name is preserved. */
export interface VisioPageRename {
	type: 'rename-page';
	pageId: string;
	name: string;
}
/** Delete a page, preserving remaining page names (native Page.Delete(0)). */
export interface VisioPageDelete {
	type: 'delete-page';
	pageId: string;
}
/** Physical page inches. Select fixed custom mode; printer paper and shape positions are retained. */
export interface VisioPageSizeEdit {
	type: 'set-page-size';
	pageId: string;
	width: number;
	height: number;
}
export type VisioPageEdit =
	| VisioPageInsert
	| VisioPageReorder
	| VisioPageRename
	| VisioPageDelete
	| VisioPageSizeEdit
	| VisioPageSetupEdits;
export type VisioEdit =
	| VisioTextEdit
	| VisioTextRangesEdit
	| VisioTextFieldInsertEdit
	| VisioGeometryEdit
	| VisioPageEdit
	| VisioFormatEdit
	| VisioDuplicateShapesEdit
	| VisioPasteShapesEdit
	| VisioShapeOrderEdit
	| VisioChangeShapeEdit
	| VisioMetadataEdit
	| VisioPictureInsertEdit
	| VisioGroupEdit
	| VisioPageThemeEdit
	| VisioCommentEdit
	| VisioSubprocessEdit
	| VisioDiagramPartEdit
	| VisioShapeDataEdit
	| VisioDataEdit
	| VisioAssignLayersEdit
	| VisioLayerPropertiesEdit
	| VisioMasterInstanceEdit
	| VisioStencilMasterDropEdit
	| VisioGuideEdit;
export const isVisioPageEdit = (edit: VisioEdit): edit is VisioPageEdit =>
	edit.type === 'insert-page' ||
	edit.type === 'reorder-page' ||
	edit.type === 'rename-page' ||
	edit.type === 'delete-page' ||
	edit.type === 'set-page-size' ||
	isVisioPageSetupEdit(edit);

/** Potential direct changes used by both package and master dependency admission. */
export function geometryChangedCells(edit: VisioGeometryEdit): string[] {
	if (edit.type === 'add-connection-point' || edit.type === 'delete-connection-point') return [];
	if (
		edit.type === 'create-line' ||
		edit.type === 'glue-connector' ||
		edit.type === 'set-connector-route'
	)
		return [
			'BeginX',
			'BeginY',
			'EndX',
			'EndY',
			'PinX',
			'PinY',
			'Width',
			'Height',
			'Angle',
			'LocPinX',
			'LocPinY',
		];
	if (edit.type === 'delete-shape') return [];
	if (edit.type === 'create-text-box')
		return ['PinX', 'PinY', 'Width', 'Height', 'LinePattern', 'FillPattern'];
	if (edit.type === 'move-line-endpoint') {
		const prefix = edit.endpoint === 'begin' ? 'Begin' : 'End';
		return [`${prefix}X`, `${prefix}Y`];
	}
	if (edit.type === 'move-shape') return ['PinX', 'PinY'];
	if (edit.type === 'resize-shape')
		return edit.anchor
			? ['Width', 'Height', 'PinX', 'PinY', 'LocPinX', 'LocPinY']
			: ['Width', 'Height'];
	if (edit.type === 'rotate-shape') return ['Angle'];
	if (edit.type === 'flip-shape') return ['Angle', edit.axis === 'horizontal' ? 'FlipX' : 'FlipY'];
	return ['PinX', 'PinY', 'Width', 'Height'];
}

export function snapshotVisioEdits(
	edits: readonly VisioEdit[],
	maxEdits: number,
	maxText: number,
): VisioEdit[] {
	if (!Array.isArray(edits) || edits.length > maxEdits)
		fail('LIMIT_EDITS', 'Edit command count exceeds limit.');
	let textLength = 0;
	const text = (value: unknown): string => {
		if (typeof value !== 'string') fail('INVALID_EDIT', 'Edit text must be a string.');
		textLength += value.length;
		if (textLength > maxText) fail('LIMIT_EDIT_TEXT', 'Replacement text exceeds aggregate limit.');
		if (
			/[\u0000-\u0008\u000b\u000c\u000d\u000e-\u001f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(
				value,
			)
		)
			fail('INVALID_EDIT_TEXT', 'Replacement text contains invalid XML characters.');
		return value;
	};
	const numeric = (value: unknown, dimension = false, allowZero = false): number => {
		if (
			typeof value !== 'number' ||
			!Number.isFinite(value) ||
			Math.abs(value) > 1e6 ||
			(dimension && (value < 0 || (!allowZero && value === 0)))
		)
			fail(
				'INVALID_EDIT',
				'Geometry requires finite drawing inches within limits and positive dimensions.',
			);
		return value;
	};
	return Array.from(edits, (edit) => {
		// Snap & Glue belongs to the drawing, not to a page.
		if (edit?.type === 'set-snap-glue') return snapshotPageSetupEdit(edit);
		if (!edit || typeof edit.pageId !== 'string' || !edit.pageId || edit.pageId.length > 256)
			fail('INVALID_EDIT', 'Invalid edit target.');
		if (edit.type === 'duplicate-shapes') return snapshotDuplicateShapes(edit);
		if (edit.type === 'paste-shapes') return snapshotPasteShapes(edit);
		if (edit.type === 'change-shape') return snapshotChangeShape(edit);
		if (edit.type === 'insert-picture') return snapshotPictureInsert(edit);
		if (edit.type === 'set-page-theme') return snapshotPageTheme(edit);
		if (edit.type === 'assign-layers') return snapshotAssignLayers(edit);
		if (edit.type === 'set-layer-properties') return snapshotLayerProperties(edit);
		if (edit.type === 'insert-master-instance') return snapshotMasterInstance(edit);
		if (edit.type === 'drop-stencil-master') return snapshotStencilMasterDrop(edit);
		if (isVisioGuideEdit(edit)) return snapshotGuideEdit(edit);
		if (isVisioMetadataEdit(edit)) return snapshotMetadataEdit(edit);
		if (isVisioGroupEdit(edit)) return snapshotGroupEdit(edit);
		if (isVisioPageSetupEdit(edit)) return snapshotPageSetupEdit(edit);
		if (isVisioCommentEdit(edit)) return snapshotCommentEdit(edit);
		if (edit.type === 'create-subprocess') return snapshotSubprocessEdit(edit);
		if (isVisioDiagramPartEdit(edit)) return snapshotDiagramPartEdit(edit);
		if (edit.type === 'set-shape-data') return snapshotShapeDataEdit(edit);
		if (isVisioDataEdit(edit)) return snapshotDataEdit(edit);
		if (isVisioConnectorEdit(edit)) return snapshotConnectorEdit(edit);
		if (edit.type === 'delete-page') return { type: edit.type, pageId: edit.pageId };
		if (edit.type === 'set-page-size')
			return {
				type: edit.type,
				pageId: edit.pageId,
				width: numeric(edit.width, true),
				height: numeric(edit.height, true),
			};
		if (edit.type === 'reorder-page') {
			if (!Number.isSafeInteger(edit.index) || edit.index < 0 || edit.index > 1_000_000)
				fail('INVALID_EDIT', 'Page order requires a bounded zero-based integer index.');
			return { type: edit.type, pageId: edit.pageId, index: edit.index };
		}
		if (edit.type === 'insert-page') {
			const name = text(edit.name);
			if (
				!/^(0|[1-9]\d{0,9})$/.test(edit.pageId) ||
				Number(edit.pageId) > 4294967295 ||
				typeof edit.afterPageId !== 'string' ||
				!edit.afterPageId ||
				edit.afterPageId.length > 256 ||
				!name.trim() ||
				name.length > 256 ||
				/[\t\n]/.test(name)
			)
				fail('INVALID_EDIT', 'Invalid new page ID, name or insertion target.');
			return { type: edit.type, pageId: edit.pageId, afterPageId: edit.afterPageId, name };
		}
		if (edit.type === 'rename-page') {
			const name = text(edit.name);
			if (!name.trim() || name.length > 255 || /[\t\n]/.test(name))
				fail('INVALID_EDIT', 'Invalid page name.');
			return { type: edit.type, pageId: edit.pageId, name };
		}
		if (typeof edit.shapeId !== 'string' || !edit.shapeId || edit.shapeId.length > 256)
			fail('INVALID_EDIT', 'Invalid edit shape target.');
		const target = { pageId: edit.pageId, shapeId: edit.shapeId };
		if (edit.type === 'replace-plain-text')
			return { ...target, type: edit.type, text: text(edit.text) };
		if (edit.type === 'replace-text-ranges') return snapshotTextRanges(edit, text);
		if (edit.type === 'insert-text-field') return snapshotTextFieldInsert(edit);
		if (isVisioFormatEdit(edit)) return snapshotFormatting(edit);
		if (edit.type === 'reorder-shape') {
			if (!['front', 'back', 'forward', 'backward'].includes(edit.order))
				fail('INVALID_EDIT', 'Invalid shape order.');
			return { ...target, type: edit.type, order: edit.order };
		}
		if (!/^[1-9]\d{0,9}$/.test(edit.shapeId) || Number(edit.shapeId) > 4294967295)
			fail('INVALID_EDIT', 'Geometry shape IDs must be canonical positive unsigned integers.');
		switch (edit.type) {
			case 'create-path':
				return snapshotPathCreation(edit);
			case 'create-text-box':
				return {
					...target,
					type: edit.type,
					x: numeric(edit.x),
					y: numeric(edit.y),
					width: numeric(edit.width, true),
					height: numeric(edit.height, true),
					text: text(edit.text),
				};
			case 'create-line': {
				const beginX = numeric(edit.beginX),
					beginY = numeric(edit.beginY);
				const endX = numeric(edit.endX),
					endY = numeric(edit.endY);
				numeric(Math.hypot(endX - beginX, endY - beginY), true);
				const connect = snapshotConnectorGlue(edit.connect, edit.shapeId);
				const route = edit.route === undefined ? undefined : snapshotConnectorRoute(edit.route);
				return {
					...target,
					type: edit.type,
					beginX,
					beginY,
					endX,
					endY,
					...(connect ? { connect } : {}),
					...(route ? { route } : {}),
				};
			}
			case 'create-rectangle':
			case 'create-ellipse': {
				const shape = edit.type === 'create-rectangle' ? edit.shape : undefined;
				if (shape !== undefined && !isVisioOutlineShape(shape))
					fail('INVALID_EDIT', 'Unknown outline shape.');
				return {
					...target,
					type: edit.type,
					x: numeric(edit.x),
					y: numeric(edit.y),
					width: numeric(edit.width, true),
					height: numeric(edit.height, true),
					...(edit.text === undefined ? {} : { text: text(edit.text) }),
					...(shape === undefined ? {} : { shape }),
				};
			}
			case 'rotate-shape':
				return { ...target, type: edit.type, angle: numeric(edit.angle) };
			case 'flip-shape':
				if (edit.axis !== 'horizontal' && edit.axis !== 'vertical')
					fail('INVALID_EDIT', 'Invalid flip axis.');
				return { ...target, type: edit.type, axis: edit.axis };
			case 'move-shape':
				return { ...target, type: edit.type, x: numeric(edit.x), y: numeric(edit.y) };
			case 'move-line-endpoint':
				if (edit.endpoint !== 'begin' && edit.endpoint !== 'end')
					fail('INVALID_EDIT', 'A line endpoint must be begin or end.');
				return {
					...target,
					type: edit.type,
					endpoint: edit.endpoint,
					x: numeric(edit.x),
					y: numeric(edit.y),
				};
			case 'resize-shape': {
				const anchor = snapshotResizeAnchor(edit.anchor);
				return {
					...target,
					type: edit.type,
					width: numeric(edit.width, true),
					height: numeric(edit.height, true, true),
					...(anchor === undefined ? {} : { anchor }),
				};
			}
			case 'delete-shape':
				return { ...target, type: edit.type };
			default:
				return fail('INVALID_EDIT', 'Unsupported edit command.');
		}
	});
}
