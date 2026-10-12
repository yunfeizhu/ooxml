import { NS, parseXml } from '../xml/index';
import { relationshipsPartFor } from '../opc/relationships';
import { executableCellFormula } from './cell-formula';
import { connectRows } from './edit-connector';
import { isConnectedGlueCell } from './edit-connector-glue';
import { recalculateInstanceCaches } from './edit-instance-recalculate';
import {
	effectiveNode,
	instanceSheet,
	writeInstanceCell,
	type InstanceCell,
} from './edit-instance-sheet';
import { assertInstanceUnlocked, stencilInstance } from './edit-instance-shape';
import { nameMasterInstance } from './edit-master-instance-extras';
import type { MasterTemplate } from './edit-text-instance';
import { serializeEditedXml } from './edit-text';
import { visioFormulaCachedValue } from './formula';
import { unquotedVisioFormula } from './formula-source';
import type { VisioPackage } from './package';
import { fail, VisioPackageError, type VisioPackageLimits } from './package-common';
import { indexedPart, related, visioXml } from './parts';
import { attribute, children } from './sheet';

const MASTER_RELATIONSHIP = 'http://schemas.microsoft.com/visio/2010/relationships/master';
const refuse = (message: string): never => fail('UNSUPPORTED_CHANGE_SHAPE', message);
/** Local sections that hold the shape's own content and formatting, not its outline. */
const KEPT_SECTIONS = new Set(['Character', 'Paragraph', 'Tabs', 'Property', 'Hyperlink', 'Field']);
/** Local values the new master's formulas are recalculated from. */
const KEPT_TRANSFORM = ['Width', 'Height', 'PinX', 'PinY', 'Angle', 'FlipX', 'FlipY'];

export interface VisioReplaceMasterEdit {
	type: 'change-shape';
	pageId: string;
	shapeId: string;
	masterId: string;
}

const number = (cell: Element | undefined): number | undefined => {
	if (!cell || cell.hasAttribute('E')) return undefined;
	try {
		return visioFormulaCachedValue(attribute(cell, 'V') ?? '', attribute(cell, 'U')).value;
	} catch {
		return undefined;
	}
};

/** Drop the caches of the old master's formulas; refuse local outline or behaviour overrides. */
function stripInheritedCaches(instance: Element): void {
	for (const cell of children(instance, 'Cell'))
		if (attribute(cell, 'F') === 'Inh') instance.removeChild(cell);
	for (const section of children(instance, 'Section')) {
		for (const cell of children(section, 'Cell'))
			if (attribute(cell, 'F') === 'Inh') section.removeChild(cell);
		for (const row of children(section, 'Row')) {
			for (const cell of children(row, 'Cell'))
				if (attribute(cell, 'F') === 'Inh') row.removeChild(cell);
			if (!children(row, 'Cell').length && !row.hasAttribute('Del')) section.removeChild(row);
		}
		if (!children(section, 'Row').length && !children(section, 'Cell').length) {
			if (section.hasAttribute('Del'))
				refuse('The stencil shape removes part of its master, which another master lacks.');
			instance.removeChild(section);
		} else if (!KEPT_SECTIONS.has(attribute(section, 'N') ?? ''))
			refuse(
				`The stencil shape changes the ${attribute(section, 'N')} rows of its master, which another master would not have.`,
			);
	}
}

/** Add the page's relationship to a master part when it has none; the bytes go to `parts`. */
async function linkPage(
	pkg: VisioPackage,
	parts: Map<string, Uint8Array>,
	pagePath: string,
	masterPart: string,
	limits: VisioPackageLimits,
	check: () => void,
): Promise<void> {
	if (
		[...(await pkg.relationships(pagePath)).values()].some(
			(rel) => rel.type === MASTER_RELATIONSHIP && rel.target === masterPart,
		)
	)
		return;
	const relsPart = relationshipsPartFor(pagePath);
	const rels = parts.has(relsPart)
		? ((await pkg.readXml(relsPart, 'Relationships')).ownerDocument!.cloneNode(true) as Document)
				.documentElement
		: parseXml(`<Relationships xmlns="${NS.rels}"/>`).documentElement;
	const existing = Array.from(rels.getElementsByTagNameNS(rels.namespaceURI, 'Relationship'));
	const ids = new Set(existing.map((rel) => rel.getAttribute('Id') ?? ''));
	let index = 1;
	while (ids.has(`rId${index}`)) index++;
	const relationship = rels.ownerDocument!.createElementNS(rels.namespaceURI, 'Relationship');
	relationship.setAttribute('Id', `rId${index}`);
	relationship.setAttribute('Type', MASTER_RELATIONSHIP);
	// Page and master parts are siblings under visio/ in every package Visio writes.
	const from = pagePath.split('/').slice(0, -1);
	const to = masterPart.split('/');
	let shared = 0;
	while (shared < from.length && shared < to.length - 1 && from[shared] === to[shared]) shared++;
	relationship.setAttribute(
		'Target',
		[...from.slice(shared).map(() => '..'), ...to.slice(shared)].join('/'),
	);
	rels.appendChild(relationship);
	if (!parts.has(relsPart) && parts.size + 1 > limits.maxEntries)
		fail('LIMIT_ENTRIES', 'The edit exceeds the package entry limit.');
	parts.set(relsPart, serializeEditedXml(rels, limits, check).bytes);
}

