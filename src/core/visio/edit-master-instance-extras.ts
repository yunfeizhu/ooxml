import { attribute, children } from './sheet';
import { cells } from './edit-geometry-cells';

/**
 * Name a dropped instance as Visio does: the master's name while no other shape of the page has
 * it, and "Name.ID" after that.
 */
export function nameMasterInstance(root: Element, shape: Element, master: Element): void {
	const universal = attribute(master, 'NameU') ?? attribute(master, 'Name');
	if (!universal) return;
	const local = attribute(master, 'Name') ?? universal;
	const taken = new Set<string>();
	for (const other of Array.from(root.getElementsByTagNameNS(root.namespaceURI, 'Shape')))
		if (other !== shape)
			for (const name of [attribute(other, 'NameU'), attribute(other, 'Name')])
				if (name) taken.add(name);
	const suffix = taken.has(universal) || taken.has(local) ? `.${attribute(shape, 'ID')}` : '';
	shape.setAttribute('NameU', universal + suffix);
	shape.setAttribute('Name', local + suffix);
}

/** Cells an instance caches so its size is known without opening its master. */
const SIZE_CELLS = ['Width', 'Height', 'LocPinX', 'LocPinY'] as const;

/**
 * Keep the master's size beside the pin as inherited caches (`F="Inh"`), the form Visio itself
 * saves for an inherited cell and keeps when it saves the drawing again. The instance still
 * follows its master; edits that read a shape's box from the page alone (containers, Align,
 * Position, layout) then take a dropped shape like a drawn one.
 */
export function cacheMasterInstanceSize(shape: Element, base: Element): void {
	const source = cells(base);
	const values = SIZE_CELLS.map((name) => Number(attribute(source.get(name), 'V')));
	if (values.some((value) => !Number.isFinite(value)) || values[0]! <= 0 || values[1]! <= 0) return;
	const doc = shape.ownerDocument!;
	SIZE_CELLS.forEach((name, index) => {
		const cell = doc.createElementNS(shape.namespaceURI, 'Cell');
		cell.setAttribute('N', name);
		cell.setAttribute('V', String(values[index]));
		cell.setAttribute('U', 'IN');
		cell.setAttribute('F', 'Inh');
		const before = Array.from(shape.childNodes).find(
			(child) => child.nodeType === 1 && (child as Element).localName !== 'Cell',
		);
		shape.insertBefore(cell, before ?? null);
	});
}

/** Names of the master's layers its top-level shape belongs to, in the master's own order. */
export function masterInstanceLayers(master: Element, base: Element): string[] {
	const membership = (attribute(cells(base).get('LayerMember'), 'V') ?? '').trim();
	if (!/^\d+(;\d+)*$/.test(membership)) return [];
	const sheet = children(master, 'PageSheet')[0];
	const rows = children(sheet, 'Section')
		.filter((section) => attribute(section, 'N') === 'Layer')
		.flatMap((section) => children(section, 'Row'));
	const names = new Map<string, string>();
	for (const row of rows) {
		const value = (cell: string) =>
			attribute(
				children(row, 'Cell').find((node) => attribute(node, 'N') === cell),
				'V',
			);
		const name = value('Name') ?? value('NameUniv');
		if (name) names.set(String(Number(attribute(row, 'IX') ?? '0')), name);
	}
	return [
		...new Set(membership.split(';').flatMap((index) => names.get(String(Number(index))) ?? [])),
	];
}
