import { executableCellFormula } from './cell-formula';
import type { MasterTemplate } from './edit-text-instance';
import { fail, VisioPackageError } from './package-common';
import { attribute, children } from './sheet';

/** One effective ShapeSheet cell of a stencil instance: the master's, and the local override if any. */
export interface InstanceCell {
	/** ShapeSheet reference names in lower case (`geometry1.x2`, `user.row`, `user.row.value`). */
	names: readonly string[];
	/** XML cell name. */
	name: string;
	section?: { name: string; index?: string };
	/** The master (or local) row, whose T, N and IX identify a row created on the instance. */
	row?: Element;
	local?: Element;
	inherited?: Element;
	/** True for cells of Rel* geometry rows, whose values are fractions and not lengths. */
	relative: boolean;
}

export interface InstanceSheet {
	instance: Element;
	template: Element;
	cells: readonly InstanceCell[];
	byName: ReadonlyMap<string, InstanceCell>;
}

const deleted = (node: Element) => ['1', 'true'].includes(attribute(node, 'Del') ?? '');
const rowKey = (row: Element) => attribute(row, 'IX') ?? attribute(row, 'N') ?? '0';
const sectionKey = (section: Element) =>
	`${attribute(section, 'N') ?? ''}:${attribute(section, 'IX') ?? '0'}`;

/** How formulas name a cell of a section row. */
function referenceNames(section: Element, row: Element, cell: string): string[] {
	const name = attribute(section, 'N') ?? '';
	const ix = attribute(row, 'IX');
	const named = attribute(row, 'N');
	const number = String(Number(ix ?? '0'));
	if (name === 'Geometry')
		return [`Geometry${Number(attribute(section, 'IX') ?? '0') + 1}.${cell}${number}`];
	const prefix =
		name === 'Property'
			? 'Prop'
			: name === 'Connection'
				? 'Connections'
				: name === 'Control'
					? 'Controls'
					: name === 'Character'
						? 'Char'
						: name === 'Paragraph'
							? 'Para'
							: name;
	if (['User', 'Prop'].includes(prefix) && named !== undefined)
		return cell === 'Value'
			? [`${prefix}.${named}`, `${prefix}.${named}.Value`]
			: [`${prefix}.${named}.${cell}`];
	if (['Scratch', 'Connections', 'Controls'].includes(prefix)) {
		// Rows are numbered from one in formulas; a named row is also reached by its name.
		const index = String(Number(ix ?? '0') + 1);
		return [
			...(ix !== undefined ? [`${prefix}.${cell}${index}`] : []),
			...(named !== undefined
				? cell === 'X'
					? [`${prefix}.${named}`, `${prefix}.${named}.X`]
					: [`${prefix}.${named}.${cell}`]
				: []),
		];
	}
	if (['Char', 'Para'].includes(prefix))
		return number === '0' ? [`${prefix}.${cell}`] : [`${prefix}.${cell}[${Number(number) + 1}]`];
	return [`${prefix}.${named ?? number}.${cell}`];
}

function unique(items: readonly Element[], key: (node: Element) => string, what: string) {
	const result = new Map<string, Element>();
	for (const item of items) {
		const id = key(item);
		if (result.has(id)) fail('EDIT_AMBIGUOUS_CELL', `Duplicate ${what} in a stencil shape.`);
		result.set(id, item);
	}
	return result;
}
const cellMap = (parent: Element) =>
	unique(children(parent, 'Cell'), (cell) => attribute(cell, 'N') ?? '', 'cell');

/**
 * The effective sheet of a stencil instance over its master shape. Anything this editor cannot
 * merge exactly is refused: foreign data, locally deleted sections or rows, chained masters and,
 * unless `group` says the caller handles the sub-shapes (`edit-instance-scope.ts`), groups.
 */
