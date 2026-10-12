import { NS } from '../xml/index';
import { relAttr } from '../xml/index';
import { VisioPackage } from './package';
import { fail, type VisioPackageLimits } from './package-common';
import { related, visioXml } from './parts';
import { attribute, children } from './sheet';
import { openEditablePackage, writeEditedPackage } from './edit-package';
import { serializeEditedXml } from './edit-text';
import {
	adoRecordsetXml,
	DATA_RECORDSET_TYPE,
	DATA_RECORDSETS_TYPE,
	readAdoRecordset,
	readDataRecordsets,
	type VisioDataColumn,
} from './data-recordsets';
import type { VisioDataEdit } from './edit-data-commands';
import {
	DataPackageParts,
	dataColumnsElement,
	dataElement,
	visioLinkedRowNames,
} from './edit-data-parts';
export { visioLinkedRowNames } from './edit-data-parts';
import {
	assertShapeDataUnreferenced,
	propertyRow,
	propertySection,
	shapeDataOwner,
	writePropertyRow,
} from './edit-shape-data';
import type { EditVsdxResult } from './edit';

interface Recordset {
	element: Element;
	dataPart: string;
	relId: string;
	columns: VisioDataColumn[];
	rows?: string[][];
}

/** Atomic DataRecordSets transaction: parts, relationships, content types and linked shapes. */
export async function editVsdxData(
	pkg: VisioPackage,
	parts: Map<string, Uint8Array>,
	pages: ReadonlyMap<string, string>,
	edits: readonly VisioDataEdit[],
	limits: VisioPackageLimits,
	maxOutput: number,
	deadline: number,
	check: () => void,
): Promise<EditVsdxResult> {
	const documentPart = (await related(pkg, '', 'document'))!;
	const store = new DataPackageParts(pkg, parts);
	const roots = new Map<string, Element>();
	for (const [pageId, path] of pages) {
		const source = await visioXml(pkg, path, 'PageContents');
		roots.set(pageId, (source.ownerDocument!.cloneNode(true) as Document).documentElement);
	}
	const dirtyPages = new Set<string>();
	let recordsetsPart = await related(pkg, documentPart, 'recordsets', false);
	if (recordsetsPart) await visioXml(pkg, recordsetsPart, 'DataRecordSets');
	let root = recordsetsPart ? await store.load(recordsetsPart, 'DataRecordSets') : undefined;
	const sets = new Map<string, Recordset>();
	const relTargets = new Map(
		recordsetsPart
			? [...(await pkg.relationships(recordsetsPart)).entries()].map(([id, rel]) => [
					id,
					rel.target,
				])
			: [],
	);
	const describe = (element: Element): Recordset => {
		const relId = relAttr(children(element, 'Rel')[0], 'id') ?? '';
		const dataPart = relTargets.get(relId);
		if (!dataPart) fail('INVALID_DATA_RECORDSET', 'A data recordset has no data part.');
		return {
			element,
			relId,
			dataPart: dataPart!,
			columns: children(children(element, 'DataColumns')[0], 'DataColumn').map((node) => {
				const name = attribute(node, 'ColumnNameID') ?? attribute(node, 'Name') ?? '';
				const code = attribute(node, 'DataType');
				return {
					name,
					label: attribute(node, 'Label') ?? name,
					type:
						code === '2' || code === '7'
							? 'number'
							: code === '3'
								? 'boolean'
								: code === '5'
									? 'date'
									: 'string',
				};
			}),
		};
	};
	for (const element of children(root, 'DataRecordSet'))
		sets.set(attribute(element, 'ID') ?? '', describe(element));
	const recordset = (id: string): Recordset => {
		const set = sets.get(id);
		if (!set) fail('EDIT_TARGET_NOT_FOUND', 'The data recordset does not exist.');
		return set!;
	};
	const rowsOf = async (set: Recordset): Promise<string[][]> => {
		if (set.rows) return set.rows;
		const ado = readAdoRecordset(await pkg.readXml(set.dataPart), { characters: 0 }, check);
		if (!set.columns.length)
			set.columns = ado.columns.map((c) => ({
				name: c.name,
				label: c.name,
				type: c.type ?? 'string',
			}));
		set.rows = ado.rows.map((row) => set.columns.map((column) => row.get(column.name) ?? ''));
		return set.rows;
	};
	const linkShape = (pageId: string, shapeId: string, set: Recordset, values: string[]) => {
		const page = roots.get(pageId);
		if (!page) return false;
		const shape = shapeDataOwner(page, shapeId);
		const names = visioLinkedRowNames(set.columns);
		assertShapeDataUnreferenced(roots.values(), new Set(names), check);
		set.columns.forEach((column, index) =>
			writePropertyRow(
				shape,
				names[index]!,
				{
					label: column.label,
					prompt: '',
					type: column.type,
					format: '',
					value: values[index] ?? '',
				},
				true,
			),
		);
		dirtyPages.add(pageId);
		return true;
	};
	const unlinkShape = (pageId: string, shapeId: string, set: Recordset) => {
		const page = roots.get(pageId);
		const shape = page
			? Array.from(page.getElementsByTagNameNS(page.namespaceURI, 'Shape')).find(
					(node) => attribute(node, 'ID') === shapeId,
				)
			: undefined;
		if (!shape) return;
		const section = propertySection(shape, false);
		for (const name of visioLinkedRowNames(set.columns)) {
			const row = propertyRow(section, name);
			const cell = children(row, 'Cell').find((node) => attribute(node, 'N') === 'DataLinked');
			if (cell && attribute(cell, 'V') !== '0' && !cell.hasAttribute('F')) {
				cell.setAttribute('V', '0');
				dirtyPages.add(pageId);
			}
		}
	};
	const node = (name: string, attributes: Record<string, string>) =>
		dataElement(root!, name, attributes);
	const columnsElement = (columns: readonly VisioDataColumn[]) =>
		dataColumnsElement(root!, columns);
	const now = new Date().toISOString().slice(0, 19);
	const writeData = (set: Recordset, columns: VisioDataColumn[], rows: string[][]) => {
		set.columns = columns;
		set.rows = rows;
		store.bytes.set(
			set.dataPart,
			new TextEncoder().encode(
				adoRecordsetXml(
					columns,
					rows.map((values, index) => ({ id: String(index + 1), values })),
				),
			),
		);
		set.element.setAttribute('NextRowID', String(rows.length + 1));
		set.element.setAttribute('TimeRefreshed', now);
	};
	for (const edit of edits) {
		check();
		if (edit.type === 'import-data-recordset') {
			if (!root) {
				recordsetsPart = store.exists('visio/data/recordsets.xml')
					? store.freeName('visio/data/recordsets')
					: 'visio/data/recordsets.xml';
				root = store.createRecordsets(recordsetsPart);
				await store.relate(documentPart, 'recordsets', recordsetsPart);
				await store.override(recordsetsPart, DATA_RECORDSETS_TYPE);
			}
			if (sets.size >= 64) fail('LIMIT_DATA', 'A drawing holds at most 64 data recordsets.');
			const next = Number(attribute(root, 'NextID') ?? '0');
			let id = Number.isSafeInteger(next) && next >= 0 ? next : 0;
			while (sets.has(String(id))) id++;
			root.setAttribute('NextID', String(id + 1));
			const dataPart = store.freeName('visio/data/data');
			const relId = await store.relate(recordsetsPart!, 'recordset', dataPart);
			await store.override(dataPart, DATA_RECORDSET_TYPE);
			const element = node('DataRecordSet', { ID: String(id), Name: edit.name, RowOrder: '1' });
			const rel = node('Rel', {});
			rel.setAttributeNS(NS.r, 'r:id', relId);
			element.appendChild(rel);
			element.appendChild(columnsElement(edit.columns));
			root.appendChild(element);
			const set: Recordset = { element, dataPart, relId, columns: edit.columns };
			sets.set(String(id), set);
			writeData(set, edit.columns, edit.rows);
		} else if (edit.type === 'refresh-data-recordset') {
			const set = recordset(edit.recordsetId);
			const old = children(set.element, 'DataColumns')[0];
			const replacement = columnsElement(edit.columns);
			if (old) set.element.replaceChild(replacement, old);
			else
				set.element.insertBefore(replacement, children(set.element, 'Rel')[0]?.nextSibling ?? null);
			const previous = set.columns;
			writeData(set, edit.columns, edit.rows);
			for (const map of children(set.element, 'RowMap')) {
				const index = Number(attribute(map, 'RowID')) - 1;
				const pageId = attribute(map, 'PageID') ?? '',
					shapeId = attribute(map, 'ShapeID') ?? '';
				const values = edit.rows[index];
				if (!values || !linkShape(pageId, shapeId, set, values)) {
					unlinkShape(pageId, shapeId, { ...set, columns: previous });
					set.element.removeChild(map);
				}
			}
		} else if (edit.type === 'delete-data-recordset') {
			const set = recordset(edit.recordsetId);
			for (const map of children(set.element, 'RowMap'))
				unlinkShape(attribute(map, 'PageID') ?? '', attribute(map, 'ShapeID') ?? '', set);
			root!.removeChild(set.element);
			sets.delete(edit.recordsetId);
			await store.unrelate(recordsetsPart!, 'recordset', set.relId);
			await store.override(set.dataPart, null);
			store.remove(set.dataPart);
			if (!sets.size) {
				await store.unrelate(documentPart, 'recordsets');
				await store.override(recordsetsPart!, null);
				store.remove(recordsetsPart!);
				root = undefined;
				recordsetsPart = undefined;
			}
		} else {
			const set = recordset(edit.recordsetId);
			if (!roots.has(edit.pageId)) fail('EDIT_TARGET_NOT_FOUND', 'Page does not exist.');
			const shapes =
				edit.type === 'link-data-rows' ? edit.links.map((link) => link.shapeId) : edit.shapeIds;
			for (const map of children(set.element, 'RowMap'))
				if (
					attribute(map, 'PageID') === edit.pageId &&
					shapes.includes(attribute(map, 'ShapeID') ?? '')
				)
					set.element.removeChild(map);
			if (edit.type === 'unlink-data-rows') {
				for (const shapeId of edit.shapeIds) unlinkShape(edit.pageId, shapeId, set);
				continue;
			}
			const rows = await rowsOf(set);
			for (const link of edit.links) {
				const values = rows[Number(link.rowId) - 1];
				if (!values) fail('EDIT_TARGET_NOT_FOUND', 'The data row does not exist.');
				linkShape(edit.pageId, link.shapeId, set, values!);
				set.element.appendChild(
					node('RowMap', { RowID: link.rowId, PageID: edit.pageId, ShapeID: link.shapeId }),
				);
			}
		}
	}
	for (const pageId of dirtyPages) store.xml.set(pages.get(pageId)!, roots.get(pageId)!);
	let total = [...parts.values()].reduce((sum, bytes) => sum + bytes.length, 0);
	let nodes = 0;
	const changed: string[] = [];
	for (const [path, xml] of store.xml) {
		const serialized = serializeEditedXml(xml, limits, check);
		nodes += serialized.nodes;
		if (nodes > limits.maxTotalXmlNodes)
			fail('LIMIT_XML_TOTAL', 'Edited XML node total exceeds limit.');
		total += serialized.bytes.length - (parts.get(path)?.length ?? 0);
		parts.set(path, serialized.bytes);
		changed.push(path);
	}
	for (const [path, bytes] of store.bytes) {
		total += (bytes?.length ?? 0) - (parts.get(path)?.length ?? 0);
		if (bytes) parts.set(path, bytes);
		else parts.delete(path);
		changed.push(path);
	}
	if (total > limits.maxTotalBytes) fail('LIMIT_TOTAL', 'Edited package total exceeds limit.');
	if (parts.size > limits.maxEntries)
		fail('LIMIT_ENTRIES', 'The data transaction exceeds the package entry limit.');
	const bytes = await writeEditedPackage(parts, maxOutput, deadline, check);
	const verified = await openEditablePackage(
		bytes,
		{ ...limits, maxInputBytes: maxOutput, maxRuntimeMs: Math.max(1, deadline - Date.now()) },
		check,
	);
	await readDataRecordsets(verified.pkg, documentPart, check);
	for (const pageId of dirtyPages) await visioXml(verified.pkg, pages.get(pageId)!, 'PageContents');
	return {
		bytes,
		changedParts: [...new Set(changed)],
		diagnostics: [
			{
				code: 'edit-data-recordsets',
				message:
					'External data is saved as DataRecordSets with cached ADO rows and RowMap links; no data connection is stored, so refreshing needs the source file again. Native Visio acceptance is unverified.',
			},
		],
	};
}
