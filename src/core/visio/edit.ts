import { DEFAULTS, fail, VisioPackageError, type VisioPackageLimits } from './package-common';
import { visioXml, related } from './parts';
import { openEditablePackage, writeEditedPackage } from './edit-package';
import { serializeEditedXml } from './edit-text';
import { masterTemplate, replaceScopedPlainText } from './edit-text-scope';
import { measuresOwnText, refreshTextSizes, type TextSizeTarget } from './edit-text-size';
import { takeDeferredTextSizes } from './edit-text-size-formula';
import {
	applyInstanceGeometryEdit,
	isGlueTarget,
	isGroupInstanceEdit,
	isInstanceGeometryEdit,
} from './edit-instance-geometry';
import { admitInstanceDeletes } from './edit-instance-delete';
import { groupInstances } from './edit-instance-group';
import { replaceInstanceMaster } from './edit-instance-replace';
import { instanceOrderViews, orderTargetsAreStructural } from './edit-instance-order';
import { assertInstanceLayerUnlocked, pageShapes } from './edit-instance-shape';
import { attribute } from './sheet';
import { replaceScopedTextRanges } from './edit-text-ranges';
import { insertVisioTextField } from './edit-text-field';
import {
	snapshotVisioEdits,
	isVisioPageEdit,
	type VisioEdit,
	type VisioGeometryEdit,
} from './edit-commands';
import { applyGeometryEdit } from './edit-geometry';
import { topShape } from './edit-connector';
import { refuseStencilConnector } from './edit-connector-reroute';
import { isStencilConnector, registerStencilShapes } from './edit-stencil-connector';
import { assertDuplicateScope } from './edit-duplicate-scope';
import { assertGeometryPackageScope } from './edit-scope';
import { emptyMasterMoveProof } from './edit-master-move';
import { editVsdxPages } from './edit-pages';
import { applyFormattingEdit } from './edit-formatting';
import { isVisioFormatEdit } from './edit-formatting-commands';
import { reorderVisioShape, assertShapeOrderPackageScope } from './edit-shape-order';
import { duplicateVisioShapes } from './edit-duplicate';
import { pasteVisioShapes } from './edit-paste';
import { deleteVisioShapes, type VisioShapeDelete } from './edit-delete';
import { changeVisioShape } from './edit-change-shape';
import { isVisioMetadataEdit } from './edit-metadata-commands';
import { applyMetadataEdit } from './edit-metadata';
import { editVsdxPicture } from './edit-picture';
import { isVisioGroupEdit } from './edit-group-commands';
import { groupVisioShapes, ungroupVisioShape } from './edit-group';
import { autoSizePageIds, growAutoSizePages } from './edit-page-auto-size';
import { editVsdxPageTheme } from './edit-page-theme';
import { isVisioCommentEdit, type VisioCommentEdit } from './edit-comment-commands';
import { editVsdxComments } from './edit-comments';
import { editVsdxSubprocess } from './edit-subprocess';
import { isVisioDiagramPartEdit } from './edit-diagram-parts-commands';
import { insertVisioCallout, insertVisioContainer } from './edit-diagram-parts';
import { applyShapeDataEdit } from './edit-shape-data';
import { isVisioDataEdit } from './edit-data-commands';
import { editVsdxData } from './edit-data';
import { editVsdxLayers } from './edit-layers';
import { editVsdxLayerProperties } from './edit-layer-properties';
import { editVsdxMasterInstance } from './edit-master-instance';
import { editVsdxMasterDrops, isVisioMasterDrop } from './edit-master-drop';
import { changeStencilShapeToBuiltIn } from './edit-change-shape-builtin';
import { isVisioGuideEdit } from './edit-guide-commands';
import { applyGuideEdit } from './edit-guides';
export type {
	VisioEdit,
	VisioTextEdit,
	VisioTextRange,
	VisioTextRangesEdit,
	VisioTextFieldInsertEdit,
	VisioGeometryEdit,
	VisioPageInsert,
	VisioPageReorder,
	VisioPageRename,
	VisioPageDelete,
	VisioPageSizeEdit,
	VisioPageSetupEdit,
	VisioPagePropertiesEdit,
	VisioPageDecorationEdit,
	VisioPageSetupEdits,
	VisioScaleUnit,
	VisioPageEdit,
	VisioFormatEdit,
	VisioTextFormatEdit,
	VisioShapeFormatEdit,
	VisioShapeOrderEdit,
	VisioDuplicateShapesEdit,
	VisioPasteShapesEdit,
	VisioGroupEdit,
	VisioDiagramPartEdit,
	VisioInsertContainerEdit,
	VisioInsertCalloutEdit,
	VisioGroupShapesEdit,
	VisioUngroupShapeEdit,
	VisioResizeAnchor,
	VisioChangeShapeEdit,
	VisioChangeShapeTarget,
	VisioMetadataEdit,
	VisioPictureInsertEdit,
	VisioShapeHyperlinkEdit,
	VisioShapeScreenTipEdit,
	VisioHyperlinkFields,
	VisioConnectorGlue,
	VisioPageThemeEdit,
	VisioCommentEdit,
	VisioCommentAddEdit,
	VisioCommentUpdateEdit,
	VisioCommentDeleteEdit,
	VisioSubprocessEdit,
	VisioSubprocessSelection,
	VisioShapeDataEdit,
	VisioShapeDataFields,
	VisioShapeDataType,
	VisioDataEdit,
	VisioDataImportEdit,
	VisioDataRefreshEdit,
	VisioDataDeleteEdit,
	VisioDataLinkEdit,
	VisioDataUnlinkEdit,
	VisioAssignLayersEdit,
	VisioLayerPropertiesEdit,
	VisioMasterInstanceEdit,
	VisioStencilMasterDropEdit,
	VisioGuideEdit,
} from './edit-commands';

