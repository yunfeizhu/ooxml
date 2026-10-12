// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VisioDocument } from 'ooxml-core/visio';
import { demoDocument } from 'ooxml-core/visio/ui';
import { exportPageSvg } from './export-svg';
import * as exporter from './export-svg';
import {
	createPrintSnapshot,
	PRINT_SNAPSHOT_LIMITS,
	type PrintSnapshotLimits,
	type PrintSnapshotOptions,
} from './print-snapshot';
import { rasterFixture } from './__fixtures__/raster-fixtures.mjs';

function scene(count = 2): VisioDocument {
	return {
		format: 'vsdx',
		diagnostics: [],
		pages: Array.from({ length: count }, (_, index) => {
			const page = structuredClone(demoDocument.pages[0]!);
			page.id = String(index);
			page.name = `Page ${index}`;
			page.width = page.height = 1;
			page.shapes = [page.shapes[0]!];
			page.shapes[0]!.text.plainText = `Content ${index}`;
			return page;
		}),
	};
}
const parse = (svg: string) => new DOMParser().parseFromString(svg, 'image/svg+xml');
function expectFrozen(value: object): void {
	expect(Object.isFrozen(value)).toBe(true);
	for (const child of Object.values(value))
		if (child && typeof child === 'object') expectFrozen(child);
}
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	document.body.replaceChildren();
});

describe('immutable, display-based print artifacts', () => {
	it('preserves explicit selection order, separate SVGs and drawing dimensions', () => {
		const model = scene();
		model.pages[1]!.width = 2.5;
		model.pages[1]!.height = 3.25;
		const result = createPrintSnapshot(model, { pageIndices: [1, 0] });
		expect(result.appearance).toBe('saved-display');
		expect(result.pages.map((page) => page.pageIndex)).toEqual([1, 0]);
		expect(result.pages[0]).toMatchObject({
			pageId: '1',
			pageName: 'Page 1',
			drawingSize: { width: 2.5, height: 3.25, unit: 'in' },
		});
		expect(result.byteLength).toBe(result.pages.reduce((sum, page) => sum + page.byteLength, 0));
		expect(result.usage.svgBytes).toBe(result.byteLength);
		for (const page of result.pages) {
			const xml = parse(page.svg);
			expect(xml.querySelector('parsererror')).toBeNull();
			expect(xml.querySelectorAll('svg')).toHaveLength(1);
			expect(xml.documentElement.getAttribute('width')).toBe(`${page.drawingSize.width}in`);
			expect(new TextEncoder().encode(page.svg).byteLength).toBe(page.byteLength);
		}
		expect(result.limitations.join(' ')).toMatch(/Saved print visibility.*not applied/);
		expect(result.limitations.join(' ')).toContain('NonPrinting');
		expect(result.limitations.join(' ')).toContain('Saved printer settings are unsupported');
		expect(result.limitations.join(' ')).toContain('does not print');
	});
	it('copies and deeply freezes every output object without mutating or freezing input', () => {
		const model = scene(),
			before = structuredClone(model);
		const options = { pageIndices: [1, 0], limits: { maxPages: 2 } };
		const result = createPrintSnapshot(model, options);
		expectFrozen(result);
		expect(model).toEqual(before);
		expect(Object.isFrozen(model)).toBe(false);
		expect(Object.isFrozen(model.pages[0])).toBe(false);
		expect(Object.isFrozen(model.pages[0]!.shapes)).toBe(false);
		expect(Object.isFrozen(options.limits)).toBe(false);
		model.pages[1]!.name = 'Changed';
		model.pages[1]!.width = 4;
		options.pageIndices.reverse();
		options.limits.maxPages = 1;
		expect(result.pageIndices).toEqual([1, 0]);
		expect(result.limits.maxPages).toBe(2);
		expect(result.pages[0]!.pageName).toBe('Page 1');
		expect(result.pages[0]!.drawingSize.width).toBe(1);
	});
	it('retains every exporter diagnostic, warning severity and occurrence count on every page', () => {
		const model = scene();
		model.diagnostics.push(
			{ code: 'a', message: 'Saved approximation', severity: 'info' },
			{ code: 'b', message: 'Saved approximation', severity: 'warning' },
		);
		model.pages[0]!.shapes[0]!.style.linePattern = 99;
		const expected = model.pages.map((_, index) => exportPageSvg(model, index).diagnostics);
		const result = createPrintSnapshot(model, { pageIndices: [0, 1] });
		expect(result.pages.map((page) => page.diagnostics)).toEqual(expected);
		expect(result.pages[0]!.diagnostics).toContainEqual({
			message: 'Saved approximation',
			severity: 'warning',
			count: 2,
		});
		expect(
			result.pages[0]!.diagnostics.some((note) => note.message.includes('unresolved line pattern')),
		).toBe(true);
		model.diagnostics[0]!.message = 'Changed';
		expect(result.pages[0]!.diagnostics).toEqual(expected[0]);
	});
	it('keeps colliding raster IDs isolated and embedded PNG/JPEG bytes distinct', () => {
		const model = scene();
		model.pages[0]!.shapes[0]!.image = rasterFixture('image/png');
		model.pages[1]!.shapes[0]!.image = rasterFixture('image/jpeg');
		const result = createPrintSnapshot(model, { pageIndices: [0, 1] });
		for (const [index, type] of ['png', 'jpeg'].entries()) {
			const xml = parse(result.pages[index]!.svg);
			expect(xml.querySelectorAll('#visio-export-image-1')).toHaveLength(1);
			expect(
				xml.querySelector('image')!.getAttributeNS('http://www.w3.org/1999/xlink', 'href'),
			).toMatch(new RegExp(`^data:image/${type};base64,`));
		}
	});
	it('preserves hidden display state regardless of layer printability', () => {
		const model = scene(1);
		model.pages[0]!.shapes[0]!.hidden = true;
		model.pages[0]!.layers = [
			{ id: '0', name: 'Hidden printable', visible: false, printable: true, locked: false },
		];
		const result = createPrintSnapshot(model, { pageIndices: [0] });
		expect(parse(result.pages[0]!.svg).querySelector('g > title')).toBeNull();
		expect(model.pages[0]!.shapes[0]!.hidden).toBe(true);
	});
});

