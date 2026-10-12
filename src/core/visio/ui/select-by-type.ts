import type { VisioPage, VisioShape } from '../model';
import type { VisioShapeSelection } from './contract';

/** Home > Editing > Select > Select by Type: the shape types the dialog offers. */
export type VisioSelectType = 'shape' | 'group' | 'connector' | 'text' | 'picture';
export const VISIO_SELECT_TYPES: readonly VisioSelectType[] = [
	'shape',
	'group',
	'connector',
	'text',
	'picture',
];
export const VISIO_SELECT_TYPE_LABELS: Readonly<Record<VisioSelectType, string>> = Object.freeze({
	shape: 'Shapes',
	group: 'Groups',
	connector: 'Connectors and lines',
	text: 'Text-only shapes',
	picture: 'Pictures and objects',
});
/** One selection criterion, as Visio's dialog chooses Shape type, Layer or (here) Master. */
export type VisioSelectByTypeQuery =
	| { by: 'type'; types: readonly VisioSelectType[] }
	/** Layer IDs of the page; `''` stands for shapes on no layer. */
	| { by: 'layer'; layerIds: readonly string[] }
	/** Master IDs; `''` stands for shapes without a master. */
	| { by: 'master'; masterIds: readonly string[] };

const textOnly = (shape: VisioShape) =>
	!!shape.text.plainText.trim() &&
	(shape.geometry.every((path) => !path.fill && !path.stroke) ||
		(shape.style.linePattern === 0 &&
			(shape.style.fill === 'none' || shape.style.fillOpacity === 0)));

/** The dialog's type of a top-level shape: groups, 1-D shapes, foreign objects, text, the rest. */
export function visioShapeSelectType(page: VisioPage, shape: VisioShape): VisioSelectType {
	if (shape.kind === 'group') return 'group';
	if (shape.kind === 'connector' || page.connectors.some((c) => c.fromShapeId === shape.id))
		return 'connector';
	if (shape.kind === 'foreign' || shape.image || shape.foreignVector) return 'picture';
	return textOnly(shape) ? 'text' : 'shape';
}

/** Masters used by top-level shapes, with an instance name to label each one. */
export function visioPageMasters(
	page: VisioPage,
): { id: string; example: string; count: number }[] {
	const masters = new Map<string, { id: string; example: string; count: number }>();
	for (const shape of page.shapes) {
		if (shape.masterId === undefined) continue;
		const entry = masters.get(shape.masterId);
		if (entry) ++entry.count;
		else masters.set(shape.masterId, { id: shape.masterId, example: shape.name, count: 1 });
	}
	return [...masters.values()];
}

/**
 * Top-level, displayed shapes of the page matching the query, in page order. Guides and hidden
 * shapes are never selected; the controller also drops shapes hidden by layer overrides.
 */
export function visioSelectByType(
	page: VisioPage,
	query: VisioSelectByTypeQuery,
): VisioShapeSelection[] {
	const matches = (shape: VisioShape): boolean => {
		if (query.by === 'type') return query.types.includes(visioShapeSelectType(page, shape));
		if (query.by === 'layer') {
			const layers = shape.layerIds ?? [];
			return layers.length
				? layers.some((id) => query.layerIds.includes(id))
				: query.layerIds.includes('');
		}
		return query.masterIds.includes(shape.masterId ?? '');
	};
	return page.shapes
		.filter((shape) => !shape.hidden && !shape.visibility?.guide && matches(shape))
		.map((shape) => ({ id: shape.id, name: shape.name, pageId: page.id }));
}
