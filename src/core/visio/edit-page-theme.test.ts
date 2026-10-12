import { describe, expect, it } from 'vitest';
import { editVsdx } from './edit';
import { parseVsdx } from './parser';
import { VisioPackage } from './package';
import { createVsdx } from './create-document';
import { visioFallbackQuickStyle } from './edit-formatting-effects';
import { snapshotPageTheme } from './edit-page-theme-commands';
import { loadVisioThemes } from './theme';
import { visioBuiltInTheme, visioThemeVariantColors } from './theme-builtins';
import { visioThemeXml } from './theme-write';
import { parseTheme } from '../drawingml/index';
import { parseXml } from '../xml/index';
import { copySnapshotScene } from './ui/snapshot-scene';
import { assertViewableDocument } from './ui/scene-validation';
import { attribute, child, children } from './sheet';

const page = '0';
async function drawing(): Promise<Uint8Array> {
	const blank = await createVsdx();
	const drawn = await editVsdx(blank, [
		{ type: 'create-rectangle', pageId: page, shapeId: '1', x: 1, y: 1, width: 2, height: 1 },
		{ type: 'create-rectangle', pageId: page, shapeId: '2', x: 4, y: 1, width: 2, height: 1 },
	]);
	// Shape 1 is quick-styled like a dropped master; shape 2 keeps a custom fill.
	return (
		await editVsdx(drawn.bytes, [
			{ type: 'format-shape', pageId: page, shapeId: '1', quickStyle: { color: 100, matrix: 4 } },
			{ type: 'format-shape', pageId: page, shapeId: '2', fillColor: '#123456' },
		])
	).bytes;
}
const shapes = async (bytes: Uint8Array) => (await parseVsdx(bytes)).pages[0]!.shapes;
async function pageSheet(bytes: Uint8Array): Promise<Map<string, string | undefined>> {
	const root = await (await VisioPackage.open(bytes)).readXml('visio/pages/pages.xml');
	const sheet = child(children(root, 'Page')[0], 'PageSheet');
	return new Map(
		children(sheet, 'Cell').map((cell) => [attribute(cell, 'N')!, attribute(cell, 'V')]),
	);
}

describe('built-in theme parts', () => {
	it('writes a DrawingML theme with the Visio extensions the reader understands', async () => {
		const source = visioBuiltInTheme('harbor');
		const xml = visioThemeXml(source);
		const shared = parseTheme(parseXml(xml).documentElement);
		expect(shared.name).toBe('Harbor');
		expect(shared.colorScheme.colors.accent1).toMatchObject({ kind: 'srgb', value: '1F78B4' });
		expect(shared.fontScheme.minor.latin).toBe('Trebuchet MS');
		const pkg = await VisioPackage.open(await createVsdx());
		const bytes = await editVsdx(await createVsdx(), [
			{ type: 'set-page-theme', pageId: page, theme: 'harbor' },
		]);
		const themes = await loadVisioThemes(
			await VisioPackage.open(bytes.bytes),
			'visio/document.xml',
			() => {
				throw new Error('unexpected diagnostic');
			},
		);
		expect(pkg.paths()).not.toContain('visio/theme/theme1.xml');
		expect(themes).toHaveLength(1);
		const [theme] = themes;
		expect(theme).toMatchObject({
			name: 'Harbor',
			colorId: source.schemeId,
			effectId: source.schemeId,
		});
		expect(theme!.variants).toHaveLength(4);
		expect(theme!.fills).toHaveLength(6);
		expect(theme!.lines).toHaveLength(6);
		expect(theme!.fonts).toHaveLength(6);
		expect(theme!.variationStyles.map((list) => list.length)).toEqual([4, 4, 4, 4]);
	});
	it('adds the part, its relationship and content type once', async () => {
		const first = await editVsdx(await drawing(), [
			{ type: 'set-page-theme', pageId: page, theme: 'office' },
		]);
		const pkg = await VisioPackage.open(first.bytes);
		expect(pkg.paths()).toContain('visio/theme/theme1.xml');
		const rels = [...(await pkg.relationships('visio/document.xml')).values()];
		expect(rels.filter((rel) => rel.type.endsWith('/theme')).map((rel) => rel.target)).toEqual([
			'visio/theme/theme1.xml',
		]);
		const types = await pkg.readXml('[Content_Types].xml');
		expect(
			Array.from(types.getElementsByTagNameNS(types.namespaceURI, 'Override'))
				.find((node) => attribute(node, 'PartName') === '/visio/theme/theme1.xml')
				?.getAttribute('ContentType'),
		).toBe('application/vnd.openxmlformats-officedocument.theme+xml');
		const again = await editVsdx(first.bytes, [
			{ type: 'set-page-theme', pageId: page, theme: 'office', variant: 2 },
		]);
		expect(
			(await VisioPackage.open(again.bytes)).paths().filter((path) => path.includes('theme/')),
		).toEqual(['visio/theme/theme1.xml']);
		const second = await editVsdx(again.bytes, [
			{ type: 'set-page-theme', pageId: page, theme: 'ember' },
		]);
		const paths = (await VisioPackage.open(second.bytes)).paths();
		expect(paths).toContain('visio/theme/theme2.xml');
	});
});

