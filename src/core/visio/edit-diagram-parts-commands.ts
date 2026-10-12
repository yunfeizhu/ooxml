import { fail } from './package-common';

/** Space between the members' bounds and the container frame, in inches. */
export const VISIO_CONTAINER_MARGIN = 0.25;
/** Height of the container's heading band, in inches. */
export const VISIO_CONTAINER_HEADING = 0.35;
/** Non-native User rows that record membership; Visio keeps it in Relationships formulas. */
export const VISIO_CONTAINER_MEMBERS_ROW = 'ooxmlContainerMembers';
export const VISIO_CALLOUT_TARGET_ROW = 'ooxmlCalloutTarget';
export const VISIO_CALLOUT_LEADER_ROW = 'ooxmlCalloutLeader';

/** Insert > Container styles: the frame look, heading band and fill of the new container. */
export const VISIO_CONTAINER_STYLES = ['classic', 'plain', 'banner', 'dashed'] as const;
export type VisioContainerStyle = (typeof VISIO_CONTAINER_STYLES)[number];
/** Insert > Callout styles: the outline of the callout's text box. */
export const VISIO_CALLOUT_STYLES = ['rectangle', 'rounded', 'oval', 'text'] as const;
export type VisioCalloutStyle = (typeof VISIO_CALLOUT_STYLES)[number];

/** A centred box in drawing inches (bottom-left origin). */
export interface VisioPartBox {
	x: number;
	y: number;
	width: number;
	height: number;
}
/**
 * Insert a container sized around top-level members (with a margin and a heading band), behind
 * the lowest of them. With no members it is placed at `box`. Members stay ordinary page shapes.
 */
export interface VisioInsertContainerEdit {
	type: 'insert-container';
	pageId: string;
	shapeId: string;
	memberIds: readonly string[];
	style: VisioContainerStyle;
	heading: string;
	box?: VisioPartBox;
}
/**
 * Insert a callout: a text box at `box` plus a leader connector (`leaderId`) whose ends glue to
 * the callout and its target, so the leader follows either shape when it moves.
 */
export interface VisioInsertCalloutEdit {
	type: 'insert-callout';
	pageId: string;
	shapeId: string;
	leaderId: string;
	targetId: string;
	style: VisioCalloutStyle;
	text: string;
	box: VisioPartBox;
}
export type VisioDiagramPartEdit = VisioInsertContainerEdit | VisioInsertCalloutEdit;

export const isVisioDiagramPartEdit = (edit: { type: string }): edit is VisioDiagramPartEdit =>
	edit.type === 'insert-container' || edit.type === 'insert-callout';

const sheetId = (value: unknown): string => {
	if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value) || Number(value) > 0xffffffff)
		fail('INVALID_EDIT', 'Diagram part shape IDs require canonical positive unsigned integers.');
	return value;
};
const text = (value: unknown): string => {
	if (
		typeof value !== 'string' ||
		value.length > 10_000 ||
		/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/u.test(value)
	)
		fail('INVALID_EDIT', 'Diagram part text must be short plain text.');
	return value;
};
function partBox(value: unknown): VisioPartBox {
	const source = (value ?? {}) as Partial<Record<keyof VisioPartBox, unknown>>;
	const finite = (number: unknown, positive: boolean): number => {
		if (
			typeof number !== 'number' ||
			!Number.isFinite(number) ||
			Math.abs(number) > 1e6 ||
			(positive && number <= 0)
		)
			fail('INVALID_EDIT', 'A diagram part box needs finite inches and a positive size.');
		return number;
	};
	return {
		x: finite(source.x, false),
		y: finite(source.y, false),
		width: finite(source.width, true),
		height: finite(source.height, true),
	};
}

/** Copy and validate a container or callout command; source admission remains authoritative. */
export function snapshotDiagramPartEdit(edit: VisioDiagramPartEdit): VisioDiagramPartEdit {
	if (typeof edit.pageId !== 'string' || !edit.pageId || edit.pageId.length > 256)
		fail('INVALID_EDIT', 'Invalid edit target.');
	const shapeId = sheetId(edit.shapeId);
	if (edit.type === 'insert-callout') {
		if (!(VISIO_CALLOUT_STYLES as readonly unknown[]).includes(edit.style))
			fail('INVALID_EDIT', 'Unknown callout style.');
		const leaderId = sheetId(edit.leaderId),
			targetId = sheetId(edit.targetId);
		if (new Set([shapeId, leaderId, targetId]).size !== 3)
			fail('INVALID_EDIT', 'A callout, its leader and its target need distinct IDs.');
		return {
			type: edit.type,
			pageId: edit.pageId,
			shapeId,
			leaderId,
			targetId,
			style: edit.style,
			text: text(edit.text),
			box: partBox(edit.box),
		};
	}
	if (!(VISIO_CONTAINER_STYLES as readonly unknown[]).includes(edit.style))
		fail('INVALID_EDIT', 'Unknown container style.');
	if (!Array.isArray(edit.memberIds) || edit.memberIds.length > 1000)
		fail('INVALID_EDIT', 'A container holds at most 1000 member shapes.');
	const memberIds = Array.from(edit.memberIds, sheetId);
	if (new Set(memberIds).size !== memberIds.length || memberIds.includes(shapeId))
		fail('INVALID_EDIT', 'Container members must be unique and differ from the container.');
	if (!memberIds.length && edit.box === undefined)
		fail('INVALID_EDIT', 'An empty container needs a box.');
	return {
		type: edit.type,
		pageId: edit.pageId,
		shapeId,
		memberIds,
		style: edit.style,
		heading: text(edit.heading),
		...(edit.box === undefined ? {} : { box: partBox(edit.box) }),
	};
}
