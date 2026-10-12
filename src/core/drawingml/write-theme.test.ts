import { describe, expect, it } from 'vitest';
import { parseXml } from '../xml/index';
import { parseTheme } from './theme';
import { THEME_COLOR_SLOTS, type DrawingTheme } from './theme-model';
import { drawingThemeXml } from './write-theme';

const theme = (): DrawingTheme => ({
	name: 'Sample & Co',
	colorScheme: {
		name: 'Sample',
		colors: Object.fromEntries(
			THEME_COLOR_SLOTS.map((slot, index) => [
				slot,
				{
					kind: 'srgb',
					value: (index * 0x111111).toString(16).padStart(6, '0').toUpperCase(),
					transforms: [],
				},
			]),
		),
	},
	fontScheme: {
		name: 'Sample',
		major: { latin: 'Georgia', eastAsia: '', complexScript: '', scripts: { Jpan: 'Yu Mincho' } },
		minor: { latin: 'Verdana', scripts: {} },
	},
});
const format =
	'<a:fmtScheme name="Sample"><a:fillStyleLst/><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme>';

describe('drawingThemeXml', () => {
	it('round trips the colour and font schemes through the shared reader', () => {
		const xml = drawingThemeXml(theme(), { formatScheme: format });
		const parsed = parseTheme(parseXml(xml).documentElement);
		expect(parsed.name).toBe('Sample & Co');
		expect(parsed.colorScheme.colors.accent3).toEqual(theme().colorScheme.colors.accent3);
		expect(parsed.fontScheme.major).toMatchObject({
			latin: 'Georgia',
			scripts: { Jpan: 'Yu Mincho' },
		});
		expect(parsed.fontScheme.minor.latin).toBe('Verdana');
	});
	it('places product extensions and rejects incomplete input', () => {
		const xml = drawingThemeXml(theme(), {
			formatScheme: format,
			namespaces: { x: 'urn:example' },
			colorSchemeExtensions: { '{1}': '<x:id value="7"/>' },
			themeElementsExtensions: { '{2}': '<x:more/>' },
		});
		const root = parseXml(xml).documentElement;
		expect(
			root.getElementsByTagNameNS('urn:example', 'id')[0]?.parentNode?.parentNode?.parentNode
				?.nodeName,
		).toBe('a:clrScheme');
		expect(root.getElementsByTagNameNS('urn:example', 'more')).toHaveLength(1);
		const missing = theme();
		delete missing.colorScheme.colors.hlink;
		expect(() => drawingThemeXml(missing, { formatScheme: format })).toThrow(/hlink/);
		expect(() => drawingThemeXml(theme(), { formatScheme: '<a:fillStyleLst/>' })).toThrow();
	});
});
