import { geometryChangedCells, type VisioGeometryEdit } from './edit-commands';
import type { VisioPackage } from './package';
import { attribute, children } from './sheet';
import { related, indexedPart, visioXml } from './parts';
import { fail } from './package-common';
import { executableCellFormula, inertDoubleClickFormula } from './cell-formula';
import { analyzeVisioMasterFormula } from './formula-master';
import { createVisioDependencyQuery } from './edit-recalculate';
import {
	prepareMasterMovePins,
	emptyMasterMoveProof,
	type MasterMoveProof,
} from './edit-master-move';
import {
	masterCells,
	masterShapes,
	masterStyleCells,
	assertMasterMarkup,
	overlay,
	type MasterCellSource as Source,
} from './edit-master-index';

interface Binding {
	id: string;
	pageId: string;
	template: Element;
	instance?: Element;
	cells: Map<string, Source>;
	inheritedCells: ReadonlyMap<string, Source>;
	context: Map<string, Binding>;
}
function problem(message: string): never {
	return fail('EDIT_UNSUPPORTED_PACKAGE_DEPENDENCY', message);
}

const themeCell = /^(ColorSchemeIndex|EffectSchemeIndex|FontSchemeIndex|ThemeIndex|QuickStyle.*)$/i;
/** Prove that effective cells of active master instances cannot depend on the edited local shapes.
 * Definitions remain untouched. Unsupported formulas and unresolved scopes remain refused.
 */
