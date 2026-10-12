import { executableCellFormula } from './cell-formula';
import { glueParticipants } from './edit-connector';
import { rerouteConnector } from './edit-connector-reroute';
import { assertNoPageDependents } from './edit-instance-checks';
import { recalculateInstanceCaches } from './edit-instance-recalculate';
import { instanceSheet, writeInstanceCell } from './edit-instance-sheet';
import type { MasterTemplate } from './edit-text-instance';
import { openEditablePackage, writeEditedPackage } from './edit-package';
import { serializeEditedXml } from './edit-text';
import { masterTemplate } from './edit-text-scope';
import { textTarget } from './edit-text-target';
import type { VisioDocument, VisioShape } from './model';
import { DEFAULTS, VisioPackageError, type VisioPackageLimits } from './package-common';
import { parseVsdx } from './parser';
import { visioXml } from './parts';
import { attribute } from './sheet';
import { visioFontAssumed } from './style';
import { visioTextExtents } from './text-extent';

export interface TextSizeTarget {
	pageId: string;
	shapeId: string;
}
interface Result {
	bytes: Uint8Array;
	changedParts: readonly string[];
	diagnostics: readonly { code: string; message: string }[];
}

const MEASURED = /\bTEXT(WIDTH|HEIGHT)\s*\(/i;
/** Cells whose change moves the outline that glued connectors end on. */
const OUTLINE = /^(width|height|pinx|piny|locpinx|locpiny|connections\.)/;
const format = (value: number) => String(Object.is(value, -0) ? 0 : value);

function findShape(shapes: readonly VisioShape[], id: string): VisioShape | undefined {
	const pending = [...shapes];
	while (pending.length) {
		const shape = pending.pop()!;
		if (shape.id === id) return shape;
		pending.push(...shape.children);
	}
	return undefined;
}

/** True when the shape itself (not its sub-shapes) has a formula that measures its text. */
function measures(shape: Element): boolean {
	const pending = [shape];
	while (pending.length) {
		const node = pending.pop()!;
		if (MEASURED.test(executableCellFormula(attribute(node, 'F')) ?? '')) return true;
		for (const child of Array.from(node.childNodes))
			if (child.nodeType === 1 && (child as Element).localName !== 'Shapes')
				pending.push(child as Element);
	}
	return false;
}

/**
 * Whether a text edit of this shape can change its size: the shape, or the master it inherits
 * from, has a formula that measures its text. Cheap, so the edit asks before it plans a refresh.
 */
export async function measuresOwnText(
	root: Element,
	shapeId: string,
	template: MasterTemplate,
	check: () => void,
): Promise<boolean> {
	try {
		const found = textTarget(root, shapeId, check);
		if (measures(found.node)) return true;
		return (
			found.masterId !== undefined && measures(await template(found.masterId, found.masterShapeId))
		);
	} catch (error) {
		if (!(error instanceof VisioPackageError) || error.code.startsWith('LIMIT_')) throw error;
		return false;
	}
}

/**
 * After text, font or text-block edits: shapes that size themselves from their text
 * (`TEXTWIDTH`, `TEXTHEIGHT`, the flowchart masters' Resize with Text) get the caches Visio would
 * compute, as local values of unchanged formulas (`F="Inh"` on a stencil instance). Connectors
 * glued to a shape that grew are laid out again.
 *
 * A shape whose text this editor cannot measure reliably keeps the size it was saved with: the
 * text edit stays and a diagnostic says so. Nothing here ever fails the edit.
 */
export async function refreshTextSizes<T extends Result>(
	targets: readonly TextSizeTarget[],
	result: T,
	options: { limits?: Partial<VisioPackageLimits>; maxOutputBytes?: number },
	deadline: number,
): Promise<T> {
	if (!targets.length || !result.changedParts.length) return result;
	const check = () => {
		if (Date.now() >= deadline) throw new VisioPackageError('LIMIT_RUNTIME', 'Deadline exceeded.');
	};
	const limits = {
		...DEFAULTS,
		...options.limits,
		maxInputBytes: Math.max(DEFAULTS.maxInputBytes, result.bytes.length),
		maxRuntimeMs: Math.max(1, deadline - Date.now()),
	};
	const kept: string[] = [];
	let resized = 0;
	try {
		const { pkg, parts, pages } = await openEditablePackage(result.bytes, limits, check);
		const template = masterTemplate(pkg);
		const roots = new Map<string, Element>();
		for (const [pageId, path] of pages) {
			const source = await visioXml(pkg, path, 'PageContents');
			roots.set(pageId, (source.ownerDocument!.cloneNode(true) as Document).documentElement);
		}
		const dirty = new Set<string>();
		let model: VisioDocument | undefined;
		for (const target of targets) {
			check();
			const root = roots.get(target.pageId);
			if (!root) continue;
			// One target is all or nothing: it works on a copy of its page.
			const copy = (root.ownerDocument!.cloneNode(true) as Document).documentElement;
			const trial = new Map(roots).set(target.pageId, copy);
			try {
				const found = textTarget(copy, target.shapeId, check);
				const master =
					found.masterId === undefined
						? undefined
						: await template(found.masterId, found.masterShapeId);
				if (!measures(found.node) && !(master && measures(master))) continue;
				const sheet = instanceSheet(
					found.node,
					master ?? copy.ownerDocument!.createElementNS(copy.namespaceURI, 'Shape'),
				);
				model ??= await parseVsdx(result.bytes, { limits });
				const shape = findShape(
					model.pages.find((page) => page.id === target.pageId)?.shapes ?? [],
					target.shapeId,
				);
				// A guessed font (missing cell, or a theme font scheme) would measure a wrong size.
				const text = shape && !visioFontAssumed(shape.text) ? shape.text : undefined;
				if (!text) {
					kept.push(target.shapeId);
					continue;
				}
				const { writes } = recalculateInstanceCaches(
					sheet,
					new Map(),
					check,
					new Map(),
					visioTextExtents(text),
				);
				if (!writes.length) continue;
				assertNoPageDependents(
					copy,
					found.node,
					new Map([
						[
							attribute(found.node, 'ID')!,
							new Set(
								writes.flatMap((write) => write.cell.names).map((name) => name.toLowerCase()),
							),
						],
					]),
					check,
				);
				for (const write of writes) {
					const own = write.cell.local;
					if (own && executableCellFormula(attribute(own, 'F'))) {
						own.setAttribute('V', format(write.value));
						own.removeAttribute('E');
					} else writeInstanceCell(sheet, write.cell, format(write.value), { formula: 'Inh' });
				}
				const touched = new Set([target.pageId]);
				if (writes.some((write) => write.cell.names.some((name) => OUTLINE.test(name))))
					for (const connector of glueParticipants(copy, target.shapeId).connectors)
						for (const page of rerouteConnector(trial, target.pageId, connector, check))
							touched.add(page);
				roots.set(target.pageId, copy);
				for (const page of touched) dirty.add(page);
				++resized;
			} catch (error) {
				if (!(error instanceof VisioPackageError) || error.code.startsWith('LIMIT_')) throw error;
				kept.push(target.shapeId);
			}
		}
		if (dirty.size) {
			const changed: string[] = [];
			for (const pageId of dirty) {
				const path = pages.get(pageId)!;
				parts.set(path, serializeEditedXml(roots.get(pageId)!, limits, check).bytes);
				changed.push(path);
			}
			const bytes = await writeEditedPackage(
				parts,
				options.maxOutputBytes ?? limits.maxInputBytes,
				deadline,
				check,
			);
			// The refreshed drawing must read back before it replaces the text edit's result.
			await parseVsdx(bytes, { limits });
			result = {
				...result,
				bytes,
				changedParts: [...new Set([...result.changedParts, ...changed])],
			};
		} else resized = 0;
	} catch (error) {
		// The text edit itself is sound; a size that could not be refreshed stays as saved.
		if (!(error instanceof VisioPackageError)) throw error;
		return {
			...result,
			diagnostics: [
				...result.diagnostics,
				{
					code: 'edit-text-size-kept',
					message: `Shapes that size themselves from their text kept their saved size: ${error.message}`,
				},
			],
		};
	}
	const diagnostics = [...result.diagnostics];
	if (resized)
		diagnostics.push({
			code: 'edit-text-size',
			message: `${resized} shape${resized === 1 ? '' : 's'} resized to fit the text.`,
		});
	if (kept.length)
		diagnostics.push({
			code: 'edit-text-size-kept',
			message:
				`Shape ${kept.join(', ')} sizes itself from its text, which cannot be measured ` +
				'reliably here (font, characters or a line that only just fits); it keeps its saved size.',
		});
	return { ...result, diagnostics };
}
