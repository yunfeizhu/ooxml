import { attribute, children } from './sheet';
import { fail } from './package-common';
import { visioFormulaCachedValue } from './formula';

function inheritedProtection(node: Element, ancestor: Element | undefined): void {
	try {
		const boolean = (cell: Element | undefined) => {
			if (!cell || cell.hasAttribute('E'))
				fail('EDIT_PROTECTED_CELL', 'Inherited protection has an unresolved or error cache.');
			const value = visioFormulaCachedValue(attribute(cell, 'V') ?? '', attribute(cell, 'U'));
			if (value.unit !== 'scalar' || ![0, 1].includes(value.value))
				fail('EDIT_PROTECTED_CELL', 'Inherited protection requires scalar boolean caches.');
			return value.value;
		};
		if (boolean(node) !== boolean(ancestor))
			fail(
				'EDIT_PROTECTED_CELL',
				'Delegated master style protection cache disagrees with its ancestor.',
			);
	} catch (error) {
		fail(
			'EDIT_PROTECTED_CELL',
			`Inherited master style protection cannot be proven: ${error instanceof Error ? error.message : 'invalid cache'}`,
		);
	}
}

export function masterCells(
	sheet: Element | undefined,
	charge: () => void = () => {},
): Map<string, Element> {
	const result = new Map<string, Element>();
	if (!sheet) return result;
	const add = (name: string, node: Element) => {
		charge();
		const id = name.toLowerCase();
		if (result.has(id) && result.get(id) !== node)
			fail('EDIT_UNSUPPORTED_PACKAGE_DEPENDENCY', 'Ambiguous effective master cells.');
		result.set(id, node);
	};
	for (const node of children(sheet, 'Cell')) add(attribute(node, 'N') ?? '', node);
	for (const section of children(sheet, 'Section')) {
		const name = attribute(section, 'N') ?? '';
		const prefix =
			name === 'Geometry'
				? `Geometry${Number(attribute(section, 'IX') ?? '0') + 1}`
				: name === 'Control'
					? 'Controls'
					: name;
		for (const node of children(section, 'Cell'))
			add(`${prefix}.${attribute(node, 'N') ?? ''}`, node);
		for (const row of children(section, 'Row'))
			for (const node of children(row, 'Cell')) {
				const n = attribute(node, 'N') ?? '';
				const rowName = attribute(row, 'N');
				const index =
					attribute(row, 'IX') ??
					(prefix === 'Controls' && /^Row_\d+$/.test(rowName ?? '')
						? String(Number(rowName!.slice(4)) - 1)
						: undefined);
				const ix = index ?? '0',
					r = rowName ?? (prefix === 'Controls' ? `Row_${Number(ix) + 1}` : ix);
				// Formulas count Scratch, Controls and Connections rows from one (Scratch.Y1 is the
				// row with IX 0) and say Connections for the Connection section; geometry rows
				// already carry their one-based index.
				const numbered = ['Controls', 'Scratch', 'Connection'].includes(prefix);
				add(
					name === 'Geometry'
						? `${prefix}.${n}${ix}`
						: numbered
							? `${prefix === 'Connection' ? 'Connections' : prefix}.${n}${Number(ix) + 1}`
							: n === 'Value' && ['User', 'Prop'].includes(name)
								? `${prefix}.${r}`
								: `${prefix}.${r}.${n}`,
					node,
				);
				if (name !== 'Geometry') add(`${prefix}.${r}.${n}`, node);
				// Formulas (Visio's point glue among them) name connection points from one.
				if (prefix === 'Connection' && index !== undefined)
					add(`Connections.${n}${Number(ix) + 1}`, node);
				if (prefix === 'Controls' && n === 'X') add(`${prefix}.${r}`, node);
				if (name !== 'Geometry' && index !== undefined) add(`${prefix}.$row${ix}.${n}`, node);
			}
	}
	return result;
}
export function masterShapes(root: Element): Element[] {
	const result: Element[] = [],
		pending = [root];
	while (pending.length) {
		const parent = pending.pop()!;
		for (const container of children(parent, 'Shapes'))
			for (const shape of children(container, 'Shape')) {
				result.push(shape);
				pending.push(shape);
			}
	}
	return result;
}
export function assertMasterMarkup(
	root: Element,
	known: ReadonlySet<Element>,
	check: () => void,
): void {
	for (const node of [root, ...Array.from(root.getElementsByTagName('*'))]) {
		check();
		if (node.namespaceURI === root.namespaceURI && node.hasAttribute('F') && !known.has(node))
			fail(
				'EDIT_UNSUPPORTED_PACKAGE_DEPENDENCY',
				'Master formula outside admitted sheet cells has unknown scope.',
			);
	}
}
export function masterStyleCells(
	document: Element,
	template: Element,
	instance: Element | undefined,
	check: () => void,
	charge: () => void = () => {},
	verifyMovementProtection = false,
): Map<string, Element> {
	const styles = new Map<string, Element>();
	for (const container of children(document, 'StyleSheets'))
		for (const style of children(container, 'StyleSheet')) {
			charge();
			const id = attribute(style, 'ID');
			if (!id || styles.has(id))
				fail('EDIT_UNSUPPORTED_PACKAGE_DEPENDENCY', 'Ambiguous master style IDs.');
			styles.set(id, style);
		}
	const defaults = children(document, 'DocumentSheet')[0];
	const collect = (
		id: string,
		category: string,
		seen = new Set<string>(),
	): Map<string, Element> => {
		check();
		if (seen.has(id) || seen.size >= 64)
			fail('EDIT_UNSUPPORTED_PACKAGE_DEPENDENCY', 'Invalid inherited master style ancestry.');
		seen.add(id);
		const style = styles.get(id);
		if (!style) fail('EDIT_UNSUPPORTED_PACKAGE_DEPENDENCY', 'Missing inherited master style.');
		const own = masterCells(style, charge);
		assertMasterMarkup(style, new Set(own.values()), check);
		const parent = attribute(style, category);
		const result =
			parent !== undefined && parent !== id
				? collect(parent, category, seen)
				: new Map<string, Element>();
		for (const [name, node] of own) {
			charge();
			if (attribute(node, 'F') !== 'Inh') result.set(name, node);
			else if (
				verifyMovementProtection &&
				/^lock(move[xy]|width|height|aspect|delete)$/.test(name)
			) {
				charge();
				inheritedProtection(node, result.get(name));
			}
		}
		return result;
	};
	const result = new Map<string, Element>();
	for (const category of ['LineStyle', 'FillStyle', 'TextStyle']) {
		const id =
			attribute(instance, category) ??
			attribute(template, category) ??
			attribute(defaults, category) ??
			(styles.has('0') ? '0' : undefined);
		if (id !== undefined)
			for (const [name, node] of collect(id, category)) {
				charge();
				if (result.has(name) && result.get(name) !== node)
					fail(
						'EDIT_UNSUPPORTED_PACKAGE_DEPENDENCY',
						'Master style categories have ambiguous overlapping inputs.',
					);
				result.set(name, node);
			}
	}
	return result;
}