export interface EditVsdxOptions {
	limits?: Partial<VisioPackageLimits>;
	maxEdits?: number;
	maxTextCharacters?: number;
	maxOutputBytes?: number;
}
export interface EditVsdxResult {
	bytes: Uint8Array;
	changedParts: readonly string[];
	diagnostics: readonly { code: string; message: string }[];
}
function positive(value: number): number {
	if (!Number.isSafeInteger(value) || value <= 0)
		fail('INVALID_LIMITS', 'Edit limits must be positive safe integers.');
	return value;
}
/** Experimental source-backed atomic text and conservative geometry transaction.
 * Untouched part payloads are byte-preserved; edited XML and ZIP representation are not.
 * A page with Auto Size on (DrawingResizeType 1) grows after shapes leave it.
 */
export async function editVsdx(
	input: Uint8Array | ArrayBuffer,
	edits: readonly VisioEdit[],
	options: EditVsdxOptions = {},
): Promise<EditVsdxResult> {
	const clock = { deadline: 0, autoSize: new Set<string>(), textSizes: [] as TextSizeTarget[] };
	const edited = await editVsdxTransaction(input, edits, options, clock);
	// Shapes that size themselves from their text follow it, as far as it can be measured.
	const result = await refreshTextSizes(clock.textSizes, edited, options, clock.deadline);
	return growAutoSizePages(clock.autoSize, result, (bytes, growth) =>
		editVsdxTransaction(bytes, growth, {
			...options,
			limits: { ...options.limits, maxRuntimeMs: Math.max(1, clock.deadline - Date.now()) },
		}),
	);
}