/**
 * Home > Change Shape on a stencil shape: it becomes an instance of another master of the
 * drawing. As in Visio, the shape keeps its position, its size when it has one of its own, its
 * text, formatting, data and layers; everything it inherited now comes from the new master.
 * Visio also gives the shape a new sheet ID; this editor keeps the ID, so glue and references to
 * it stay valid as they are.
 */
export async function replaceInstanceMaster(
	pkg: VisioPackage,
	parts: Map<string, Uint8Array>,
	pagePath: string,
	root: Element,
	edit: VisioReplaceMasterEdit,
	template: MasterTemplate,
	limits: VisioPackageLimits,
	check: () => void,
): Promise<boolean> {
	const target = await stencilInstance(root, edit.shapeId, template, 'UNSUPPORTED_CHANGE_SHAPE');
	if (!target) return refuse('Only a stencil shape can take another master.');
	const { instance } = target;
	if (attribute(instance, 'Master') === edit.masterId) return false;
	await assertInstanceUnlocked(pkg, edit.pageId, target, ['LockReplace'], 'replacement');
	let before, replacement: Element;
	try {
		before = instanceSheet(instance, target.template);
		replacement = await template(edit.masterId);
	} catch (error) {
		if (!(error instanceof VisioPackageError) || error.code.startsWith('LIMIT_')) throw error;
		return refuse('Only shapes of a master made of one plain shape can change master.');
	}
	const oneD = (sheet: Element) =>
		children(sheet, 'Cell').some((cell) => /^(BeginX|EndX)$/.test(attribute(cell, 'N') ?? ''));
	if (oneD(instance) || oneD(target.template) || oneD(replacement))
		refuse('Lines and connectors cannot change master.');
	const id = edit.shapeId;
	const glued = connectRows(root).filter((row) => attribute(row, 'ToSheet') === id);
	if (connectRows(root).some((row) => attribute(row, 'FromSheet') === id))
		refuse('A shape that is glued to another cannot change master.');
	if (glued.some((row) => !/^Pin[XY]$/.test(attribute(row, 'ToCell') ?? '')))
		refuse(
			'A connector is glued to one of its connection points, which the new master may not have.',
		);
	// Another shape that computes from this one would read the new master's cells.
	const mention = new RegExp(`\\bSheet\\.${id}\\s*!`, 'i');
	for (const node of Array.from(root.getElementsByTagName('*'))) {
		check();
		const source = executableCellFormula(attribute(node, 'F'));
		if (source && mention.test(unquotedVisioFormula(source)) && !isConnectedGlueCell(node, source))
			refuse('Another shape computes its cells from this stencil shape.');
	}
	const size = (sheet: ReturnType<typeof instanceSheet>) =>
		['width', 'height'].map((name) => {
			const cell = sheet.byName.get(name);
			return number(cell && effectiveNode(cell));
		});
	const oldSize = size(before);
	const documentPart = (await related(pkg, '', 'document'))!;
	const mastersPart = await related(pkg, documentPart, 'masters', false);
	const master = mastersPart
		? children(await visioXml(pkg, mastersPart, 'Masters'), 'Master').filter(
				(node) => attribute(node, 'ID') === edit.masterId,
			)
		: [];
	if (!mastersPart || master.length !== 1)
		fail('EDIT_TARGET_NOT_FOUND', 'The master does not belong to this drawing.');
	const masterPart = await indexedPart(pkg, mastersPart!, master[0]!, 'master');

	stripInheritedCaches(instance);
	instance.setAttribute('Master', edit.masterId);
	// The old master's name no longer describes the shape: it is named after the new one, as
	// Visio's own Change Shape names it.
	instance.removeAttribute('Name');
	instance.removeAttribute('NameU');
	instance.removeAttribute('UniqueID');
	nameMasterInstance(root, instance, master[0]!);
	let sheet;
	try {
		sheet = instanceSheet(instance, replacement);
	} catch (error) {
		if (!(error instanceof VisioPackageError) || error.code.startsWith('LIMIT_')) throw error;
		return refuse('The new master is not made of one plain shape.');
	}
	const overrides = new Map<InstanceCell, number>();
	for (const name of KEPT_TRANSFORM) {
		const cell = sheet.byName.get(name.toLowerCase());
		const value = number(cell?.local);
		if (cell?.local && value !== undefined && !executableCellFormula(attribute(cell.local, 'F')))
			overrides.set(cell, value);
	}
	// A shape connectors are glued to keeps the size it shows, so they stay where they end.
	if (glued.length)
		['width', 'height'].forEach((name, index) => {
			const cell = sheet.byName.get(name);
			const kept = oldSize[index];
			if (!cell || kept === undefined || overrides.has(cell)) return;
			if (cell.local && executableCellFormula(attribute(cell.local, 'F'))) return;
			writeInstanceCell(sheet, cell, String(kept), { unit: 'IN' });
			overrides.set(cell, kept);
		});
	const { writes } = recalculateInstanceCaches(sheet, overrides, check);
	for (const write of writes) {
		check();
		writeInstanceCell(sheet, write.cell, String(Object.is(write.value, -0) ? 0 : write.value), {
			formula: 'Inh',
		});
	}
	const newSize = size(sheet);
	if (
		glued.length &&
		newSize.some(
			(value, index) =>
				value === undefined ||
				oldSize[index] === undefined ||
				Math.abs(value - oldSize[index]!) > 1e-9,
		)
	)
		refuse(
			'A connector is glued to this shape and the new master has another size, so the connector could not follow.',
		);
	await linkPage(pkg, parts, pagePath, masterPart, limits, check);
	return true;
}
