import { attribute, children, yes } from './sheet';
import { related, visioXml } from './parts';
import { fail } from './package-common';
import { setCell } from './edit-geometry-cells';
import { pageSettingConstant } from './edit-page-size';
import { explicitPageSheet, pageById } from './edit-page-setup';
import { createVisioPagePart, type VisioPageParts } from './edit-page-create';
import { deleteVisioPage } from './edit-page-delete';
import {
	applyShapeCreationStyles,
	createShape,
	outlineGeometrySections,
} from './edit-shape-create';
import { visioBasicShapeOutline } from './basic-shapes';
import { encodeVisioPlainText } from './plain-text';
import {
	VISIO_MANAGED_BACKGROUND,
	visioBackgroundShapes,
	visioBorderShapes,
	visioDecorationName,
	type VisioDecorationShape,
} from './page-decoration';
import type { VisioPackage } from './package';
import type { VisioPageDecorationEdit } from './edit-page-setup-commands';

export interface DecorationContext {
	pkg: VisioPackage;
	pages: Element;
	parts: VisioPageParts;
	packageParts: Map<string, Uint8Array>;
	removed: Set<string>;
	check: () => void;
}
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const name = (page: Element) => attribute(page, 'NameU') ?? attribute(page, 'Name') ?? '';

/** Shape IDs anywhere in a page, for allocating new sheets. */
function largestShapeId(root: Element): number {
	let largest = 0;
	for (const node of Array.from(root.getElementsByTagName('*')))
		if (node.localName === 'Shape' && /^[1-9]\d{0,9}$/.test(attribute(node, 'ID') ?? ''))
			largest = Math.max(largest, Number(attribute(node, 'ID')));
	return largest;
}

/** Remove the top-level decoration sheets of one kind, refusing referenced ones. */
function removeDecoration(
	root: Element,
	pageName: string,
	kind: 'background' | 'border',
	pageRoots: readonly Element[],
	check: () => void,
): boolean {
	const container = children(root, 'Shapes')[0];
	const targets = container
		? children(container, 'Shape').filter(
				(shape) => visioDecorationName(attribute(shape, 'Name') ?? '')?.kind === kind,
			)
		: [];
	if (!targets.length) return false;
	const ids = targets.map((shape) => attribute(shape, 'ID') ?? '');
	const local = new RegExp(`\\bSheet\\.(?:${ids.map(escape).join('|')})!`, 'i');
	const remote = new RegExp(
		`Pages\\[${escape(pageName)}\\]!Sheet\\.(?:${ids.map(escape).join('|')})!`,
		'i',
	);
	for (const connect of children(root, 'Connects').flatMap((node) => children(node, 'Connect')))
		if (
			ids.includes(attribute(connect, 'FromSheet') ?? '') ||
			ids.includes(attribute(connect, 'ToSheet') ?? '')
		)
			fail('EDIT_DECORATION_IN_USE', 'A connector is glued to the background decoration.');
	for (const page of pageRoots)
		for (const node of Array.from(page.getElementsByTagName('*'))) {
			check();
			const formula = attribute(node, 'F');
			if (!formula || targets.some((shape) => shape.contains(node))) continue;
			if ((page === root && local.test(formula)) || remote.test(formula))
				fail('EDIT_DECORATION_IN_USE', 'A formula refers to the background decoration.');
		}
	for (const shape of targets) container!.removeChild(shape);
	return true;
}

function text(shape: Element, cellName: string, value: string): void {
	const node = shape.ownerDocument!.createElementNS(shape.namespaceURI, 'Cell');
	node.setAttribute('N', cellName);
	node.setAttribute('V', value);
	return void shape.appendChild(node);
}
function section(shape: Element, sectionName: string, cells: [string, string, string?][]): void {
	const node = (tag: string) => shape.ownerDocument!.createElementNS(shape.namespaceURI, tag);
	const owner = node('Section');
	owner.setAttribute('N', sectionName);
	const row = node('Row');
	row.setAttribute('IX', '0');
	for (const [cellName, value, unit] of cells) {
		const cell = node('Cell');
		cell.setAttribute('N', cellName);
		cell.setAttribute('V', value);
		if (unit) cell.setAttribute('U', unit);
		row.appendChild(cell);
	}
	owner.appendChild(row);
	shape.appendChild(owner);
}

/** One plain local rectangle in drawing units (`ratio` drawing inches per page inch). */
function decorationShape(
	root: Element,
	document: Element,
	id: number,
	spec: VisioDecorationShape,
	ratio: number,
): Element {
	const shape = createShape(root, String(id));
	shape.setAttribute('Name', spec.name);
	shape.setAttribute('NameU', spec.name);
	applyShapeCreationStyles(shape, document);
	const width = spec.width * ratio,
		height = spec.height * ratio;
	setCell(shape, 'PinX', (spec.x + spec.width / 2) * ratio);
	setCell(shape, 'PinY', (spec.y + spec.height / 2) * ratio);
	setCell(shape, 'Width', width);
	setCell(shape, 'Height', height);
	setCell(shape, 'LocPinX', width / 2, 'Width*0.5');
	setCell(shape, 'LocPinY', height / 2, 'Height*0.5');
	setCell(shape, 'Angle', 0);
	setCell(shape, 'FillPattern', spec.fill ? 1 : 0);
	if (spec.fill) text(shape, 'FillForegnd', spec.fill);
	setCell(shape, 'LinePattern', spec.line ? 1 : 0);
	if (spec.line) {
		text(shape, 'LineColor', spec.line);
		setCell(shape, 'LineWeight', 1 / 72);
	}
	setCell(shape, 'ShdwPattern', 0);
	if (spec.text !== undefined) {
		setCell(shape, 'VerticalAlign', 1);
		section(shape, 'Character', [
			['Color', spec.textColor ?? '#000000'],
			['Size', String(spec.textSize ?? 1 / 6), 'PT'],
			['Style', '1'],
		]);
		section(shape, 'Paragraph', [['HorzAlign', '0']]);
	}
	for (const geometry of outlineGeometrySections(shape, visioBasicShapeOutline('rectangle')))
		shape.appendChild(geometry);
	if (spec.text !== undefined) {
		const node = shape.ownerDocument!.createElementNS(shape.namespaceURI, 'Text');
		node.appendChild(shape.ownerDocument!.createTextNode(encodeVisioPlainText(spec.text)));
		shape.appendChild(node);
	}
	return shape;
}