export function instanceSheet(
	instance: Element,
	template: Element,
	/** A member of a group instance: the group itself or one of its sub-shapes. */
	options: { group?: boolean } = {},
): InstanceSheet {
	for (const node of [instance, template]) {
		const type = attribute(node, 'Type');
		if (
			!(options.group ? ['Shape', 'Group', undefined] : ['Shape', undefined]).includes(type) ||
			(!options.group && children(node, 'Shapes').length > 0) ||
			children(node, 'ForeignData').length ||
			deleted(node)
		)
			fail(
				'UNSUPPORTED_INSTANCE_EDIT',
				options.group
					? 'A stencil shape that holds a picture or a deleted part cannot be changed.'
					: 'Only stencil shapes made of one plain shape can be changed; grouped, picture and deleted ones cannot.',
			);
	}
	if (template.hasAttribute('Master') || template.hasAttribute('MasterShape'))
		fail('UNSUPPORTED_INSTANCE_EDIT', 'The master of this stencil shape inherits another master.');
	const cells: InstanceCell[] = [];
	const localCells = cellMap(instance);
	const masterCells = cellMap(template);
	for (const name of new Set([...masterCells.keys(), ...localCells.keys()])) {
		const local = localCells.get(name),
			inherited = masterCells.get(name);
		cells.push({
			names: [name.toLowerCase()],
			name,
			relative: false,
			...(local ? { local } : {}),
			...(inherited ? { inherited } : {}),
		});
	}
	const sections = (shape: Element) => unique(children(shape, 'Section'), sectionKey, 'section');
	const localSections = sections(instance),
		masterSections = sections(template);
	for (const key of new Set([...masterSections.keys(), ...localSections.keys()])) {
		const localSection = localSections.get(key),
			masterSection = masterSections.get(key);
		const section = (masterSection ?? localSection)!;
		if ((localSection && deleted(localSection)) || (masterSection && deleted(masterSection)))
			fail('UNSUPPORTED_INSTANCE_EDIT', 'The stencil shape has deleted ShapeSheet sections.');
		const index = attribute(section, 'IX');
		const identity = {
			name: attribute(section, 'N') ?? '',
			...(index !== undefined ? { index } : {}),
		};
		const ownCells = localSection ? cellMap(localSection) : new Map<string, Element>();
		const baseCells = masterSection ? cellMap(masterSection) : new Map<string, Element>();
		const prefix =
			identity.name === 'Geometry' ? `Geometry${Number(index ?? '0') + 1}` : identity.name;
		for (const name of new Set([...baseCells.keys(), ...ownCells.keys()])) {
			const local = ownCells.get(name),
				inherited = baseCells.get(name);
			cells.push({
				names: [`${prefix}.${name}`.toLowerCase()],
				name,
				section: identity,
				relative: false,
				...(local ? { local } : {}),
				...(inherited ? { inherited } : {}),
			});
		}
		const rows = (node: Element | undefined) =>
			node ? unique(children(node, 'Row'), rowKey, 'row') : new Map<string, Element>();
		const localRows = rows(localSection),
			masterRows = rows(masterSection);
		for (const id of new Set([...masterRows.keys(), ...localRows.keys()])) {
			const localRow = localRows.get(id),
				masterRow = masterRows.get(id);
			// A row deleted in the master or on the page (unused gradient stops, mostly) has no cells.
			if ((localRow && deleted(localRow)) || (masterRow && deleted(masterRow))) continue;
			const row = (masterRow ?? localRow)!;
			const local = localRow ? cellMap(localRow) : new Map<string, Element>();
			const inherited = masterRow ? cellMap(masterRow) : new Map<string, Element>();
			const relative = (attribute(row, 'T') ?? '').startsWith('Rel');
			for (const name of new Set([...inherited.keys(), ...local.keys()])) {
				const own = local.get(name),
					base = inherited.get(name);
				cells.push({
					names: referenceNames(section, row, name).map((item) => item.toLowerCase()),
					name,
					section: identity,
					row,
					relative,
					...(own ? { local: own } : {}),
					...(base ? { inherited: base } : {}),
				});
			}
		}
	}
	const byName = new Map<string, InstanceCell>();
	for (const cell of cells)
		for (const name of cell.names) if (!byName.has(name)) byName.set(name, cell);
	return { instance, template, cells, byName };
}

/** The cell whose cached value is in effect: a local one with a value, otherwise the master's. */
export const effectiveNode = (cell: InstanceCell): Element | undefined =>
	cell.local?.hasAttribute('V') || !cell.inherited ? cell.local : cell.inherited;

