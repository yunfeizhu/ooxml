import type { VisioPageBreaks } from 'ooxml-core/visio/ui';

const NS = 'http://www.w3.org/2000/svg';

/**
 * View > Page Breaks: dashed lines where printed sheets split the page. The overlay is viewer
 * chrome in page inches (the paper's viewBox), never document content, and is not exported.
 */
export function drawPageBreaks(svg: SVGSVGElement, breaks: VisioPageBreaks | undefined): void {
	for (const old of Array.from(svg.children))
		if (old.hasAttribute('data-page-breaks')) old.remove();
	if (!breaks || (!breaks.columns.length && !breaks.rows.length)) return;
	const doc = svg.ownerDocument;
	const group = doc.createElementNS(NS, 'g');
	group.dataset.pageBreaks = '';
	group.setAttribute('aria-hidden', 'true');
	group.setAttribute('pointer-events', 'none');
	const [, , width, height] = (svg.getAttribute('viewBox') ?? '0 0 0 0').split(' ').map(Number);
	const line = (x1: number, y1: number, x2: number, y2: number) => {
		const node = doc.createElementNS(NS, 'line');
		node.setAttribute('x1', String(x1));
		node.setAttribute('y1', String(y1));
		node.setAttribute('x2', String(x2));
		node.setAttribute('y2', String(y2));
		node.setAttribute('class', 'page-break');
		group.append(node);
	};
	for (const x of breaks.columns) line(x, 0, x, height ?? 0);
	for (const y of breaks.rows) line(0, y, width ?? 0, y);
	svg.append(group);
}
