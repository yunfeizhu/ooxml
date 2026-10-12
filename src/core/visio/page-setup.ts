import type { VisioPageSetup } from './model';
import type { Cells } from './sheet';

const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
/** A usable cached numeric value, or undefined for missing, erroneous or inherited cells. */
function cached(cells: Cells, name: string): number | undefined {
	const cell = cells.get(name);
	const raw = cell?.value?.trim();
	if (!cell || cell.error !== undefined || cell.formula === 'Inh' || !raw || raw.length > 128)
		return undefined;
	if (!NUMBER.test(raw)) return undefined;
	const value = Number(raw);
	return Number.isFinite(value) && Math.abs(value) <= 1e9 ? value : undefined;
}

/**
 * Cached Print Properties and drawing-scale cells of a PageSheet, as the Page Setup dialog and
 * page breaks read them. Missing or unusable caches are omitted rather than defaulted.
 */
export function readVisioPageSetup(cells: Cells): VisioPageSetup | undefined {
	const result: { -readonly [K in keyof VisioPageSetup]: VisioPageSetup[K] } = {};
	const pageScale = cached(cells, 'PageScale'),
		drawingScale = cached(cells, 'DrawingScale');
	if (pageScale !== undefined && pageScale > 0) result.pageScale = pageScale;
	if (drawingScale !== undefined && drawingScale > 0) {
		result.drawingScale = drawingScale;
		const unit = cells.get('DrawingScale')?.unit;
		if (unit && /^[A-Z_]{1,16}$/i.test(unit)) result.drawingScaleUnit = unit.toUpperCase();
	}
	const orientation = cached(cells, 'PrintPageOrientation');
	if (orientation === 0 || orientation === 1 || orientation === 2)
		result.printPageOrientation = orientation;
	const paper = cached(cells, 'PaperKind');
	if (paper !== undefined && Number.isSafeInteger(paper) && paper >= 0 && paper <= 0xffff)
		result.paperKind = paper;
	const margins = ['Left', 'Right', 'Top', 'Bottom'].map((side) =>
		cached(cells, `Page${side}Margin`),
	);
	if (margins.every((value) => value !== undefined && value >= 0 && value <= 1000)) {
		const [left, right, top, bottom] = margins as number[];
		result.margins = { left: left!, right: right!, top: top!, bottom: bottom! };
	}
	const zoom = cached(cells, 'ScaleX');
	if (zoom !== undefined && zoom > 0 && zoom <= 100) result.printZoom = zoom;
	return Object.keys(result).length ? result : undefined;
}