/** The formula in effect. A local value without a formula is a constant; `Inh` keeps the master's. */
export function effectiveFormula(cell: InstanceCell): string | undefined {
	if (!cell.local) return executableCellFormula(attribute(cell.inherited, 'F'));
	const own = attribute(cell.local, 'F');
	return own === 'Inh'
		? executableCellFormula(attribute(cell.inherited, 'F'))
		: executableCellFormula(own);
}

/** Schema order: cells, then sections, then Text, data, foreign data and sub-shapes. */
const AFTER_SECTIONS = ['Text', 'Data1', 'Data2', 'Data3', 'ForeignData', 'Shapes'];

/**
 * Write a cell on the instance, creating its section and row when the master's are inherited.
 * `formula` is `Inh` for a refreshed cache of an inherited formula and absent for a local value.
 */
export function writeInstanceCell(
	sheet: InstanceSheet,
	cell: InstanceCell,
	value: string,
	options: { unit?: string; formula?: 'Inh' } = {},
): Element {
	const { instance } = sheet;
	const create = (name: string) =>
		instance.ownerDocument!.createElementNS(instance.namespaceURI, name);
	let node = cell.local;
	const created = !node;
	if (!node) {
		let parent = instance;
		if (cell.section) {
			const wanted = `${cell.section.name}:${cell.section.index ?? '0'}`;
			let section = children(instance, 'Section').find((item) => sectionKey(item) === wanted);
			if (!section) {
				section = create('Section');
				section.setAttribute('N', cell.section.name);
				if (cell.section.index !== undefined) section.setAttribute('IX', cell.section.index);
				const tail = Array.from(instance.childNodes).find(
					(child) => child.nodeType === 1 && AFTER_SECTIONS.includes((child as Element).localName),
				);
				instance.insertBefore(section, tail ?? null);
			}
			parent = section;
			const source = cell.row;
			if (source) {
				let row = children(section, 'Row').find((item) => rowKey(item) === rowKey(source));
				if (!row) {
					row = create('Row');
					for (const name of ['T', 'N', 'IX']) {
						const item = attribute(source, name);
						if (item !== undefined) row.setAttribute(name, item);
					}
					// Rows stay in index order, as Visio writes them.
					const index = Number(attribute(source, 'IX'));
					const next = Number.isFinite(index)
						? children(section, 'Row').find((item) => Number(attribute(item, 'IX')) > index)
						: undefined;
					section.insertBefore(row, next ?? null);
				}
				parent = row;
			}
		}
		node = create('Cell');
		node.setAttribute('N', cell.name);
		const tail = Array.from(parent.childNodes).find(
			(child) => child.nodeType === 1 && (child as Element).localName !== 'Cell',
		);
		parent.insertBefore(node, tail ?? null);
		cell.local = node;
	}
	node.setAttribute('V', value);
	node.removeAttribute('E');
	const unit = options.unit ?? attribute(cell.inherited, 'U');
	// A new cell takes the master's unit tag, as Visio's refreshed caches do.
	if (unit !== undefined && (created || options.unit !== undefined)) node.setAttribute('U', unit);
	if (options.formula) node.setAttribute('F', options.formula);
	else node.removeAttribute('F');
	return node;
}

/** The top-level stencil instance `shapeId` and the master shape it inherits from. */
export async function instanceTarget(
	root: Element,
	shapeId: string,
	template: MasterTemplate,
	code = 'UNSUPPORTED_INSTANCE_EDIT',
): Promise<{ instance: Element; template: Element } | undefined> {
	const containers = children(root, 'Shapes');
	if (containers.length !== 1) return undefined;
	const candidates = children(containers[0], 'Shape').filter(
		(shape) => attribute(shape, 'ID') === shapeId,
	);
	const instance = candidates.length === 1 ? candidates[0]! : undefined;
	const masterId = instance && attribute(instance, 'Master');
	if (!instance || masterId === undefined) return undefined;
	try {
		return { instance, template: await template(masterId) };
	} catch (error) {
		if (error instanceof VisioPackageError && error.code === 'UNSUPPORTED_TEXT_EDIT')
			fail(code, error.message);
		throw error;
	}
}