describe('whole-job preflight', () => {
	it.each(
		[[], [0, 0], [-1], [2], [0.5], [NaN], [Infinity]].map((pageIndices) => ({ pageIndices })),
	)('rejects invalid selection %j before DOM work', ({ pageIndices }) => {
		const allocate = vi.spyOn(document, 'createElementNS');
		expect(() => createPrintSnapshot(scene(), { pageIndices })).toThrow(/selection|page index/);
		expect(allocate).not.toHaveBeenCalled();
	});
	it.each([
		undefined,
		null,
		{},
		{ pageIndices: 'all' },
		{ pageIndices: [0], limits: null },
		{ pageIndices: [0], limits: [] },
		{ pageIndices: [0], limits: { extra: 1 } },
		{ pageIndices: [0], scale: 0.5 },
	])('rejects malformed options %j', (options) => {
		expect(() => createPrintSnapshot(scene(), options as PrintSnapshotOptions)).toThrow(/snapshot/);
	});
	it.each(Object.entries(PRINT_SNAPSHOT_LIMITS))(
		'permits lowering but rejects invalid or raised %s',
		(key, hardLimit) => {
			for (const value of [0, -1, 0.5, NaN, Infinity, undefined, hardLimit + 1])
				expect(() =>
					createPrintSnapshot(scene(), { pageIndices: [0], limits: { [key]: value } }),
				).toThrow(key);
		},
	);
	it('accepts exactly the selected-page ceiling and rejects one more before export', () => {
		const model = scene(33);
		const pages = Array.from({ length: 32 }, (_, index) => index);
		expect(createPrintSnapshot(model, { pageIndices: pages }).pages).toHaveLength(32);
		const allocate = vi.spyOn(document, 'createElementNS');
		expect(() => createPrintSnapshot(model, { pageIndices: [...pages, 32] })).toThrow(
			'selected page count',
		);
		expect(allocate).not.toHaveBeenCalled();
	});
	it('resolves nested, missing and cyclic backgrounds through core and keeps foreground dimensions', () => {
		const model = scene(3);
		model.pages[0]!.backgroundPageId = '1';
		model.pages[1]!.backgroundPageId = '2';
		model.pages[1]!.isBackground = model.pages[2]!.isBackground = true;
		model.pages[2]!.width = 5;
		const snapshot = createPrintSnapshot(model, { pageIndices: [0, 2] });
		expect(snapshot.pages).toHaveLength(2);
		expect(snapshot.pages[0]!.drawingSize.width).toBe(1);
		expect(
			Array.from(
				parse(snapshot.pages[0]!.svg).querySelectorAll('g > title'),
				(node) => node.textContent,
			),
		).toEqual(['Content 2', 'Content 1', 'Content 0']);
		expect(snapshot.pages[1]!.pageId).toBe('2');
		model.pages[2]!.backgroundPageId = '0';
		expect(createPrintSnapshot(model, { pageIndices: [0] }).usage.shapeInstances).toBe(3);
		model.pages[1]!.backgroundPageId = 'missing';
		expect(createPrintSnapshot(model, { pageIndices: [0] }).usage.shapeInstances).toBe(2);
	});
	it('charges repeated shared backgrounds to every selected output including hidden content', () => {
		const model = scene(3);
		for (const page of model.pages.slice(0, 2)) page.backgroundPageId = '2';
		model.pages[2]!.shapes[0]!.hidden = true;
		const result = createPrintSnapshot(model, { pageIndices: [0, 1] });
		expect(result.usage.shapeInstances).toBe(4);
		const allocate = vi.spyOn(document, 'createElementNS');
		expect(() =>
			createPrintSnapshot(model, { pageIndices: [0, 1], limits: { maxShapeInstances: 3 } }),
		).toThrow('shapeInstances');
		expect(allocate).not.toHaveBeenCalled();
	});
	it('enforces exact and one-over aggregate boundaries before the first page export', () => {
		const model = scene();
		const image = rasterFixture();
		for (const page of model.pages) {
			page.shapes[0]!.image = image;
			page.shapes[0]!.text.runs = [
				{
					text: 'a',
					fontFamily: 'Arial',
					fontSize: 0.1,
					color: '#000',
					bold: false,
					italic: false,
					underline: false,
				},
			];
		}
		const usage = createPrintSnapshot(model, { pageIndices: [0, 1] }).usage;
		const boundaries: Partial<PrintSnapshotLimits> = {
			maxTotalBytes: usage.estimatedSvgBytes,
			maxShapeInstances: usage.shapeInstances,
			maxGeometryInstances: usage.geometryInstances,
			maxPathCharacters: usage.pathCharacters,
			maxTextCharacters: usage.textCharacters,
			maxTextRuns: usage.textRuns,
			maxImageBytes: usage.imageBytes,
			maxUniqueImagePixels: usage.uniqueImagePixels,
			maxImageInstancePixels: usage.imageInstancePixels,
			maxTotalAreaCssPixels: usage.totalAreaCssPixels,
			maxValidationShapeVisits: usage.validationShapeVisits,
			maxValidationWork: usage.validationWork,
		};
		expect(() =>
			createPrintSnapshot(model, { pageIndices: [0, 1], limits: boundaries }),
		).not.toThrow();
		for (const [key, value] of Object.entries(boundaries)) {
			const allocate = vi.spyOn(document, 'createElementNS');
			expect(
				() => createPrintSnapshot(model, { pageIndices: [0, 1], limits: { [key]: value - 1 } }),
				key,
			).toThrow(/safe/);
			expect(allocate, key).not.toHaveBeenCalled();
			allocate.mockRestore();
		}
	});
	it('counts shared rasters once per output page but every drawn instance', () => {
		const model = scene(3),
			base = model.pages[2]!.shapes[0]!;
		base.image = rasterFixture();
		model.pages[2]!.shapes.push({ ...structuredClone(base), id: 'copy', image: base.image });
		model.pages[0]!.backgroundPageId = model.pages[1]!.backgroundPageId = '2';
		const usage = createPrintSnapshot(model, { pageIndices: [0, 1] }).usage;
		expect(usage.uniqueImagePixels).toBe(2);
		expect(usage.imageInstancePixels).toBe(4);
		expect(usage.imageBytes).toBe(base.image.bytes.byteLength * 2);
	});
	it('caps axes and page area, rejecting large-format drawings without rescaling', () => {
		const model = scene(1);
		expect(() =>
			createPrintSnapshot(model, {
				pageIndices: [0],
				limits: { maxPageAxisCssPixels: 96, maxPageAreaCssPixels: 9216 },
			}),
		).not.toThrow();
		for (const limits of [{ maxPageAxisCssPixels: 95 }, { maxPageAreaCssPixels: 9215 }])
			expect(() => createPrintSnapshot(model, { pageIndices: [0], limits })).toThrow('CSS pixels');
		model.pages[0]!.width = 4096 / 96;
		expect(() => createPrintSnapshot(model, { pageIndices: [0] })).not.toThrow();
		model.pages[0]!.width = 4097 / 96;
		const allocate = vi.spyOn(document, 'createElementNS');
		expect(() => createPrintSnapshot(model, { pageIndices: [0] })).toThrow('drawing width');
		expect(allocate).not.toHaveBeenCalled();
	});
	it('charges repeated full-document validation including image bytes on unselected pages', () => {
		const model = scene(4),
			tiny = createPrintSnapshot(model, { pageIndices: [0, 1] });
		model.pages[3]!.shapes[0]!.image = rasterFixture('image/png', 1024);
		const result = createPrintSnapshot(model, { pageIndices: [0, 1] });
		expect(result.usage.validationShapeVisits).toBe(4 * 7);
		expect(result.usage.validationWork - tiny.usage.validationWork).toBe(
			model.pages[3]!.shapes[0]!.image!.bytes.byteLength * 7,
		);
		const allocate = vi.spyOn(document, 'createElementNS');
		expect(() =>
			createPrintSnapshot(model, {
				pageIndices: [0, 1],
				limits: { maxValidationWork: tiny.usage.validationWork },
			}),
		).toThrow('whole-document validation work');
		expect(allocate).not.toHaveBeenCalled();
	});
	it('retains the per-page byte ceiling and the shared conservative estimator', () => {
		const model = scene(1),
			result = createPrintSnapshot(model, { pageIndices: [0] });
		expect(() =>
			createPrintSnapshot(model, {
				pageIndices: [0],
				limits: { maxPageBytes: result.usage.estimatedSvgBytes },
			}),
		).not.toThrow();
		const allocate = vi.spyOn(document, 'createElementNS');
		expect(() =>
			createPrintSnapshot(model, {
				pageIndices: [0],
				limits: { maxPageBytes: result.usage.estimatedSvgBytes - 1 },
			}),
		).toThrow('SVG export');
		expect(allocate).not.toHaveBeenCalled();
	});
});