export interface MasterCellSource {
	node: Element;
	kind: 'template' | 'instance' | 'style';
}
export function overlay(
	cells: Map<string, MasterCellSource>,
	additions: Map<string, Element>,
	kind: MasterCellSource['kind'],
	charge: () => void,
): void {
	const aliases = new Map<Element, Set<string>>(),
		inherited = new Map<Element, MasterCellSource>();
	for (const [name, source] of cells) {
		charge();
		const names = aliases.get(source.node) ?? new Set<string>();
		names.add(name);
		aliases.set(source.node, names);
	}
	for (const [name, node] of additions) {
		charge();
		const source = cells.get(name);
		if (source) inherited.set(node, source);
	}
	for (const [name, node] of additions) {
		charge();
		if (attribute(node, 'F') === 'Inh') {
			const source = cells.get(name) ?? inherited.get(node);
			if (!source)
				fail(
					'EDIT_UNSUPPORTED_PACKAGE_DEPENDENCY',
					'Inherited master cell has no effective source.',
				);
			cells.set(name, source);
			const names = aliases.get(source.node) ?? new Set<string>();
			names.add(name);
			aliases.set(source.node, names);
			continue;
		}
		const previous = cells.get(name),
			names = aliases.get(node) ?? new Set<string>();
		if (previous && previous.node !== node) {
			for (const alias of aliases.get(previous.node) ?? []) {
				charge();
				cells.set(alias, { node, kind });
				names.add(alias);
			}
			aliases.delete(previous.node);
		}
		cells.set(name, { node, kind });
		names.add(name);
		aliases.set(node, names);
	}
}
