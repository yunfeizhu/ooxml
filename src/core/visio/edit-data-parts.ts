import { NS, parseXml } from '../xml/index';
import { relationshipsPartFor, nextRelationshipId } from '../opc/relationships';
import type { VisioPackage } from './package';
import { decodePath } from './package-common';
import { VISIO_NS } from './sheet';
import { DATA_TYPE_CODES, type VisioDataColumn } from './data-recordsets';
import { visioShapeDataRowName } from './edit-shape-data-commands';

const REL = 'http://schemas.microsoft.com/visio/2010/relationships/';
const copy = (root: Element): Element =>
	(root.ownerDocument!.cloneNode(true) as Document).documentElement;

/** Package XML parts a data transaction may change, cloned on first use and written once. */
export class DataPackageParts {
	readonly xml = new Map<string, Element>();
	readonly bytes = new Map<string, Uint8Array | null>();
	constructor(
		private readonly pkg: VisioPackage,
		private readonly parts: ReadonlyMap<string, Uint8Array>,
	) {}
	async load(path: string, root: string): Promise<Element> {
		let element = this.xml.get(path);
		if (!element) {
			element = copy(await this.pkg.readXml(path, root));
			this.xml.set(path, element);
		}
		return element;
	}
	exists(path: string): boolean {
		if (this.bytes.has(path)) return this.bytes.get(path) !== null;
		if (this.xml.has(path)) return true;
		return this.parts.has(path);
	}
	/** The relationships of `part`, created empty when the part has none yet. */
	async rels(part: string): Promise<Element> {
		const path = relationshipsPartFor(part);
		if (this.xml.has(path)) return this.xml.get(path)!;
		if (this.exists(path)) return this.load(path, 'Relationships');
		const root = parseXml(`<Relationships xmlns="${NS.rels}"/>`).documentElement;
		this.xml.set(path, root);
		return root;
	}
	types(): Promise<Element> {
		return this.load('[Content_Types].xml', 'Types');
	}
	/** A free part name `prefix{n}.xml`, never colliding with existing or pending parts. */
	freeName(prefix: string): string {
		const taken = new Set(
			[...this.parts.keys(), ...this.xml.keys(), ...this.bytes.keys()].map((name) =>
				decodePath(name).toLowerCase(),
			),
		);
		let index = 1;
		while (taken.has(`${prefix}${index}.xml`.toLowerCase())) index++;
		return `${prefix}${index}.xml`;
	}
	/** Add a relationship from `source` to `target` (both package paths); returns its Id. */
	async relate(source: string, type: string, target: string): Promise<string> {
		const rels = await this.rels(source);
		const ids = new Set(
			Array.from(rels.getElementsByTagNameNS(NS.rels, 'Relationship')).map(
				(node) => node.getAttribute('Id') ?? '',
			),
		);
		const id = nextRelationshipId(ids);
		const node = rels.ownerDocument!.createElementNS(NS.rels, 'Relationship');
		node.setAttribute('Id', id);
		node.setAttribute('Type', REL + type);
		node.setAttribute('Target', relativeTarget(source, target));
		rels.appendChild(node);
		return id;
	}
	/** Remove `source`'s relationships of `type` (or the one with `id`). */
	async unrelate(source: string, type: string, id?: string): Promise<void> {
		const rels = await this.rels(source);
		for (const node of Array.from(rels.getElementsByTagNameNS(NS.rels, 'Relationship')))
			if (
				node.getAttribute('Type') === REL + type &&
				(id === undefined || node.getAttribute('Id') === id)
			)
				rels.removeChild(node);
		if (!rels.getElementsByTagNameNS(NS.rels, 'Relationship').length) {
			const path = relationshipsPartFor(source);
			this.xml.delete(path);
			this.bytes.set(path, null);
		}
	}
	async override(path: string, contentType: string | null): Promise<void> {
		const types = await this.types();
		for (const node of Array.from(types.getElementsByTagNameNS(types.namespaceURI, 'Override')))
			if (node.getAttribute('PartName')?.toLowerCase() === `/${path}`.toLowerCase())
				types.removeChild(node);
		if (contentType === null) return;
		const node = types.ownerDocument!.createElementNS(types.namespaceURI, 'Override');
		node.setAttribute('PartName', `/${path}`);
		node.setAttribute('ContentType', contentType);
		types.appendChild(node);
	}
	remove(path: string): void {
		this.xml.delete(path);
		this.bytes.set(path, null);
	}
	/** A new empty DataRecordSets root. */
	createRecordsets(path: string): Element {
		const root = parseXml(
			`<DataRecordSets xmlns="${VISIO_NS}" xmlns:r="${NS.r}" NextID="0"/>`,
		).documentElement;
		this.xml.set(path, root);
		this.bytes.delete(path);
		return root;
	}
}

/** A relationship Target from one package part to another, relative to the source folder. */
export function relativeTarget(source: string, target: string): string {
	const from = source.split('/').slice(0, -1);
	const to = target.split('/');
	let shared = 0;
	while (shared < from.length && shared < to.length - 1 && from[shared] === to[shared]) shared++;
	return [...from.slice(shared).map(() => '..'), ...to.slice(shared)].join('/');
}

const UNIT: Record<VisioDataColumn['type'], string> = {
	string: 'STR',
	number: 'NUM',
	boolean: 'BOOL',
	date: 'DATE',
};
/** The Prop row name each column links to, deduplicated in column order. */
export function visioLinkedRowNames(columns: readonly VisioDataColumn[]): string[] {
	const taken: string[] = [];
	for (const column of columns) taken.push(visioShapeDataRowName(column.name, taken));
	return taken;
}
/** An element in the DataRecordSets namespace with attributes in the given order. */
export function dataElement(root: Element, name: string, attributes: Record<string, string>) {
	const element = root.ownerDocument!.createElementNS(root.namespaceURI, name);
	for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
	return element;
}
/** DataColumns with Visio's DataColumn attribute set; DataType is the Shape Data type code. */
export function dataColumnsElement(root: Element, columns: readonly VisioDataColumn[]): Element {
	const element = dataElement(root, 'DataColumns', {});
	columns.forEach((column, index) =>
		element.appendChild(
			dataElement(root, 'DataColumn', {
				ColumnNameID: column.name,
				Name: column.name,
				Label: column.label,
				OrigLabel: column.label,
				LangID: '1033',
				Calendar: '0',
				DataType: String(DATA_TYPE_CODES[column.type]),
				UnitType: UNIT[column.type],
				Currency: '0',
				Degree: '0',
				DisplayWidth: '100',
				DisplayOrder: String(index),
				Mapped: '1',
				Hyperlink: '0',
			}),
		),
	);
	return element;
}