describe('no printing, mounting or mutable-byte validation bypass', () => {
	it('keeps both page dimensions and charged area consistent when serialization changes source widths', () => {
		const model = scene(),
			serialize = XMLSerializer.prototype.serializeToString;
		vi.spyOn(XMLSerializer.prototype, 'serializeToString').mockImplementationOnce((node) => {
			const xml = serialize.call(new XMLSerializer(), node);
			for (const page of model.pages) page.width = 5000;
			return xml;
		});
		const result = createPrintSnapshot(model, { pageIndices: [0, 1] });
		for (const page of result.pages) {
			expect(page.drawingSize.width).toBe(1);
			expect(parse(page.svg).documentElement.getAttribute('width')).toBe('1in');
			expect(JSON.parse(parse(page.svg).querySelector('metadata')!.textContent!).page.width).toBe(
				1,
			);
		}
		expect(result.usage.totalAreaCssPixels).toBe(2 * 96 * 96);
		expect(model.pages.every((page) => page.width === 5000)).toBe(true);
	});
	it('captures all drawing data and shared raster bytes before the first DOM callback', () => {
		const model = scene(3),
			background = model.pages[2]!.shapes[0]!;
		model.pages[0]!.backgroundPageId = model.pages[1]!.backgroundPageId = '2';
		background.image = rasterFixture();
		model.pages[1]!.shapes[0]!.image = background.image;
		background.style.fillGradient = {
			type: 'linear',
			start: [0, 0],
			end: [1, 1],
			stops: [
				{ offset: 0, color: '#000', opacity: 1 },
				{ offset: 1, color: '#fff', opacity: 1 },
			],
		};
		const before = createPrintSnapshot(model, { pageIndices: [0, 1] });
		const create = document.createElementNS.bind(document);
		vi.spyOn(document, 'createElementNS').mockImplementationOnce((namespace, name, options) => {
			for (const page of model.pages) {
				page.width = page.height = 5000;
				page.id = page.name = 'Changed';
				page.backgroundPageId = 'missing';
				for (const shape of page.shapes) {
					shape.geometry[0]!.path = 'Changed path';
					shape.hidden = true;
					shape.transform = [1, 0, 0, 1, 100, 100];
					shape.style.fill = '#f00';
					shape.text.plainText = 'Changed text';
					shape.text.margins.left = 100;
				}
			}
			background.style.fillGradient!.stops[0]!.color = '#f00';
			background.image!.bytes.fill(0);
			model.diagnostics.push({ code: 'changed', severity: 'warning', message: 'Changed warning' });
			model.pages.length = 0;
			return create(namespace, name, options);
		});
		const result = createPrintSnapshot(model, { pageIndices: [0, 1] });
		const stableIds = (svg: string) => svg.replace(/(visio-(?:fill|image-clip)-)\d+/g, '$1id');
		expect({ ...result.usage, svgBytes: 0 }).toEqual({ ...before.usage, svgBytes: 0 });
		expect(
			result.pages.map((page) => ({ ...page, byteLength: 0, svg: stableIds(page.svg) })),
		).toEqual(before.pages.map((page) => ({ ...page, byteLength: 0, svg: stableIds(page.svg) })));
		expect(model.pages).toHaveLength(0);
	});
	it('rechecks computation cost if a known-field getter adds resources while copying the scene', () => {
		const model = scene(),
			baseline = createPrintSnapshot(model, { pageIndices: [0] });
		const image = rasterFixture('image/png', 1024);
		Object.defineProperty(model.pages[0]!, 'isBackground', {
			get() {
				model.pages[1]!.shapes[0]!.image = image;
				return false;
			},
		});
		const allocate = vi.spyOn(document, 'createElementNS');
		expect(() =>
			createPrintSnapshot(model, {
				pageIndices: [0],
				limits: {
					maxValidationWork: baseline.usage.validationWork,
				},
			}),
		).toThrow('whole-document validation work');
		expect(allocate).not.toHaveBeenCalled();
		const result = createPrintSnapshot(model, { pageIndices: [0] });
		expect(result.usage.validationWork).toBe(
			baseline.usage.validationWork + image.bytes.byteLength * 5,
		);
	});
	it('does not create browser sessions, downloads, frames, URLs, requests or print dialogs', () => {
		const print = vi.spyOn(window, 'print'),
			open = vi.spyOn(window, 'open');
		const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
		const create = vi.fn(),
			revoke = vi.fn(),
			fetch = vi.fn();
		vi.stubGlobal(
			'URL',
			Object.assign(class extends URL {}, { createObjectURL: create, revokeObjectURL: revoke }),
		);
		vi.stubGlobal('fetch', fetch);
		document.body.innerHTML = '<p>Existing host page</p>';
		const before = document.body.innerHTML,
			model = scene();
		model.pages[0]!.shapes[0]!.image = rasterFixture();
		createPrintSnapshot(model, { pageIndices: [0, 1] });
		for (const effect of [print, open, click, create, revoke, fetch])
			expect(effect).not.toHaveBeenCalled();
		expect(document.body.innerHTML).toBe(before);
		expect(document.querySelector('iframe')).toBeNull();
	});
	it('revalidates mutable bytes on every call, including an unselected page', () => {
		const model = scene(),
			image = rasterFixture();
		model.pages[1]!.shapes[0]!.image = image;
		const saved = createPrintSnapshot(model, { pageIndices: [0] });
		image.bytes[0] = 0;
		const allocate = vi.spyOn(document, 'createElementNS');
		expect(() => createPrintSnapshot(model, { pageIndices: [0] })).toThrow('not a supported');
		expect(allocate).not.toHaveBeenCalled();
		expect(saved.pages).toHaveLength(1);
	});
	it('fails atomically if a later export fails and still checks actual aggregate byte totals', () => {
		const model = scene(),
			real = exporter.exportPageSvg,
			nodeCount = document.body.childNodes.length;
		const exporting = vi
			.spyOn(exporter, 'exportPageSvg')
			.mockImplementationOnce((...args) => real(...args))
			.mockImplementationOnce(() => {
				throw new Error('late failure');
			});
		expect(() => createPrintSnapshot(model, { pageIndices: [0, 1] })).toThrow('late failure');
		expect(exporting).toHaveBeenCalledTimes(2);
		expect(document.body.childNodes).toHaveLength(nodeCount);
		exporting.mockImplementation((...args) => ({
			...real(...args),
			byteLength: PRINT_SNAPSHOT_LIMITS.maxTotalBytes,
		}));
		expect(() => createPrintSnapshot(model, { pageIndices: [0, 1] })).toThrow('svgBytes');
		expect(document.querySelector('iframe')).toBeNull();
	});
});
