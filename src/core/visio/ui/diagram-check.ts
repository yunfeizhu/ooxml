import type { VisioDocument, VisioPage, VisioShape } from '../model';
import { visioShapePageBox } from './marquee';

/**
 * Process > Check Diagram: generic, provable rules over the parsed drawing. These are this
 * viewer's own rules, not Visio's Flowchart or BPMN rule sets, and they read only saved values.
 */
export type VisioRuleSetId = 'connectivity' | 'placement' | 'content';
export type VisioDiagramRuleId =
	| 'connector-unglued'
	| 'connector-partially-glued'
	| 'connector-same-shape'
	| 'shape-off-page'
	| 'shape-stacked'
	| 'shape-empty';
export interface VisioRuleSet {
	id: VisioRuleSetId;
	name: string;
	description: string;
}
export const VISIO_DIAGRAM_RULE_SETS: readonly VisioRuleSet[] = [
	{
		id: 'connectivity',
		name: 'Connectivity',
		description: 'Connectors glued at both ends, to two different shapes.',
	},
	{
		id: 'placement',
		name: 'Placement',
		description: 'Shapes on the page and not stacked exactly on another shape.',
	},
	{ id: 'content', name: 'Content', description: 'Shapes that show text or draw something.' },
];
const RULE_SET: Record<VisioDiagramRuleId, VisioRuleSetId> = {
	'connector-unglued': 'connectivity',
	'connector-partially-glued': 'connectivity',
	'connector-same-shape': 'connectivity',
	'shape-off-page': 'placement',
	'shape-stacked': 'placement',
	'shape-empty': 'content',
};
export interface VisioDiagramIssue {
	/** Stable across checks of the same drawing: rule, page and shape. */
	id: string;
	ruleId: VisioDiagramRuleId;
	ruleSet: VisioRuleSetId;
	pageId: string;
	shapeId: string;
	shapeName: string;
	message: string;
}
export interface VisioDiagramCheckOptions {
	/** Rule sets to run; all of them when absent. */
	ruleSets?: Iterable<VisioRuleSetId>;
	/** Stop after this many issues (default 5000). */
	maxIssues?: number;
}

const label = (shape: VisioShape) => shape.name || `Shape ${shape.id}`;
const drawsNothing = (shape: VisioShape) =>
	!shape.text.plainText.trim() &&
	!shape.image &&
	!shape.foreignVector &&
	!shape.children.length &&
	shape.geometry.every((geometry) => !geometry.fill && !geometry.stroke);

function pageIssues(page: VisioPage, enabled: ReadonlySet<VisioRuleSetId>): VisioDiagramIssue[] {
	const issues: VisioDiagramIssue[] = [];
	const add = (ruleId: VisioDiagramRuleId, shape: VisioShape, message: string) => {
		if (!enabled.has(RULE_SET[ruleId])) return;
		issues.push({
			id: `${ruleId}:${page.id}:${shape.id}`,
			ruleId,
			ruleSet: RULE_SET[ruleId],
			pageId: page.id,
			shapeId: shape.id,
			shapeName: label(shape),
			message,
		});
	};
	const glue = new Map<string, { begin?: string; end?: string }>();
	for (const connection of page.connectors) {
		const ends = glue.get(connection.fromShapeId) ?? {};
		if (/^Begin/i.test(connection.fromCell)) ends.begin = connection.toShapeId;
		else if (/^End/i.test(connection.fromCell)) ends.end = connection.toShapeId;
		glue.set(connection.fromShapeId, ends);
	}
	const names = new Map(page.shapes.map((shape) => [shape.id, label(shape)]));
	const stacked = new Map<string, VisioShape>();
	for (const shape of page.shapes) {
		if (shape.hidden || shape.visibility?.guide) continue;
		if (shape.kind === 'connector') {
			const ends = glue.get(shape.id);
			if (!ends?.begin && !ends?.end) {
				if (/connector/i.test(shape.name))
					add('connector-unglued', shape, `${label(shape)} is not glued at either end.`);
			} else if (!ends.begin || !ends.end)
				add(
					'connector-partially-glued',
					shape,
					`${label(shape)} is glued only at its ${ends.begin ? 'begin' : 'end'} point.`,
				);
			else if (ends.begin === ends.end)
				add(
					'connector-same-shape',
					shape,
					`${label(shape)} is glued to ${names.get(ends.begin) ?? `shape ${ends.begin}`} at both ends.`,
				);
		}
		const box = visioShapePageBox(page, shape);
		if (
			box &&
			(box.x >= page.width ||
				box.y >= page.height ||
				box.x + box.width <= 0 ||
				box.y + box.height <= 0)
		)
			add('shape-off-page', shape, `${label(shape)} lies entirely off the page.`);
		if (box && shape.kind !== 'connector' && box.width > 0 && box.height > 0) {
			const key = [box.x, box.y, box.width, box.height].map((value) => value.toFixed(4)).join();
			const below = stacked.get(key);
			if (below)
				add(
					'shape-stacked',
					shape,
					`${label(shape)} sits exactly on top of ${label(below)} (same position and size).`,
				);
			else stacked.set(key, shape);
		}
		if (shape.kind === 'shape' && drawsNothing(shape))
			add('shape-empty', shape, `${label(shape)} has no text and draws nothing.`);
	}
	return issues;
}

/** Issues on every foreground page, in page and stacking order. */
export function checkVisioDiagram(
	document: VisioDocument,
	options: VisioDiagramCheckOptions = {},
): VisioDiagramIssue[] {
	const enabled = new Set(options.ruleSets ?? VISIO_DIAGRAM_RULE_SETS.map((set) => set.id));
	const limit = options.maxIssues ?? 5000;
	const issues: VisioDiagramIssue[] = [];
	for (const page of document.pages) {
		if (page.isBackground) continue;
		for (const issue of pageIssues(page, enabled)) {
			if (issues.length >= limit) return issues;
			issues.push(issue);
		}
	}
	return issues;
}
