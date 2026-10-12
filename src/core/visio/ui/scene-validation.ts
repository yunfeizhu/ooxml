import { assertVisioFillGradient } from './gradient-details';
import {
	inspectVisioRasterImage,
	VISIO_RASTER_IMAGE_LIMITS,
	VISIO_COMMENT_LIMIT,
	VISIO_COMMENT_TEXT_LIMIT,
	type VisioDocument,
	type VisioShape,
	type VisioImage,
} from '../index';
import { assertShapeDetails } from './scene-details';
import { assertSceneDataRecordsets } from './scene-data';
import { ForeignVectorBudget } from './foreign-vector-budget';
import { assertRunExtras, assertTextFields } from './scene-validation-text';

export const MAX_INPUT_BYTES = 32 * 1024 * 1024;
const MAX_DIMENSION = 10_000;
const MAX_SHAPES = 25_000;
function finite(value: number, label: string, min = -MAX_DIMENSION, max = MAX_DIMENSION): void {
	if (!Number.isFinite(value) || value < min || value > max)
		throw new Error(`The scene has an invalid ${label}.`);
}
function member(value: unknown, choices: readonly unknown[], label: string): void {
	if (!choices.includes(value)) throw new Error(`The scene has an invalid ${label}.`);
}
/** Review comments: bounded plain strings only. */
function assertViewableComments(comments: VisioDocument['comments']): void {
	if (comments === undefined) return;
	if (!Array.isArray(comments) || comments.length > VISIO_COMMENT_LIMIT)
		throw new Error('The scene has an invalid comment list.');
	let characters = 0;
	const text = (value: unknown, limit: number, optional = false) => {
		if (optional && value === undefined) return;
		if (typeof value !== 'string' || value.length > limit)
			throw new Error('The scene has an invalid comment.');
		characters += value.length;
	};
	for (const comment of comments) {
		text(comment.id, 256);
		text(comment.pageId, 256);
		text(comment.shapeId, 256, true);
		text(comment.author, 256);
		text(comment.initials, 64, true);
		text(comment.date, 64, true);
		text(comment.editDate, 64, true);
		text(comment.text, VISIO_COMMENT_TEXT_LIMIT);
	}
	if (characters > 2_000_000) throw new Error('The scene exceeds aggregate comment limits.');
}
/** Defensive display limits also protect callers supplying their own typed scenes. */
export function assertViewableDocument(model: VisioDocument): void {
	if (
		(model.format !== 'vsdx' && model.format !== 'vsd') ||
		!Array.isArray(model.pages) ||
		model.pages.length > 256 ||
		!Array.isArray(model.diagnostics) ||
		model.diagnostics.length > 2000
	)
		throw new Error('The scene has an invalid page list.');
	const seen = new Set<VisioShape>();
	let pathBytes = 0,
		textBytes = 0,
		runCount = 0,
		imageBytes = 0,
		geometryCount = 0,
		uniquePixels = 0,
		drawnPixels = 0,
		layerCount = 0,
		paragraphCount = 0,
		gradientStops = 0;
	const imageResources = new Map<Uint8Array, VisioImage>();
	const vectorBudget = new ForeignVectorBudget();
	let metadataBytes = 0;
	const detailBudget = { rows: 0, characters: 0 };
	const label = (value: string, limit = 4096) => {
		if (typeof value !== 'string' || value.length > limit)
			throw new Error('The scene exceeds safe metadata string limits.');
		metadataBytes += value.length;
		if (metadataBytes > 1_000_000) throw new Error('The scene exceeds aggregate metadata limits.');
	};
	if (model.fontFamilies !== undefined) {
		if (!Array.isArray(model.fontFamilies) || model.fontFamilies.length > 10000)
			throw new Error('The scene has an invalid font family list.');
		for (const family of model.fontFamilies) label(family, 1024);
	}
	assertSceneDataRecordsets(model);
	for (const diagnostic of model.diagnostics) {
		label(diagnostic.code, 256);
		label(diagnostic.message);
		member(diagnostic.severity, ['info', 'warning'], 'diagnostic severity');
	}
	assertViewableComments(model.comments);

	const pageIds = new Set<string>();
	const stack: Array<{ shape: VisioShape; depth: number; ids: Set<string> }> = [];
	for (const page of model.pages) {
		label(page.id, 256);
		if (pageIds.has(page.id)) throw new Error('The scene has duplicate page identities.');
		pageIds.add(page.id);
		label(page.name);
		if (page.layers !== undefined && !Array.isArray(page.layers))
			throw new Error('The scene has an invalid layer list.');
		layerCount += page.layers?.length ?? 0;
		if (layerCount > 25_000) throw new Error('The scene exceeds safe layer count limits.');
		for (const layer of page.layers ?? []) {
			label(layer.id, 256);
			label(layer.name);
			for (const flag of [layer.visible, layer.printable, layer.locked])
				member(flag, [true, false], 'layer flag');
		}
		if (page.theme !== undefined) {
			label(page.theme.name, 256);
			if (page.theme.builtIn !== undefined) label(page.theme.builtIn, 64);
			member(page.theme.variant, [0, 1, 2, 3], 'theme variant');
			const colors = [
				page.theme.accents,
				...(page.theme.variants ?? []),
				[page.theme.light, page.theme.dark].filter((color) => color !== undefined),
			];
			if (!Array.isArray(page.theme.variants) || page.theme.variants.length > 4)
				throw new Error('The scene has an invalid theme variant list.');
			for (const list of colors)
				if (
					!Array.isArray(list) ||
					list.length > 7 ||
					list.some((color) => typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))
				)
					throw new Error('The scene has invalid theme colours.');
		}
		finite(page.width, 'page width', 0.001);
		finite(page.height, 'page height', 0.001);
		if (page.drawingToPageScale !== undefined)
			finite(page.drawingToPageScale, 'drawing scale', Number.MIN_VALUE, Number.MAX_VALUE);
		for (const mode of [page.drawingSizeType, page.drawingResizeType])
			if (mode !== undefined && (!Number.isSafeInteger(mode) || mode < 0 || mode > 255))
				throw new Error('The scene has an invalid drawing page-size mode.');
		if (!Array.isArray(page.shapes) || stack.length + page.shapes.length > MAX_SHAPES)
			throw new Error('The scene exceeds safe shape count limits or has an invalid shape list.');
		const ids = new Set<string>();
		for (const shape of page.shapes) stack.push({ shape, depth: 0, ids });
	}
	while (stack.length) {
		const { shape, depth, ids } = stack.pop()!;
		if (depth > 64 || seen.has(shape) || seen.size >= MAX_SHAPES)
			throw new Error('The scene exceeds safe shape depth/count limits or contains a cycle.');
		seen.add(shape);
		if (
			!Array.isArray(shape.children) ||
			seen.size + stack.length + shape.children.length > MAX_SHAPES
		)
			throw new Error('The scene exceeds safe shape count limits or has an invalid child list.');
		label(shape.id, 1024);
		if (ids.has(shape.id)) throw new Error('The scene has duplicate shape identities on one page.');
		ids.add(shape.id);
		member(shape.hidden, [true, false], 'hidden flag');
		member(shape.kind, ['shape', 'group', 'connector', 'foreign'], 'shape kind');
		if (shape.groupDisplayMode !== undefined)
			member(shape.groupDisplayMode, [0, 1, 2], 'group display mode');
		member(shape.text.horizontalAlign, ['left', 'center', 'right', 'justify'], 'text alignment');
		for (const key of ['bold', 'italic', 'underline', 'strikethrough'] as const)
			if (shape.text[key] !== undefined) member(shape.text[key], [true, false], 'text style');
		member(shape.text.verticalAlign, ['top', 'middle', 'bottom'], 'text alignment');
		label(shape.name);
		label(shape.text.fontFamily, 1024);
		label(shape.style.fill, 256);
		label(shape.style.lineColor, 256);
		label(shape.text.color, 256);
		if (shape.text.opacity !== undefined) finite(shape.text.opacity, 'text opacity', 0, 1);
		if (shape.text.backgroundColor) label(shape.text.backgroundColor, 256);
		assertRunExtras(shape.text);
		assertTextFields(shape.text);
		if (shape.text.backgroundOpacity !== undefined)
			finite(shape.text.backgroundOpacity, 'text background opacity', 0, 1);
		assertShapeDetails(shape, detailBudget);
		if (shape.visibility) {
			member(shape.visibility.layerHidden, [true, false], 'layer visibility metadata');
			member(shape.visibility.guide, [true, false], 'guide visibility metadata');
			member(shape.visibility.noShow, [undefined, true, false], 'NoShow visibility metadata');
			member(shape.visibility.nonPrinting, [undefined, true, false], 'NonPrinting metadata');
			member(
				shape.visibility.layerPrintSummary,
				['unlayered', 'all-enabled', 'all-disabled', 'mixed', 'unknown'],
				'layer print summary',
			);
		}
		finite(shape.width, 'shape width', 0);
		if (shape.rotation)
			for (const value of [shape.rotation.pinX, shape.rotation.pinY, shape.rotation.angle])
				finite(value, 'rotation');
		finite(shape.height, 'shape height', 0);
		if (shape.transform.length !== 6 || shape.text.transform.length !== 6)
			throw new Error('The scene has an invalid transform.');
		for (const value of [...shape.transform, ...shape.text.transform]) finite(value, 'transform');
		finite(shape.text.width, 'text width', 0);
		finite(shape.text.height, 'text height', 0);
		finite(shape.text.fontSize, 'font size', 0, 100);
		finite(shape.style.lineWidth, 'line width', 0, 100);
		if (shape.style.lineDash !== undefined) {
			const dash = shape.style.lineDash;
			if (!Array.isArray(dash) || dash.length < 2 || dash.length > 6 || dash.length % 2 !== 0)
				throw new Error('The scene has an invalid normalized line dash.');
			for (const value of dash) finite(value, 'line dash length', 0, 40);
			if (!dash.some((value) => value > 0))
				throw new Error('The scene has an empty line dash pattern.');
		}
		for (const value of [shape.style.linePattern, shape.style.startArrow, shape.style.endArrow]) {
			finite(value, 'line pattern or arrow code', 0, 65535);
			if (!Number.isInteger(value))
				throw new Error('The scene has an invalid line pattern or arrow code.');
		}
		for (const size of [shape.style.startArrowSize, shape.style.endArrowSize])
			if (size !== undefined) finite(size, 'arrow size', 0, 65535);
		if (
			shape.style.lineCap !== undefined &&
			!['round', 'butt', 'square'].includes(shape.style.lineCap)
		)
			throw new Error('The scene has an invalid normalized line cap.');
		finite(shape.style.fillOpacity, 'fill opacity', 0, 1);
		const shadow = shape.style.shadow;
		if (shadow !== undefined) {
			if (typeof shadow.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(shadow.color))
				throw new Error('The scene has an invalid shadow color.');
			finite(shadow.opacity, 'shadow opacity', 0, 1);
			finite(shadow.offsetX, 'shadow offset', -1000, 1000);
			finite(shadow.offsetY, 'shadow offset', -1000, 1000);
			finite(shadow.blur, 'shadow blur', 0, 10);
		}
		const glow = shape.style.glow;
		if (glow !== undefined) {
			if (typeof glow.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(glow.color))
				throw new Error('The scene has an invalid glow color.');
			finite(glow.opacity, 'glow opacity', 0, 1);
			finite(glow.size, 'glow size', 0, 10);
		}
		if (shape.style.softEdges !== undefined) finite(shape.style.softEdges, 'soft edge size', 0, 10);
		if (shape.style.rounding !== undefined) finite(shape.style.rounding, 'corner rounding', 0, 100);
		const reflection = shape.style.reflection;
		if (reflection !== undefined) {
			finite(reflection.opacity, 'reflection opacity', 0, 1);
			finite(reflection.size, 'reflection size', 0, 1);
			finite(reflection.distance, 'reflection distance', 0, 10);
			finite(reflection.blur, 'reflection blur', 0, 10);
		}
		finite(shape.style.lineOpacity, 'line opacity', 0, 1);
		if (shape.style.lineDashDotLength !== undefined)
			finite(shape.style.lineDashDotLength, 'line dash dot length', 0, 1_000_000);
		for (const name of [
			'fillForegroundOpacity',
			'fillBackgroundOpacity',
			'lineColorOpacity',
		] as const)
			if (shape.style[name] !== undefined) finite(shape.style[name], 'source paint opacity', 0, 1);
		if (shape.style.fillPatternIndex !== undefined) {
			finite(shape.style.fillPatternIndex, 'source fill pattern', 0, 65535);
			if (!Number.isInteger(shape.style.fillPatternIndex))
				throw new Error('The scene has an invalid source fill pattern.');
		}
		if (
			shape.style.fillBackgroundColor !== undefined &&
			(typeof shape.style.fillBackgroundColor !== 'string' ||
				!/^#[0-9a-f]{6}$/i.test(shape.style.fillBackgroundColor))
		)
			throw new Error('The scene has an invalid source fill background color.');
		if (shape.style.fillPattern) {
			const tile = shape.style.fillPattern;
			finite(tile.width, 'fill pattern width', 1 / 12, 1 / 12);
			finite(tile.height, 'fill pattern height', 1 / 12, 1 / 12);
			if (
				!(tile.bytes instanceof Uint8Array) ||
				tile.bytes.byteLength > 4096 ||
				tile.mimeType !== 'image/png' ||
				tile.pixelWidth !== 8 ||
				tile.pixelHeight !== 8
			)
				throw new Error('The scene has an invalid fill pattern tile.');
			const info = inspectVisioRasterImage(tile.bytes);
			if (info.mimeType !== 'image/png' || info.pixelWidth !== 8 || info.pixelHeight !== 8)
				throw new Error('The scene has invalid fill pattern pixels.');
			imageBytes += tile.bytes.byteLength;
			if (imageBytes > 64 * 1024 * 1024)
				throw new Error('The scene exceeds safe raster byte limits.');
		}
		for (const gradient of [shape.style.fillGradient, shape.style.lineGradient])
			if (gradient && (gradientStops += assertVisioFillGradient(gradient, finite, label)) > 100_000)
				throw new Error('The scene exceeds aggregate gradient stop limits.');
		if (typeof shape.text.plainText !== 'string')
			throw new Error('The scene has invalid plain text.');
		textBytes += shape.text.plainText.length;
		if (!Array.isArray(shape.text.runs) || runCount + shape.text.runs.length > 100_000)
			throw new Error('The scene exceeds safe text run limits or has an invalid run list.');
		for (const run of shape.text.runs) {
			if (run.strikethrough !== undefined)
				member(run.strikethrough, [true, false], 'strikethrough style');
			label(run.fontFamily, 1024);
			label(run.color, 256);
			if (run.opacity !== undefined) finite(run.opacity, 'text run opacity', 0, 1);
			assertRunExtras(run);
			if (typeof run.text !== 'string') throw new Error('The scene has invalid run text.');
			textBytes += run.text.length;
			++runCount;
			finite(run.fontSize, 'run font size', 0, 100);
		}
		if (!Array.isArray(shape.geometry) || geometryCount + shape.geometry.length > 100_000)
			throw new Error('The scene exceeds safe geometry limits or has an invalid geometry list.');
		for (const geometry of shape.geometry) {
			if (typeof geometry.path !== 'string') throw new Error('The scene has invalid path text.');
			member(geometry.fill, [true, false], 'geometry fill flag');
			member(geometry.stroke, [true, false], 'geometry stroke flag');
			pathBytes += geometry.path.length;
			geometryCount++;
		}
		if (geometryCount > 100_000) throw new Error('The scene exceeds safe geometry limits.');
		if (pathBytes > 16_000_000 || textBytes > 5_000_000 || runCount > 100_000)
			throw new Error('The scene exceeds safe path/text limits.');
		for (const value of [
			shape.text.margins.left,
			shape.text.margins.right,
			shape.text.margins.top,
			shape.text.margins.bottom,
		])
			finite(value, 'text margin');
		const paragraphs = shape.text.paragraphs ?? [];
		if (
			!Array.isArray(paragraphs) ||
			paragraphs.length > 5000 ||
			(paragraphCount += paragraphs.length) > 50_000
		)
			throw new Error('The scene exceeds safe paragraph limits.');
		for (const paragraph of paragraphs) {
			member(paragraph.direction, ['ltr', 'rtl'], 'paragraph direction');
			member(
				paragraph.horizontalAlign,
				['left', 'center', 'right', 'justify', 'distributed'],
				'paragraph alignment',
			);
			member(paragraph.lineSpacing.kind, ['multiple', 'exact'], 'paragraph line spacing');
			if (
				!Number.isSafeInteger(paragraph.start) ||
				!Number.isSafeInteger(paragraph.end) ||
				paragraph.start < 0 ||
				paragraph.end < paragraph.start ||
				paragraph.end > shape.text.plainText.length
			)
				throw new Error('The scene has invalid paragraph offsets.');
			for (const value of [
				paragraph.indentLeft,
				paragraph.indentRight,
				paragraph.indentFirst,
				paragraph.spaceBefore,
				paragraph.spaceAfter,
			])
				finite(value, 'paragraph position');
			finite(paragraph.lineSpacing.value, 'line spacing', 0, 100);
			if (paragraph.bullet) {
				label(paragraph.bullet.text, 1024);
				label(paragraph.bullet.fontFamily, 1024);
				finite(paragraph.bullet.fontSize, 'bullet size', 0, 100);
				finite(paragraph.bullet.offset, 'bullet offset');
			}
		}
		if (shape.foreignVector !== undefined) {
			const foreign = shape.foreignVector;
			if (!foreign || typeof foreign !== 'object')
				throw new Error('The scene has an invalid foreign vector placement.');
			finite(foreign.x, 'foreign vector position');
			finite(foreign.y, 'foreign vector position');
			finite(foreign.width, 'foreign vector width', 0);
			finite(foreign.height, 'foreign vector height', 0);
			finite(foreign.opacity, 'foreign vector opacity', 0, 1);
			vectorBudget.take(foreign.vector);
		}
		if (shape.image) {
			const image = shape.image;
			if (
				!['image/png', 'image/jpeg', 'image/gif'].includes(image.mimeType) ||
				!(image.bytes instanceof Uint8Array)
			)
				throw new Error('Unsupported embedded image.');
			imageBytes += image.bytes.byteLength;
			if (image.bytes.byteLength > 8 * 1024 * 1024 || imageBytes > 64 * 1024 * 1024)
				throw new Error('The scene exceeds safe image limits.');
			finite(image.pixelWidth, 'image width', 1, 16_384);
			finite(image.pixelHeight, 'image height', 1, 16_384);
			drawnPixels += image.pixelWidth * image.pixelHeight;
			if (!imageResources.has(image.bytes)) {
				imageResources.set(image.bytes, image);
				uniquePixels += image.pixelWidth * image.pixelHeight;
			} else {
				const previous = imageResources.get(image.bytes)!;
				if (
					previous.mimeType !== image.mimeType ||
					previous.pixelWidth !== image.pixelWidth ||
					previous.pixelHeight !== image.pixelHeight
				)
					throw new Error('Shared raster bytes have inconsistent declared metadata.');
			}
			if (uniquePixels > 64_000_000 || drawnPixels > 256_000_000)
				throw new Error('The scene exceeds aggregate decoded image limits.');
			if (image.opacity !== undefined) finite(image.opacity, 'image opacity', 0, 1);
			if (image.pixelWidth * image.pixelHeight > VISIO_RASTER_IMAGE_LIMITS.maxPixels)
				throw new Error('The scene exceeds safe image pixel limits.');
			if (image.x !== undefined) finite(image.x, 'image position');
			if (image.y !== undefined) finite(image.y, 'image position');
			if (image.width !== undefined) finite(image.width, 'image width', 0);
			if (image.height !== undefined) finite(image.height, 'image height', 0);
		}
		for (const child of shape.children) stack.push({ shape: child, depth: depth + 1, ids });
	}
	// Raw host scenes bypass package parsing. Reuse canonical format checks before any
	// browser decoding/export. Validate each shared resource once per pass, after cheap
	// aggregate checks. Never cache by byte identity across calls: typed arrays can mutate.
	for (const image of imageResources.values()) {
		const actual = inspectVisioRasterImage(image.bytes);
		if (
			actual.mimeType !== image.mimeType ||
			actual.pixelWidth !== image.pixelWidth ||
			actual.pixelHeight !== image.pixelHeight
		)
			throw new Error('Declared raster MIME or dimensions do not match the embedded bytes.');
	}
}
