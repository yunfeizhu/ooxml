import { VISIO_DATA_LIMITS, type VisioDocument } from '../index';

const invalid = () => new Error('The scene has invalid external data.');
const text = (value: unknown, limit: number): number => {
	if (typeof value !== 'string' || value.length > limit) throw invalid();
	return value.length;
};
/** Runtime checks for saved external data so host scenes cannot inject non-text values. */
export function assertSceneDataRecordsets(model: VisioDocument): void {
	const sets = model.dataRecordsets;
	if (sets === undefined) return;
	if (!Array.isArray(sets) || sets.length > VISIO_DATA_LIMITS.maxRecordsets) throw invalid();
	let characters = 0;
	for (const set of sets) {
		if (!set || typeof set !== 'object') throw invalid();
		text(set.id, 32);
		text(set.name, 255);
		if (set.refreshed !== undefined) text(set.refreshed, 64);
		if (
			!Array.isArray(set.columns) ||
			set.columns.length > VISIO_DATA_LIMITS.maxColumns ||
			!Array.isArray(set.rows) ||
			set.rows.length > VISIO_DATA_LIMITS.maxRows ||
			!Array.isArray(set.links) ||
			set.links.length > VISIO_DATA_LIMITS.maxRows * 4
		)
			throw invalid();
		for (const column of set.columns) {
			text(column.name, 255);
			text(column.label, 255);
			if (!['string', 'number', 'boolean', 'date'].includes(column.type)) throw invalid();
		}
		for (const row of set.rows) {
			text(row.id, 32);
			if (!Array.isArray(row.values) || row.values.length !== set.columns.length) throw invalid();
			for (const value of row.values) {
				characters += text(value, VISIO_DATA_LIMITS.maxValueCharacters);
				if (characters > VISIO_DATA_LIMITS.maxTotalCharacters) throw invalid();
			}
		}
		for (const link of set.links)
			for (const key of ['rowId', 'pageId', 'shapeId'] as const) text(link[key], 32);
	}
}
