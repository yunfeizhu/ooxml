import type { VisioPage } from '../model';
import type { VisioEdit } from '../edit-commands';
import type { VisioShapeDataFields } from '../edit-shape-data-commands';
import { visioShapePageBox } from './marquee';
import { visioNextShapeId } from './shape-id';
import {
	VISIO_DATA_GRAPHIC_FILL_ROW,
	VISIO_DATA_GRAPHIC_ICONS as ICONS,
	VISIO_DATA_GRAPHIC_ROW,
	visioColorRules,
	visioDataGraphicMarker as marker,
	visioDataGraphicParts,
	visioShapeDataNumber as numberOf,
	visioShapeDataRow as field,
	visioShapeDataText,
	type VisioColorRule,
	type VisioDataGraphicOptions,
	type VisioDataGraphicKind,
} from './data-graphic-rules';
export * from './data-graphic-rules';

const hidden = (label: string, value: string): VisioShapeDataFields => ({
	label,
	prompt: '',
	type: 'string',
	format: '',
	value,
	invisible: true,
});

/** Remove the graphics of these owners (all kinds, or one) and restore Color by Value fills. */
export function visioRemoveDataGraphicEdits(
	page: VisioPage,
	shapeIds: readonly string[],
	kind?: VisioDataGraphicKind,
): VisioEdit[] {
	const edits: VisioEdit[] = [];
	const parts = visioDataGraphicParts(page);
	for (const owner of shapeIds) {
		for (const part of parts.get(owner) ?? []) {
			if (kind && part.kind !== kind) continue;
			// Groups (a legend) are ungrouped first; only plain shapes can be deleted.
			const group = page.shapes.find((item) => item.id === part.id && item.kind === 'group');
			if (group) edits.push({ type: 'ungroup-shape', pageId: page.id, shapeId: part.id });
			for (const id of group ? group.children.map((child) => child.id) : [part.id])
				edits.push({ type: 'delete-shape', pageId: page.id, shapeId: id });
		}
		const shape = page.shapes.find((item) => item.id === owner);
		const fill = shape && field(shape, VISIO_DATA_GRAPHIC_FILL_ROW);
		if (shape && fill && (!kind || kind === 'color')) {
			const color = String(fill.value ?? '');
			if (/^#[0-9a-f]{6}$/i.test(color))
				edits.push({ type: 'format-shape', pageId: page.id, shapeId: owner, fillColor: color });
			edits.push({
				type: 'set-shape-data',
				pageId: page.id,
				shapeId: owner,
				row: fill.name,
				data: null,
			});
		}
	}
	return edits;
}

/**
 * Apply one data graphic to top-level shapes that have the field. Text callouts, data bars and
 * icons are separate marked shapes placed under or beside each shape (they do not follow it
 * when it moves); Color by Value changes the shape's own fill and remembers the old one.
 */
export function visioDataGraphicEdits(
	page: VisioPage,
	shapeIds: readonly string[],
	options: VisioDataGraphicOptions,
): VisioEdit[] {
	const targets = page.shapes.filter(
		(shape) => shapeIds.includes(shape.id) && !marker(shape) && field(shape, options.field),
	);
	// Re-applying replaces the owner's parts of this kind; colour keeps the remembered fill.
	const edits =
		options.kind === 'color'
			? []
			: visioRemoveDataGraphicEdits(
					page,
					targets.map((shape) => shape.id),
					options.kind,
				);
	const ratio = page.drawingToPageScale ?? 1;
	let next = Number(visioNextShapeId(page));
	const id = () => String(next++);
	const mark = (shapeId: string, owner: string): VisioEdit => ({
		type: 'set-shape-data',
		pageId: page.id,
		shapeId,
		row: VISIO_DATA_GRAPHIC_ROW,
		data: hidden(options.kind, owner),
	});
	const values = targets.map((shape) => numberOf(shape, options.field));
	const known = values.filter((value): value is number => value !== undefined);
	const min = options.min ?? Math.min(0, ...known);
	const max = options.max ?? Math.max(...known, min + 1);
	const colors =
		options.kind === 'color'
			? visioColorRules(
					page,
					targets.map((s) => s.id),
					options.field,
				)
			: undefined;
	for (const [index, shape] of targets.entries()) {
		const box = visioShapePageBox(page, shape);
		if (!box) continue;
		const centreX = (box.x + box.width / 2) / ratio;
		const bottom = (page.height - box.y - box.height) / ratio;
		const top = (page.height - box.y) / ratio;
		const width = box.width / ratio;
		const value = values[index];
		const target = { pageId: page.id };
		if (options.kind === 'text') {
			const text = visioShapeDataText(shape, options.field) ?? '';
			const shapeId = id();
			edits.push(
				{
					...target,
					type: 'create-text-box',
					shapeId,
					x: centreX,
					y: bottom - 0.2,
					width: Math.max(width, 1),
					height: 0.3,
					text,
				},
				mark(shapeId, shape.id),
			);
		} else if (options.kind === 'bar') {
			if (value === undefined) continue;
			const barWidth = Math.min(Math.max(width, 0.8), 2);
			const fraction = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
			const frame = id();
			const left = centreX - barWidth / 2;
			edits.push(
				{
					...target,
					type: 'create-rectangle',
					shapeId: frame,
					x: centreX,
					y: bottom - 0.15,
					width: barWidth,
					height: 0.16,
				},
				{
					...target,
					type: 'format-shape',
					shapeId: frame,
					fillPattern: 0,
					lineColor: '#7f7f7f',
					lineWeight: 0.75,
				},
				mark(frame, shape.id),
			);
			if (fraction > 0.005) {
				const bar = id();
				edits.push(
					{
						...target,
						type: 'create-rectangle',
						shapeId: bar,
						x: left + (barWidth * fraction) / 2,
						y: bottom - 0.15,
						width: barWidth * fraction,
						height: 0.16,
					},
					{ ...target, type: 'format-shape', shapeId: bar, fillColor: '#2e75b6', linePattern: 0 },
					mark(bar, shape.id),
				);
			}
		} else if (options.kind === 'icon') {
			if (value === undefined) continue;
			const share = (value - min) / (max - min || 1);
			const color = share >= 2 / 3 ? ICONS.high : share >= 1 / 3 ? ICONS.mid : ICONS.low;
			const icon = id();
			edits.push(
				{
					...target,
					type: 'create-ellipse',
					shapeId: icon,
					x: centreX + width / 2 + 0.15,
					y: top - 0.11,
					width: 0.22,
					height: 0.22,
				},
				{ ...target, type: 'format-shape', shapeId: icon, fillColor: color, linePattern: 0 },
				mark(icon, shape.id),
			);
		} else {
			const color = colors!.color(shape);
			if (!color) continue;
			if (!field(shape, VISIO_DATA_GRAPHIC_FILL_ROW))
				edits.push({
					type: 'set-shape-data',
					pageId: page.id,
					shapeId: shape.id,
					row: VISIO_DATA_GRAPHIC_FILL_ROW,
					data: hidden(options.field, shape.style.fill),
				});
			edits.push({
				...target,
				type: 'format-shape',
				shapeId: shape.id,
				fillColor: color,
				fillPattern: 1,
			});
		}
	}
	return edits;
}

/**
 * A legend for Color by Value: a title and one swatch and label per rule, grouped, at the top
 * right of the page. Vertical lists the rules under the title; horizontal puts them in a row
 * beside it and starts another row when the page is not wide enough.
 */
export function visioLegendEdits(
	page: VisioPage,
	title: string,
	rules: readonly VisioColorRule[],
	orientation: 'vertical' | 'horizontal' = 'vertical',
): VisioEdit[] {
	if (!rules.length) return [];
	const ratio = page.drawingToPageScale ?? 1;
	let next = Number(visioNextShapeId(page));
	const id = () => String(next++);
	const shown = rules.slice(0, 24);
	const across = orientation === 'horizontal';
	const row = 0.3;
	const right = page.width / ratio - 0.3;
	// One entry is a swatch and its label; the title has its own column in a horizontal legend.
	const cell = across ? 1.5 : 2.2;
	const width = across ? 1.2 : cell;
	const perRow = across ? Math.max(1, Math.floor((right - 0.3 - width) / cell)) : 1;
	const columns = Math.min(perRow, shown.length);
	const left = right - (across ? width + cell * columns : width);
	const top = page.height / ratio - 0.4;
	const edits: VisioEdit[] = [];
	const members: string[] = [];
	const mark = (shapeId: string): VisioEdit => ({
		type: 'set-shape-data',
		pageId: page.id,
		shapeId,
		row: VISIO_DATA_GRAPHIC_ROW,
		data: hidden('legend', 'legend'),
	});
	const heading = id();
	members.push(heading);
	edits.push(
		{
			type: 'create-text-box',
			pageId: page.id,
			shapeId: heading,
			x: left + width / 2,
			y: top,
			width,
			height: row,
			text: title,
		},
		mark(heading),
	);
	for (const [index, rule] of shown.entries()) {
		const x = across ? left + width + cell * (index % perRow) : left;
		const y = top - row * (across ? Math.floor(index / perRow) : index + 1);
		const swatch = id(),
			label = id();
		members.push(swatch, label);
		edits.push(
			{
				type: 'create-rectangle',
				pageId: page.id,
				shapeId: swatch,
				x: x + 0.2,
				y,
				width: 0.25,
				height: 0.2,
			},
			{
				type: 'format-shape',
				pageId: page.id,
				shapeId: swatch,
				fillColor: rule.color,
				fillPattern: 1,
			},
			mark(swatch),
			{
				type: 'create-text-box',
				pageId: page.id,
				shapeId: label,
				x: x + 0.45 + (cell - 0.5) / 2,
				y,
				width: cell - 0.5,
				height: row,
				text: rule.label,
			},
			{ type: 'format-text', pageId: page.id, shapeId: label, horizontalAlign: 'left' },
			mark(label),
		);
	}
	const group = id();
	edits.push(
		{ type: 'group-shapes', pageId: page.id, shapeId: group, memberIds: members },
		mark(group),
	);
	return edits;
}