describe('page theme edits', () => {
	it('selects the theme on the page and recolours quick-styled shapes through parseVsdx', async () => {
		const before = await shapes(await drawing());
		expect(before[0]!.style.fill).toBe(visioFallbackQuickStyle({ color: 100, matrix: 4 }).fill);
		const saved = await editVsdx(await drawing(), [
			{ type: 'set-page-theme', pageId: page, theme: 'harbor' },
		]);
		const source = visioBuiltInTheme('harbor');
		const cells = await pageSheet(saved.bytes);
		for (const name of [
			'ColorSchemeIndex',
			'EffectSchemeIndex',
			'ConnectorSchemeIndex',
			'ThemeIndex',
		])
			expect(cells.get(name)).toBe(String(source.schemeId));
		expect(cells.get('VariationColorIndex')).toBe('0');
		const document = await parseVsdx(saved.bytes);
		const [styled, custom] = document.pages[0]!.shapes;
		expect(styled!.style.fill).toBe('#1f78b4');
		expect(styled!.text.color).toBe('#ffffff');
		expect(custom!.style.fill).toBe('#123456');
		expect(document.pages[0]!.theme).toMatchObject({
			name: 'Harbor',
			builtIn: 'harbor',
			variant: 0,
		});
		expect(document.pages[0]!.theme!.accents[0]).toBe('#1f78b4');
		assertViewableDocument(copySnapshotScene(document));
		const variant = await editVsdx(saved.bytes, [
			{ type: 'set-page-theme', pageId: page, variant: 2 },
		]);
		const recoloured = await parseVsdx(variant.bytes);
		expect(recoloured.pages[0]!.shapes[0]!.style.fill).toBe(
			`#${visioThemeVariantColors(source, 2)[0]!.toLowerCase()}`,
		);
		expect(recoloured.pages[0]!.theme!.variant).toBe(2);
		const other = await editVsdx(variant.bytes, [
			{ type: 'set-page-theme', pageId: page, theme: 'ember' },
		]);
		expect((await shapes(other.bytes))[0]!.style.fill).toBe('#d9480f');
	});
	it('new quick styles use THEMEVAL once the page has a theme', async () => {
		const themed = await editVsdx(await createVsdx(), [
			{ type: 'set-page-theme', pageId: page, theme: 'grove' },
		]);
		const drawn = await editVsdx(themed.bytes, [
			{ type: 'create-rectangle', pageId: page, shapeId: '1', x: 1, y: 1, width: 2, height: 1 },
			{ type: 'format-shape', pageId: page, shapeId: '1', quickStyle: { color: 100, matrix: 4 } },
		]);
		const root = await (await VisioPackage.open(drawn.bytes)).readXml('visio/pages/page1.xml');
		const shape = children(children(root, 'Shapes')[0], 'Shape')[0]!;
		const fill = children(shape, 'Cell').find((cell) => attribute(cell, 'N') === 'FillForegnd');
		expect(attribute(fill, 'F')).toBe('THEMEVAL()');
		expect((await shapes(drawn.bytes))[0]!.style.fill).toBe('#3e7c4f');
	});
	it('No Theme restores the theme-less quick style colours', async () => {
		const original = await drawing();
		const themed = await editVsdx(original, [
			{ type: 'set-page-theme', pageId: page, theme: 'slate' },
		]);
		const cleared = await editVsdx(themed.bytes, [
			{ type: 'set-page-theme', pageId: page, theme: 'none' },
		]);
		expect((await pageSheet(cleared.bytes)).get('ColorSchemeIndex')).toBe('0');
		const [styled, custom] = await shapes(cleared.bytes);
		const fallback = visioFallbackQuickStyle({ color: 100, matrix: 4 });
		expect(styled!.style).toMatchObject({ fill: fallback.fill, lineColor: fallback.line });
		expect(custom!.style.fill).toBe('#123456');
		expect((await parseVsdx(cleared.bytes)).pages[0]!.theme).toBeUndefined();
	});
	it('refuses invalid commands, mixed transactions and variants without a theme', async () => {
		expect(() => snapshotPageTheme({ type: 'set-page-theme', pageId: page })).toThrow();
		expect(() =>
			snapshotPageTheme({ type: 'set-page-theme', pageId: page, theme: 'missing' as never }),
		).toThrow();
		expect(() =>
			snapshotPageTheme({ type: 'set-page-theme', pageId: page, theme: 'none', variant: 1 }),
		).toThrow();
		expect(() =>
			snapshotPageTheme({ type: 'set-page-theme', pageId: page, theme: 'office', variant: 4 }),
		).toThrow();
		const bytes = await drawing();
		await expect(
			editVsdx(bytes, [{ type: 'set-page-theme', pageId: page, variant: 1 }]),
		).rejects.toMatchObject({ code: 'UNSUPPORTED_THEME_EDIT' });
		await expect(
			editVsdx(bytes, [
				{ type: 'set-page-theme', pageId: page, theme: 'office' },
				{ type: 'format-shape', pageId: page, shapeId: '1', fillColor: '#000000' },
			]),
		).rejects.toMatchObject({ code: 'EDIT_MIXED_THEME_TRANSACTION' });
		await expect(
			editVsdx(bytes, [{ type: 'set-page-theme', pageId: 'missing', theme: 'office' }]),
		).rejects.toMatchObject({ code: 'EDIT_TARGET_NOT_FOUND' });
	});
});