export async function assertVisioMasterIndependence(
	pkg: VisioPackage,
	roots: ReadonlyMap<string, Element>,
	commands: readonly VisioGeometryEdit[],
	check: () => void,
): Promise<MasterMoveProof> {
	const instances = [...roots].flatMap(([pageId, root]) =>
		masterShapes(root)
			.filter((shape) => shape.hasAttribute('Master'))
			.map((instance) => ({ pageId, instance })),
	);
	if (!instances.length) return emptyMasterMoveProof();
	const documentPart = await related(pkg, '', 'document');
	if (!documentPart) problem('Missing master document relationship.');
	const document = await visioXml(pkg, documentPart, 'VisioDocument');
	const mastersPart = await related(pkg, documentPart, 'masters', false);
	if (!mastersPart) {
		if (
			commands.some((command) =>
				instances.some(
					(item) =>
						item.pageId === command.pageId && attribute(item.instance, 'ID') === command.shapeId,
				),
			)
		)
			fail('UNSUPPORTED_GEOMETRY_EDIT', 'Active master definitions are missing.');
		problem('Active master definitions are missing.');
	}
	const definitions = new Map<string, Element>();
	for (const node of children(await visioXml(pkg, mastersPart, 'Masters'), 'Master')) {
		const id = attribute(node, 'ID');
		if (!id || definitions.has(id)) problem('Master IDs are ambiguous.');
		definitions.set(id, node);
	}
	const loaded = new Map<string, Element>();
	const bindings: Binding[] = [];
	let buildWork = 100_000;
	const charge = () => {
		check();
		if (--buildWork < 0) problem('Master effective-cell construction budget exceeded.');
	};
	const pageBindings = new Map<string, Binding>();
	const movingTargets = new Set<string>();
	for (const command of commands) {
		charge();
		if (command.type === 'move-shape')
			movingTargets.add(JSON.stringify([command.pageId, command.shapeId]));
	}
	const pageShapes = new Map<string, Element>();
	for (const [pageId, root] of roots)
		for (const shape of masterShapes(root)) {
			const id = attribute(shape, 'ID');
			if (!id) problem('Page shape ID is missing.');
			const key = JSON.stringify([pageId, id]);
			if (pageShapes.has(key)) problem('Page sheet IDs have ambiguous group scopes.');
			pageShapes.set(key, shape);
		}
	for (const { pageId, instance } of instances) {
		check();
		const masterId = attribute(instance, 'Master')!,
			definition = definitions.get(masterId);
		if (!definition) problem('Active master ID cannot be resolved.');
		let root = loaded.get(masterId);
		if (!root) {
			root = await visioXml(
				pkg,
				await indexedPart(pkg, mastersPart, definition, 'master'),
				'MasterContents',
			);
			loaded.set(masterId, root);
		}
		const tops = children(children(root, 'Shapes')[0], 'Shape');
		if (tops.length !== 1) problem('Only a uniquely rooted master can prove independence.');
		const templates = masterShapes(root),
			context = new Map<string, Binding>();
		assertMasterMarkup(
			root,
			new Set(
				templates.flatMap((shape) => {
					charge();
					return [...masterCells(shape, charge).values()];
				}),
			),
			check,
		);
		const locals = [instance, ...masterShapes(instance)];
		const byTemplate = new Map<string, Element>();
		const rootId = attribute(tops[0], 'ID');
		if (!rootId) problem('Master root shape ID is missing.');
		const explicitRoot = attribute(instance, 'MasterShape');
		if (explicitRoot !== undefined && explicitRoot !== rootId)
			problem('Master root mapping is ambiguous.');
		byTemplate.set(rootId, instance);
		for (const local of locals.slice(1)) {
			if (local.hasAttribute('Master')) problem('Nested master inheritance is unsupported.');
			const id = attribute(local, 'MasterShape');
			if (id === undefined) continue;
			if (byTemplate.has(id)) problem('MasterShape mappings are ambiguous.');
			byTemplate.set(id, local);
		}
		for (const template of templates) {
			charge();
			if (bindings.length >= 10_000) problem('Master effective binding limit exceeded.');
			check();
			if (template.hasAttribute('Master') || template.hasAttribute('MasterShape'))
				problem('Chained master definitions are unsupported.');
			const templateId = attribute(template, 'ID');
			if (!templateId || context.has(templateId)) problem('Master-local sheet IDs are ambiguous.');
			const local = byTemplate.get(templateId),
				cells = new Map<string, Source>();
			const movedInstance =
				local === instance && movingTargets.has(JSON.stringify([pageId, attribute(local, 'ID')]));
			for (const [name, node] of masterStyleCells(
				document,
				template,
				local,
				check,
				charge,
				movedInstance,
			))
				cells.set(name, { node, kind: 'style' });
			overlay(cells, masterCells(template, charge), 'template', charge);
			const inheritedCells = new Map(cells);
			overlay(cells, masterCells(local, charge), 'instance', charge);
			const binding: Binding = {
				id: `${pageId}:${attribute(instance, 'ID')}:${templateId}`,
				pageId,
				template,
				cells,
				inheritedCells,
				context,
				...(local ? { instance: local } : {}),
			};
			context.set(templateId, binding);
			bindings.push(binding);
			if (local) pageBindings.set(JSON.stringify([pageId, attribute(local, 'ID')]), binding);
		}
		for (const id of byTemplate.keys())
			if (!context.has(id)) problem('MasterShape refers to a missing template.');
	}
	const movePins = prepareMasterMovePins(roots, commands, bindings, check);
	const changed = commands.flatMap((command) =>
		geometryChangedCells(command).map((cell) => ({
			pageId: command.pageId,
			shapeId: command.shapeId,
			cell,
		})),
	);
	const query = createVisioDependencyQuery(roots, { check });
	const directAffected = (pageId: string, shapeId: string, cell: string) =>
		commands.some(
			(command) =>
				command.pageId === pageId &&
				command.shapeId === shapeId &&
				(command.type === 'delete-shape' ||
					changed.some(
						(target) =>
							target.pageId === pageId &&
							target.shapeId === shapeId &&
							target.cell.toLowerCase() === cell.toLowerCase(),
					)),
		);
	const active = new Set<string>(),
		done = new Set<string>();
	const pageInputs = new Map<string, Binding>();
	const pageInput = (pageId: string, shapeId: string): Binding => {
		const id = JSON.stringify([pageId, shapeId]);
		const bound = pageBindings.get(id) ?? pageInputs.get(id);
		if (bound) return bound;
		const shape = pageShapes.get(id);
		if (!shape) problem('Local master override has a missing page reference.');
		const cells = new Map<string, Source>();
		for (const [name, node] of masterStyleCells(document, shape, shape, check, charge))
			cells.set(name, { node, kind: 'style' });
		overlay(cells, masterCells(shape, charge), 'instance', charge);
		const result: Binding = {
			id: `page:${id}`,
			pageId,
			template: shape,
			instance: shape,
			cells,
			inheritedCells: new Map(),
			context: new Map(),
		};
		pageInputs.set(id, result);
		return result;
	};
	let steps = 100_000;
	const inspect = (binding: Binding, name: string): void => {
		check();
		if (--steps < 0) problem('Master dependency proof exceeded its cell budget.');
		name = name.toLowerCase();
		// The ShapeSheet constants parse as names.
		if (name === 'true' || name === 'false') return;
		const pageShapeId = attribute(binding.instance, 'ID');
		if (pageShapeId !== undefined && directAffected(binding.pageId, pageShapeId, name))
			problem('Effective master cache depends on an edited page cell.');
		const id = JSON.stringify([binding.id, name]);
		if (done.has(id)) return;
		if (active.has(id) || active.size >= 64)
			problem('Master dependency proof is cyclic or too deep.');
		active.add(id);
		// Formulas name the first text rows as Char.x and Para.x.
		const source =
			binding.cells.get(name) ??
			binding.cells.get(name.replace(/^char\./, 'character.0.').replace(/^para\./, 'paragraph.0.'));
		if (!source) {
			const defaults: Record<string, string> = {
				locpinx: 'width',
				locpiny: 'height',
				txtwidth: 'width',
				txtheight: 'height',
				txtpinx: 'width',
				txtpiny: 'height',
				txtlocpinx: 'txtwidth',
				txtlocpiny: 'txtheight',
			};
			const dimension = defaults[name];
			if (dimension) inspect(binding, dimension);
			// Text format cells left to the document defaults are never geometry-dependent.
			else if (!themeCell.test(name) && !/^(char|para)\./.test(name))
				problem(`Missing effective master reference ${name}.`);
		} else {
			const formula = executableCellFormula(attribute(source.node, 'F'));
			if (formula && !inertDoubleClickFormula(attribute(source.node, 'N') ?? '', formula)) {
				const text = children(binding.instance, 'Text')[0] ?? children(binding.template, 'Text')[0];
				const textFieldFree =
					![...binding.cells.keys()].some((key) => /^fields?\./i.test(key)) &&
					(!text ||
						!Array.from(text.getElementsByTagName('*')).some(
							(node) => node.localName.toLowerCase() === 'fld',
						));
				// A formula this proof cannot follow (menus, container lookups, add-on calls: every
				// Visio stencil shape has some) still cannot read another page shape without naming
				// its sheet, and within its own shape it must not name an edited cell.
				const opaque = (reason: string) => {
					// Page and document cells are not edited here; a sheet returned by a function
					// (a container lookup) counts only for the cell read from it.
					const own = formula.replace(/\b(ThePage|TheDoc)\s*!/gi, '');
					for (const match of own.matchAll(/\)\s*!\s*([A-Za-z_][A-Za-z_0-9.]*)/g))
						if (changed.some((item) => item.cell.toLowerCase() === match[1]!.toLowerCase()))
							problem(reason);
					// A numbered sheet may be a page shape (always, inside a string); its cell must
					// not be an edited or dependent one.
					const named = own
						.replace(/\)\s*!/g, '')
						.replace(/\bSheet\.(\d+)\s*!\s*([A-Za-z_][A-Za-z_0-9.]*)/gi, (_, sheet, cell) => {
							if (
								directAffected(binding.pageId, sheet, cell) ||
								query({ pageId: binding.pageId, shapeId: sheet, cell }, changed)
							)
								problem(reason);
							return '';
						});
					if (/[A-Za-z_0-9.]\s*!/.test(named)) problem(reason);
					if (pageShapeId !== undefined)
						for (const token of formula.match(/[A-Za-z_][A-Za-z_0-9.]*/g) ?? [])
							if (directAffected(binding.pageId, pageShapeId, token)) problem(reason);
				};
				let analysis: ReturnType<typeof analyzeVisioMasterFormula> | undefined;
				try {
					analysis = analyzeVisioMasterFormula(formula, { textFieldFree });
				} catch (error) {
					opaque(
						`Cannot analyze effective master formula: ${error instanceof Error ? error.message : 'invalid formula'}`,
					);
				}
				if (analysis?.dynamic) opaque('Effective master formula has unknown dynamic dependencies.');
				for (const ref of analysis?.references ?? []) {
					if (
						analysis!.readsText &&
						ref.shapeId === undefined &&
						ref.cell.toLowerCase() === 'thetext'
					)
						continue;
					// Names an opaque formula mentions that are not cells of this shape (page and
					// document cells, function keywords) have nothing to follow.
					if (
						analysis!.dynamic &&
						ref.shapeId === undefined &&
						!binding.cells.has(ref.cell.toLowerCase())
					)
						continue;
					if (ref.shapeId === undefined) inspect(binding, ref.cell);
					else if (source.kind === 'template') {
						const target = binding.context.get(ref.shapeId);
						if (!target) problem('Missing master-local Sheet reference.');
						inspect(target, ref.cell);
					} else {
						if (source.kind === 'style')
							problem('Explicit sheet references in inherited master styles are ambiguous.');
						if (
							directAffected(binding.pageId, ref.shapeId, ref.cell) ||
							query({ pageId: binding.pageId, shapeId: ref.shapeId, cell: ref.cell }, changed)
						)
							problem('Effective master cache depends on an edited page shape.');
						inspect(pageInput(binding.pageId, ref.shapeId), ref.cell);
					}
				}
				if (analysis?.readsText)
					for (const cell of binding.cells.keys())
						if (
							/^(character\.|paragraph\.|tabs\.|leftmargin$|rightmargin$|topmargin$|bottommargin$)/i.test(
								cell,
							)
						)
							inspect(binding, cell);
			}
		}
		active.delete(id);
		done.add(id);
	};
	for (const binding of bindings)
		for (const name of binding.cells.keys()) {
			// Skip only the two prepared local pin roots. Recursive inspect still refuses
			// any other effective formula that reaches an edited pin or its dependencies.
			const source = binding.cells.get(name);
			if (
				['pinx', 'piny'].includes(name) &&
				source?.kind === 'instance' &&
				movePins.pins.has(source.node)
			)
				continue;
			inspect(binding, name);
		}
	return movePins;
}