/** Design > Backgrounds and Borders & Titles on the page's managed `VBackground` page. */
export async function setVisioPageDecoration(
	context: DecorationContext,
	command: VisioPageDecorationEdit,
): Promise<void> {
	const { pkg, pages, parts, check } = context;
	const page = pageById(pages, command.pageId);
	if (yes(attribute(page, 'Background')))
		fail('EDIT_UNSUPPORTED_PAGE_DECORATION', 'Backgrounds and borders decorate foreground pages.');
	const list = children(pages, 'Page');
	const backId = attribute(page, 'BackPage');
	let background =
		backId === undefined ? undefined : list.find((node) => attribute(node, 'ID') === backId);
	if (backId !== undefined && !background)
		fail('EDIT_UNSUPPORTED_PAGE_DECORATION', 'The assigned background page is missing.');
	if (background && !VISIO_MANAGED_BACKGROUND.test(name(background)))
		fail(
			'EDIT_UNSUPPORTED_PAGE_DECORATION',
			`The page uses its own background page "${name(background)}"; only a VBackground page is managed by Backgrounds and Borders & Titles.`,
		);
	if (!background && command.style === null) return;
	const documentPart = (await related(pkg, '', 'document'))!;
	const document = await visioXml(pkg, documentPart, 'VisioDocument');
	if (!background) {
		if (command.backgroundPageId === undefined)
			fail('INVALID_EDIT', 'A new background page ID is required.');
		if (list.some((node) => attribute(node, 'ID') === command.backgroundPageId))
			fail('EDIT_DUPLICATE_PAGE', 'New page ID already exists.');
		const { sheet } = explicitPageSheet(page);
		const names = new Set(
			list.flatMap((node) => ['Name', 'NameU'].map((key) => attribute(node, key)?.toLowerCase())),
		);
		let index = 1;
		while (names.has(`vbackground-${index}`)) ++index;
		const created = createVisioPagePart(parts, pages, command.backgroundPageId!, check).page;
		created.setAttribute('Name', `VBackground-${index}`);
		created.setAttribute('NameU', `VBackground-${index}`);
		created.setAttribute('Background', '1');
		created.insertBefore(sheet.cloneNode(true), created.firstChild);
		pages.appendChild(created);
		page.setAttribute('BackPage', command.backgroundPageId!);
		background = created;
	}
	const backgroundId = attribute(background, 'ID')!;
	const path = parts.pagePaths.get(backgroundId)!;
	const root =
		parts.dirty.get(path) ??
		((await visioXml(pkg, path, 'PageContents')).ownerDocument!.cloneNode(true) as Document)
			.documentElement;
	const pageRoots: Element[] = [];
	for (const [id, other] of parts.pagePaths) {
		check();
		pageRoots.push(
			id === backgroundId
				? root
				: (parts.dirty.get(other) ?? (await visioXml(pkg, other, 'PageContents'))),
		);
	}
	let changed = removeDecoration(root, name(background), command.kind, pageRoots, check);
	if (command.style !== null) {
		const { cells } = explicitPageSheet(background);
		const pageScale = pageSettingConstant(cells.get('PageScale'), true),
			drawingScale = pageSettingConstant(cells.get('DrawingScale'), true);
		const ratio = drawingScale / pageScale;
		const width = pageSettingConstant(cells.get('PageWidth'), true) / ratio,
			height = pageSettingConstant(cells.get('PageHeight'), true) / ratio;
		if (!(ratio > 0) || !(width > 0) || !(height > 0))
			fail('EDIT_UNSUPPORTED_PAGE_SIZE', 'The background page needs a positive size and scale.');
		const specs =
			command.kind === 'background'
				? visioBackgroundShapes(command.style, width, height, command.color)
				: visioBorderShapes(command.style, width, height, command.title);
		let next = largestShapeId(root);
		const created = specs.map((spec) => decorationShape(root, document, ++next, spec, ratio));
		if (command.kind === 'background') {
			// Backgrounds sit behind everything else on the background page.
			const container = created[0]!.parentNode!;
			const first = Array.from(container.childNodes).find(
				(node) => node.nodeType === 1 && !created.includes(node as Element),
			);
			for (const shape of created) container.insertBefore(shape, first ?? null);
		}
		changed = true;
	}
	if (!changed) return;
	parts.dirty.set(path, root);
	const container = children(root, 'Shapes')[0];
	const empty = !container || !children(container, 'Shape').length;
	const users = list.filter((node) => attribute(node, 'BackPage') === backgroundId);
	if (command.style === null && empty && users.every((node) => node === page)) {
		parts.dirty.delete(path);
		await deleteVisioPage(
			pkg,
			parts.pagesPart,
			pages,
			parts.rels,
			parts.types,
			parts.pagePaths,
			context.packageParts,
			parts.dirty,
			context.removed,
			backgroundId,
			check,
		);
	}
}
