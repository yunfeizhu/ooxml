import type { VisioAutoConnectDirection } from 'ooxml-core/visio/ui';
import type { Master } from './stencil-catalog';

const SVG = 'http://www.w3.org/2000/svg';
const ARROWS: Record<VisioAutoConnectDirection, string> = {
	up: 'M8 2.5 14 12H2Z',
	right: 'M13.5 8 4 14V2Z',
	down: 'M8 13.5 2 4h12Z',
	left: 'M2.5 8 12 2v12Z',
};
/** An arrow or bar position in viewport pixels. */
export interface AutoConnectArrow {
	direction: VisioAutoConnectDirection;
	x: number;
	y: number;
}

function icon(doc: Document, viewBox: string, d: string): SVGSVGElement {
	const svg = doc.createElementNS(SVG, 'svg');
	svg.setAttribute('viewBox', viewBox);
	svg.setAttribute('aria-hidden', 'true');
	const path = doc.createElementNS(SVG, 'path');
	path.setAttribute('d', d);
	svg.append(path);
	return svg;
}

/** One AutoConnect arrow. Out of the tab order: the arrows are a pointer aid. */
export function autoConnectArrow(
	doc: Document,
	arrow: AutoConnectArrow,
	hasNeighbour: boolean,
): HTMLButtonElement {
	const button = doc.createElement('button');
	button.type = 'button';
	button.tabIndex = -1;
	button.className = 'auto-connect-arrow';
	button.dataset.autoConnect = arrow.direction;
	button.style.left = `${arrow.x}px`;
	button.style.top = `${arrow.y}px`;
	const where =
		arrow.direction === 'up'
			? 'above'
			: arrow.direction === 'down'
				? 'below'
				: `on the ${arrow.direction}`;
	const label = hasNeighbour ? `Connect to the shape ${where}` : `Add a connected shape ${where}`;
	button.setAttribute('aria-label', label);
	button.title = label;
	button.append(icon(doc, '0 0 16 16', ARROWS[arrow.direction]));
	return button;
}

/** The mini toolbar of Quick Shapes beside an arrow. */
export function autoConnectBar(
	doc: Document,
	arrow: AutoConnectArrow,
	masters: readonly Master[],
): HTMLElement {
	const bar = doc.createElement('div');
	bar.className = 'auto-connect-bar';
	bar.dataset.side = arrow.direction;
	bar.setAttribute('role', 'toolbar');
	bar.setAttribute('aria-label', 'Quick Shapes');
	bar.style.left = `${arrow.x}px`;
	bar.style.top = `${arrow.y}px`;
	for (const master of masters) {
		const button = doc.createElement('button');
		button.type = 'button';
		button.tabIndex = -1;
		button.dataset.autoConnectMaster = master.id;
		button.setAttribute('aria-label', master.name);
		button.title = `${master.name}: add it here, connected.`;
		button.append(icon(doc, '0 0 24 24', master.path));
		bar.append(button);
	}
	return bar;
}