async function editVsdxTransaction(
	input: Uint8Array | ArrayBuffer,
	edits: readonly VisioEdit[],
	options: EditVsdxOptions,
	clock = { deadline: 0, autoSize: new Set<string>(), textSizes: [] as TextSizeTarget[] },
): Promise<EditVsdxResult> {
	const limits = { ...DEFAULTS, ...options.limits };
	for (const value of Object.values(limits)) positive(value);
	const maxEdits = positive(options.maxEdits ?? 1000);
	const maxText = positive(options.maxTextCharacters ?? 1_000_000);
	const maxOutput = positive(options.maxOutputBytes ?? limits.maxInputBytes);
	const deadline = Date.now() + limits.maxRuntimeMs;
	clock.deadline = deadline;
	const check = () => {
		if (Date.now() >= deadline) fail('LIMIT_RUNTIME', 'Visio edit deadline exceeded.');
	};
	// Copy commands before the first await: caller mutation cannot change the transaction.
	const allCommands = snapshotVisioEdits(edits, maxEdits, maxText);
	const commands = allCommands.filter((command) => !isVisioPageEdit(command));
	const source = input instanceof Uint8Array ? input : new Uint8Array(input);
	if (source.length > limits.maxInputBytes) fail('LIMIT_INPUT', 'ZIP input exceeds limit.');
	const original = new Uint8Array(source);
	const subprocess = allCommands.find((command) => command.type === 'create-subprocess');
	if (subprocess) {
		if (allCommands.length !== 1)
			fail('EDIT_MIXED_SUBPROCESS_TRANSACTION', 'A subprocess requires its own transaction.');
		return editVsdxSubprocess(original, subprocess, options);
	}
	if (allCommands.some(isVisioMasterDrop))
		return editVsdxMasterDrops(
			original,
			allCommands,
			options,
			async (bytes, instance, info) => {
				const opened = await openEditablePackage(bytes, limits, check);
				return editVsdxMasterInstance(
					opened.pkg,
					opened.parts,
					opened.pages,
					instance,
					limits,
					maxOutput,
					deadline,
					check,
					info,
				);
			},
			(bytes, rest) => editVsdx(bytes, rest, options),
		);
	const { pkg, parts, pages } = await openEditablePackage(original, limits, check);
	const builtIn = await changeStencilShapeToBuiltIn(
		original,
		pkg,
		pages,
		allCommands,
		{ limits, maxOutput, deadline, check },
		(bytes, edits) => editVsdx(bytes, edits, options),
	);
	if (builtIn) return builtIn;
	if (allCommands.some(isVisioCommentEdit)) {
		if (!allCommands.every(isVisioCommentEdit))
			fail('EDIT_MIXED_COMMENT_TRANSACTION', 'Comment edits require their own transaction.');
		const comments = allCommands as VisioCommentEdit[];
		return editVsdxComments(pkg, parts, pages, comments, limits, maxOutput, deadline, check);
	}
	if (commands.length === allCommands.length) clock.autoSize = await autoSizePageIds(pkg, commands);
	const picture = allCommands.find((command) => command.type === 'insert-picture');
	if (picture) {
		if (allCommands.length !== 1)
			fail('EDIT_MIXED_PICTURE_TRANSACTION', 'Picture insertion requires its own transaction.');
		return editVsdxPicture(pkg, parts, pages, picture, limits, maxOutput, deadline, check);
	}
	const theme = allCommands.find((command) => command.type === 'set-page-theme');
	if (theme) {
		if (allCommands.length !== 1)
			fail('EDIT_MIXED_THEME_TRANSACTION', 'A page theme edit requires its own transaction.');
		return editVsdxPageTheme(pkg, parts, pages, theme, limits, maxOutput, deadline, check);
	}
	if (allCommands.some(isVisioDataEdit)) {
		if (!allCommands.every(isVisioDataEdit))
			fail('EDIT_MIXED_DATA_TRANSACTION', 'External data edits require their own transaction.');
		return editVsdxData(
			pkg,
			parts,
			pages,
			allCommands.filter(isVisioDataEdit),
			limits,
			maxOutput,
			deadline,
			check,
		);
	}
	const layerFlags = allCommands.filter((command) => command.type === 'set-layer-properties');
	if (layerFlags.length) {
		if (layerFlags.length !== allCommands.length)
			fail('EDIT_MIXED_LAYER_TRANSACTION', 'Layer properties require their own transaction.');
		return editVsdxLayerProperties(
			pkg,
			parts,
			pages,
			layerFlags,
			limits,
			maxOutput,
			deadline,
			check,
		);
	}
	const layers = allCommands.filter((command) => command.type === 'assign-layers');
	if (layers.length) {
		if (layers.length !== allCommands.length)
			fail('EDIT_MIXED_LAYER_TRANSACTION', 'Layer assignment requires its own transaction.');
		return editVsdxLayers(pkg, parts, pages, layers, limits, maxOutput, deadline, check);
	}
	if (commands.length !== allCommands.length) {
		const pageCommands = allCommands.filter(isVisioPageEdit);
		// Fit to Drawing: a page resize and the moves that bring the drawing onto it, as one step.
		const fit =
			commands.every((command) => command.type === 'move-shape') &&
			pageCommands.every((command) => command.type === 'set-page-size');
		if (commands.length && !fit)
			fail(
				'EDIT_MIXED_PAGE_TRANSACTION',
				'Page edits and shape edits require separate transactions.',
			);
		if (commands.length) {
			const resized = await editVsdxPages(
				original,
				pkg,
				parts,
				pageCommands,
				limits,
				maxOutput,
				deadline,
				check,
			);
			const moved = await editVsdxTransaction(resized.bytes, commands, {
				...options,
				limits: { ...options.limits, maxRuntimeMs: Math.max(1, deadline - Date.now()) },
			});
			return {
				bytes: moved.bytes,
				changedParts: [...new Set([...resized.changedParts, ...moved.changedParts])],
				diagnostics: [...resized.diagnostics, ...moved.diagnostics],
			};
		}
		return editVsdxPages(
			original,
			pkg,
			parts,
			allCommands.filter(isVisioPageEdit),
			limits,
			maxOutput,
			deadline,
			check,
		);
	}
	const dirty = new Map<string, Element>();
	const roots = new Map<string, Element>();
	const geometryCommands = commands.filter(
		(command): command is VisioGeometryEdit =>
			command.type !== 'replace-plain-text' &&
			command.type !== 'replace-text-ranges' &&
			command.type !== 'insert-text-field' &&
			command.type !== 'reorder-shape' &&
			command.type !== 'duplicate-shapes' &&
			command.type !== 'paste-shapes' &&
			command.type !== 'change-shape' &&
			command.type !== 'insert-picture' &&
			command.type !== 'set-page-theme' &&
			!isVisioMetadataEdit(command) &&
			command.type !== 'set-shape-data' &&
			!isVisioGroupEdit(command) &&
			!isVisioDiagramPartEdit(command) &&
			!isVisioGuideEdit(command) &&
			!isVisioFormatEdit(command),
	);
	let document: Element | undefined;
	let masterMovePins = emptyMasterMoveProof();
	const instanceCommands = new Set<VisioGeometryEdit>();
	let instanceDeletes: ReadonlySet<Element> = new Set();
	let groupMembers: Awaited<ReturnType<typeof groupInstances>> = new Map();
	if (
		geometryCommands.length ||
		commands.some(
			(command) =>
				command.type === 'replace-plain-text' ||
				command.type === 'replace-text-ranges' ||
				command.type === 'insert-text-field' ||
				isVisioFormatEdit(command) ||
				isVisioMetadataEdit(command) ||
				command.type === 'set-shape-data' ||
				command.type === 'reorder-shape' ||
				command.type === 'duplicate-shapes' ||
				command.type === 'paste-shapes' ||
				command.type === 'change-shape' ||
				isVisioGroupEdit(command) ||
				isVisioDiagramPartEdit(command) ||
				isVisioGuideEdit(command),
		)
	) {
		// All pages are indexed before editing: dependencies are never inferred from only the target shape.
		for (const [pageId, path] of pages) {
			const sourceRoot = await visioXml(pkg, path, 'PageContents');
			roots.set(pageId, (sourceRoot.ownerDocument!.cloneNode(true) as Document).documentElement);
		}
		for (const [pageId, root] of roots) {
			const ids = new Set(
				geometryCommands
					.filter((command) => command.type === 'create-text-box' && command.pageId === pageId)
					.map((command) => command.shapeId),
			);
			// A text box is never a container, so container lookups elsewhere do not matter.
			if (ids.size)
				await assertDuplicateScope(pkg, new Set(pages.values()), root, ids, check, false);
		}
		// Glue and routing read stencil shapes through their masters, resolved before the edits run.
		await registerStencilShapes(roots, masterTemplate(pkg), check);
		// Stencil shapes that are grouped, or sit in a group that is ungrouped, moved or rotated.
		groupMembers = await groupInstances(pkg, roots, commands, masterTemplate(pkg), check);
		// Said plainly first: the master proofs below would refuse the same edit in formula terms.
		for (const command of geometryCommands)
			if (!command.type.startsWith('create-') && command.type !== 'delete-shape')
				refuseStencilConnector(roots.get(command.pageId), command.shapeId);
		// Stencil instances take their own path: local overrides over the master's formulas.
		// A plain move keeps the proven pin-only path unless a connector is glued to the shape or
		// the shape is an instance of a group master, which that path does not take.
		const instanceMoves = new Set<VisioGeometryEdit>();
		// A stencil connector (Visio's Dynamic connector) is laid out by its own proven writer.
		const connectorCommands = new Set(
			geometryCommands.filter(
				(command) =>
					!command.type.startsWith('create-') &&
					command.type !== 'delete-shape' &&
					roots.has(command.pageId) &&
					isStencilConnector(topShape(roots.get(command.pageId)!, command.shapeId)),
			),
		);
		// Deleting a stencil shape removes it whole; it needs no proof about its master's formulas.
		const removals = geometryCommands.filter((command) => command.type === 'delete-shape');
		instanceDeletes = await admitInstanceDeletes(pkg, roots, removals, masterTemplate(pkg), check);
		for (const command of removals)
			if (
				pageShapes(roots.get(command.pageId)!).some(
					(shape) => attribute(shape, 'ID') === command.shapeId && instanceDeletes.has(shape),
				)
			)
				instanceCommands.add(command);
		for (const command of geometryCommands)
			if (!connectorCommands.has(command) && isInstanceGeometryEdit(roots, command)) {
				await assertInstanceLayerUnlocked(
					pkg,
					roots.get(command.pageId),
					command.pageId,
					command.shapeId,
				);
				if (
					command.type !== 'move-shape' ||
					isGlueTarget(roots, command) ||
					isGroupInstanceEdit(roots, command)
				)
					instanceCommands.add(command);
				else instanceMoves.add(command);
			}
		const scope = async () => {
			const local = geometryCommands.filter(
				(command) => !instanceCommands.has(command) && !connectorCommands.has(command),
			);
			if (local.length)
				masterMovePins = await assertGeometryPackageScope(
					pkg,
					new Set(pages.values()),
					local,
					check,
					roots,
				);
		};
		try {
			await scope();
		} catch (error) {
			// When the pin-only proof cannot follow the drawing, stencil moves take the instance path.
			// A spent proof budget is a limit, not something another path may work around.
			if (
				!instanceMoves.size ||
				!(error instanceof VisioPackageError) ||
				error.code !== 'EDIT_UNSUPPORTED_PACKAGE_DEPENDENCY' ||
				/budget/i.test(error.message)
			)
				throw error;
			for (const command of instanceMoves) instanceCommands.add(command);
			await scope();
		}
		const path = await related(pkg, '', 'document');
		document = await visioXml(pkg, path!, 'VisioDocument');
	}
	let textChanged = false;
	if (commands.some((command) => command.type === 'reorder-shape' || isVisioGroupEdit(command)))
		await assertShapeOrderPackageScope(
			pkg,
			check,
			await orderTargetsAreStructural(roots, commands, masterTemplate(pkg)),
		);
	let formatChanged = false;
	let orderChanged = false;
	let duplicateChanged = false;
	let pasteChanged = false;
	let outlineChanged = false;
	let metadataChanged = false;
	let groupChanged = false;
	let partChanged = false;
	let shapeDataChanged = false;
	let guideChanged = false;
	const deletions = commands.filter(
		(command): command is VisioShapeDelete => command.type === 'delete-shape',
	);
	const deleteOnly = deletions.length > 0 && deletions.length === commands.length;
	if (deleteOnly)
		for (const pageId of deleteVisioShapes(roots, document!, deletions, check, instanceDeletes))
			dirty.set(pages.get(pageId)!, roots.get(pageId)!);
	// A shape that sizes itself from its text follows it after the transaction.
	const noteTextSize = async (target: { pageId: string; shapeId: string }, root: Element) => {
		if (await measuresOwnText(root, target.shapeId, masterTemplate(pkg), check))
			clock.textSizes.push({ pageId: target.pageId, shapeId: target.shapeId });
	};
	for (const command of deleteOnly ? [] : commands) {
		check();
		const path = pages.get(command.pageId);
		if (!path) fail('EDIT_TARGET_NOT_FOUND', 'Page does not exist.');
		let root = roots.get(command.pageId) ?? dirty.get(path);
		if (!root) {
			const sourceRoot = await visioXml(pkg, path, 'PageContents');
			root = (sourceRoot.ownerDocument!.cloneNode(true) as Document).documentElement;
			roots.set(command.pageId, root);
		}
		if (command.type === 'replace-plain-text' || command.type === 'replace-text-ranges') {
			if (
				await (command.type === 'replace-plain-text'
					? replaceScopedPlainText(pkg, new Set(pages.values()), roots, document!, command, check)
					: replaceScopedTextRanges(pkg, new Set(pages.values()), roots, document!, command, check))
			) {
				dirty.set(path, root);
				textChanged = true;
				await noteTextSize(command, root);
			}
		} else if (command.type === 'insert-text-field') {
			if (
				await insertVisioTextField(pkg, new Set(pages.values()), roots, document!, command, check)
			) {
				dirty.set(path, root);
				textChanged = true;
				await noteTextSize(command, root);
			}
		} else if (isVisioFormatEdit(command)) {
			if (
				await applyFormattingEdit(pkg, new Set(pages.values()), roots, document!, command, check)
			) {
				dirty.set(path, root);
				formatChanged = true;
				if (command.type === 'format-text') await noteTextSize(command, root);
			}
		} else if (isVisioMetadataEdit(command)) {
			if (applyMetadataEdit(roots, command, check)) {
				dirty.set(path, root);
				metadataChanged = true;
			}
		} else if (command.type === 'set-shape-data') {
			if (applyShapeDataEdit(roots, command, check)) {
				dirty.set(path, root);
				shapeDataChanged = true;
			}
		} else if (command.type === 'reorder-shape') {
			const views = await instanceOrderViews(
				pkg,
				command.pageId,
				root,
				command.shapeId,
				masterTemplate(pkg),
				check,
			);
			if (reorderVisioShape(root, document!, command, check, views)) {
				dirty.set(path, root);
				orderChanged = true;
			}
		} else if (command.type === 'change-shape') {
			if (
				'masterId' in command
					? await replaceInstanceMaster(
							pkg,
							parts,
							path,
							root,
							command,
							masterTemplate(pkg),
							limits,
							check,
						)
					: changeVisioShape(roots, document!, command, check)
			) {
				dirty.set(path, root);
				outlineChanged = true;
			}
		} else if (isVisioGroupEdit(command)) {
			if (command.type === 'group-shapes')
				groupVisioShapes(root, document!, command, check, groupMembers);
			else ungroupVisioShape(root, document!, command, check, groupMembers);
			dirty.set(path, root);
			groupChanged = true;
		} else if (isVisioDiagramPartEdit(command)) {
			if (command.type === 'insert-container') {
				insertVisioContainer(root, document!, command, check);
				dirty.set(path, root);
			} else
				for (const pageId of insertVisioCallout(roots, document!, command, check))
					dirty.set(pages.get(pageId)!, roots.get(pageId)!);
			partChanged = true;
		} else if (isVisioGuideEdit(command)) {
			applyGuideEdit(roots, command, check);
			dirty.set(path, root);
			guideChanged = true;
		} else if (command.type === 'paste-shapes') {
			for (const pageId of await pasteVisioShapes(
				pkg,
				new Set(pages.values()),
				roots,
				document!,
				command,
				check,
				path,
			))
				dirty.set(pages.get(pageId)!, roots.get(pageId)!);
			pasteChanged = true;
		} else if (command.type === 'duplicate-shapes') {
			for (const pageId of await duplicateVisioShapes(
				pkg,
				new Set(pages.values()),
				roots,
				document!,
				command,
				check,
			))
				dirty.set(pages.get(pageId)!, roots.get(pageId)!);
			duplicateChanged = true;
		} else if (
			command.type !== 'insert-picture' &&
			command.type !== 'set-page-theme' &&
			command.type !== 'create-subprocess' &&
			!isVisioCommentEdit(command) &&
			!isVisioDataEdit(command) &&
			command.type !== 'assign-layers' &&
			command.type !== 'set-layer-properties' &&
			!isVisioMasterDrop(command)
		) {
			const changedPages =
				instanceCommands.has(command) && isInstanceGeometryEdit(roots, command)
					? await applyInstanceGeometryEdit(roots, command, masterTemplate(pkg), check)
					: applyGeometryEdit(roots, document!, command, check, masterMovePins);
			for (const pageId of changedPages) dirty.set(pages.get(pageId)!, roots.get(pageId)!);
			// A text height that follows the width (a text box, Resize with Text) is measured again.
			if (command.type === 'resize-shape') await noteTextSize(command, roots.get(command.pageId)!);
		}
	}
	// Cells that measure text kept their caches while geometry was recalculated.
	for (const [pageId, root] of roots)
		for (const shapeId of takeDeferredTextSizes(root)) clock.textSizes.push({ pageId, shapeId });
	let totalBytes = [...parts.values()].reduce((sum, bytes) => sum + bytes.length, 0);
	let nodes = 0;
	for (const [path, root] of dirty) {
		const serialized = serializeEditedXml(root, limits, check);
		nodes += serialized.nodes;
		if (nodes > limits.maxTotalXmlNodes)
			fail('LIMIT_XML_TOTAL', 'Edited XML node total exceeds limit.');
		totalBytes += serialized.bytes.length - parts.get(path)!.length;
		if (totalBytes > limits.maxTotalBytes)
			fail('LIMIT_TOTAL', 'Edited package total exceeds limit.');
		parts.set(path, serialized.bytes);
	}
	check();
	if (!dirty.size && original.length > maxOutput)
		fail('LIMIT_EDIT_OUTPUT', 'Saved package exceeds output limit.');
	const bytes = dirty.size ? await writeEditedPackage(parts, maxOutput, deadline, check) : original;
	if (dirty.size) {
		// Re-admit the saved package and count metadata plus changed page XML together.
		// A fresh reader gets only the remaining transaction time, never a new budget.
		check();
		const verified = await openEditablePackage(
			bytes,
			{ ...limits, maxInputBytes: maxOutput, maxRuntimeMs: Math.max(1, deadline - Date.now()) },
			check,
		);
		for (const path of dirty.keys()) await visioXml(verified.pkg, path, 'PageContents');
		check();
	}
	return {
		bytes,
		changedParts: [...dirty.keys()],
		diagnostics: [
			...(pasteChanged
				? [
						{
							code: 'edit-paste-experimental',
							message:
								'Captured shape XML was pasted with compatible resources and page context. Clipboard placement and cross-document fidelity are limited to supported cases.',
						},
					]
				: []),
			...(duplicateChanged
				? [
						{
							code: 'edit-duplicate-experimental',
							message:
								'Shape XML was copied and supported pin-dependent caches were recalculated; a stencil shape stays an instance of its master. Native fidelity is limited to tested cases.',
						},
					]
				: []),
			...(dirty.size && textChanged
				? [
						{
							code: 'edit-caches-not-recalculated',
							message:
								'Plain text changed; affected or unknown formula dependencies were refused. Untouched caches were preserved. Native fidelity is limited to tested cases.',
						},
					]
				: []),
			...(dirty.size && deleteOnly
				? [
						{
							code: 'edit-delete-experimental',
							message:
								'Reference-closed shapes were deleted, stencil shapes with their sub-shapes; their masters stay in the document stencil. Connectors glued to a deleted shape were released and keep their place.',
						},
					]
				: []),
			...(dirty.size && geometryCommands.length && !deleteOnly
				? [
						{
							code: 'edit-geometry-experimental',
							message:
								'Supported affected geometry caches were recalculated. Native Visio reopen and rendering fidelity remain unverified.',
						},
					]
				: []),
			...(formatChanged
				? [
						{
							code: 'edit-formatting-experimental',
							message:
								'Text and solid shape formatting was changed without recalculating text layout. Native Visio reopen and rendering fidelity remain unverified.',
						},
					]
				: []),
			...(outlineChanged
				? [
						{
							code: 'edit-change-shape-experimental',
							message:
								'Local Geometry sections were replaced with a Basic Shapes outline, or a stencil shape took another master of the drawing. Native rendering fidelity is limited to tested cases.',
						},
					]
				: []),
			...(metadataChanged
				? [
						{
							code: 'edit-shape-metadata',
							message:
								'Local hyperlink rows or the ScreenTip (Comment) cell were changed. Following a link stays an explicit user action.',
						},
					]
				: []),
			...(shapeDataChanged
				? [
						{
							code: 'edit-shape-data',
							message:
								'Local Shape Data (Property) rows were added, changed or removed. Rows read by formulas are refused.',
						},
					]
				: []),
			...(groupChanged
				? [
						{
							code: 'edit-group-experimental',
							message:
								'Shapes were grouped or ungrouped with plain group-local pins; members carry no group-scaling formulas, and stencil members stay instances of their masters. Native rendering fidelity is limited to tested cases.',
						},
					]
				: []),
			...(partChanged
				? [
						{
							code: 'edit-diagram-part-approximate',
							message:
								'Containers and callouts record membership and targets in User rows, not in Visio Relationships formulas; Visio reopens them as plain shapes and a glued leader connector.',
						},
					]
				: []),
			...(guideChanged
				? [
						{
							code: 'edit-guides',
							message:
								'Ruler guides were added, moved or removed as Type="Guide" shapes. Guides are not printed or exported by this viewer.',
						},
					]
				: []),
			...(orderChanged
				? [
						{
							code: 'edit-shape-order-experimental',
							message: 'The order of sibling shapes was changed; nothing else was rewritten.',
						},
					]
				: []),
		],
	};
}
