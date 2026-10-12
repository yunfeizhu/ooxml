import type { VisioPage } from 'ooxml-core/visio';
import {
	visioConnectorMovePreviews,
	visioConnectorPreviewPath,
	visioMovePreviewTransform,
	type VisioPagePoint,
} from 'ooxml-core/visio/ui';
import { matrix } from './render-svg';
/** Share existing inert SVG resources; moving a preview never mutates the scene or source. */
export function createMovementPreview(svg: SVGSVGElement, page: VisioPage, ids: readonly string[]) {
	const sources = ids.map((id) =>
		Array.from(svg.querySelectorAll<SVGGElement>('[data-shape-id]')).find(
			(group) => group.dataset.shapeId === id && (group.dataset.pageId ?? page.id) === page.id,
		),
	);
	if (sources.some((source) => !source))
		throw new Error('The selected shapes are no longer displayed.');
	const entries = sources.map((source, index) => {
		const original = source!;
		const clone = original.cloneNode(true) as SVGGElement;
		for (const node of [clone, ...Array.from(clone.querySelectorAll('*'))]) {
			for (const name of ['data-shape-id', 'data-page-id', 'tabindex', 'role', 'aria-pressed'])
				node.removeAttribute(name);
		}
		clone.dataset.movementPreview = '';
		clone.setAttribute('aria-hidden', 'true');
		clone.style.pointerEvents = 'none';
		const visibility = original.style.visibility;
		original.after(clone);
		original.style.visibility = 'hidden';
		return {
			original,
			clone,
			visibility,
			shape: page.shapes.find((shape) => shape.id === ids[index])!,
		};
	});
	const connectors = connectorPreview(svg, page, new Set(ids));
	return {
		update(delta: VisioPagePoint) {
			for (const entry of entries) {
				const transform = visioMovePreviewTransform(entry.shape, delta);
				if (transform) entry.clone.setAttribute('transform', matrix(transform));
			}
			connectors.update(delta);
		},
		dispose() {
			for (const entry of entries) {
				entry.clone.remove();
				entry.original.style.visibility = entry.visibility;
			}
			connectors.dispose();
		},
	};
}

/** Glued connectors follow the dragged shapes as dashed previews of their new route. */
function connectorPreview(svg: SVGSVGElement, page: VisioPage, moved: ReadonlySet<string>) {
	const glued = new Set(
		page.connectors.filter((row) => moved.has(row.toShapeId)).map((row) => row.fromShapeId),
	);
	const hidden = new Map<SVGGElement, string>();
	const paths = new Map<string, SVGPathElement>();
	const groups = Array.from(svg.querySelectorAll<SVGGElement>('[data-shape-id]')).filter(
		(group) =>
			glued.has(group.dataset.shapeId ?? '') && (group.dataset.pageId ?? page.id) === page.id,
	);
	return {
		update(delta: VisioPagePoint) {
			if (!glued.size) return;
			for (const preview of visioConnectorMovePreviews(page, moved, delta)) {
				let path = paths.get(preview.connectorId);
				if (!path) {
					path = svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
					path.classList.add('connector-preview');
					path.setAttribute('vector-effect', 'non-scaling-stroke');
					path.setAttribute('aria-hidden', 'true');
					svg.append(path);
					paths.set(preview.connectorId, path);
					for (const group of groups)
						if (group.dataset.shapeId === preview.connectorId && !hidden.has(group)) {
							hidden.set(group, group.style.visibility);
							group.style.visibility = 'hidden';
						}
				}
				path.setAttribute('d', visioConnectorPreviewPath(preview));
			}
		},
		dispose() {
			for (const path of paths.values()) path.remove();
			for (const [group, visibility] of hidden) group.style.visibility = visibility;
		},
	};
}
