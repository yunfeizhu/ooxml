// Writer for the DrawingML theme part (`a:theme`, ECMA-376 Part 1, 20.1.6.9): the colour and font
// schemes from the shared `DrawingTheme` model, with the format scheme and product extensions
// supplied as DrawingML fragments. Visio adds its `vt:` extensions this way.
import { NS, buildXml, elements, parseXml, type XmlElement } from '../xml/index';
import { drawingColorXml } from './write-color';
import { THEME_COLOR_SLOTS, type DrawingTheme, type ThemeFontCollection } from './theme-model';

export interface DrawingThemeXmlParts {
	/** The `a:fmtScheme` element (required by the schema), as one `a:` fragment. */
	formatScheme: string;
	/** Children of an `a:ext` appended to `a:clrScheme`, keyed by extension URI. */
	colorSchemeExtensions?: Readonly<Record<string, string>>;
	/** Children of an `a:ext` appended to `a:themeElements`, keyed by extension URI. */
	themeElementsExtensions?: Readonly<Record<string, string>>;
	/** Extra namespace prefixes the fragments use (the `a` prefix is always declared). */
	namespaces?: Readonly<Record<string, string>>;
}

function fragment(
	host: XmlElement,
	xml: string,
	namespaces: Readonly<Record<string, string>>,
): XmlElement[] {
	const declarations = Object.entries({ a: NS.a, ...namespaces })
		.map(([prefix, uri]) => ` xmlns:${prefix}="${uri}"`)
		.join('');
	const wrapper = parseXml(`<w${declarations}>${xml}</w>`, { label: 'DrawingML theme fragment' });
	return elements(wrapper.documentElement).map(
		(node) => host.ownerDocument!.importNode(node, true) as XmlElement,
	);
}

function extensionList(
	parent: XmlElement,
	extensions: Readonly<Record<string, string>> | undefined,
	namespaces: Readonly<Record<string, string>>,
): void {
	const entries = Object.entries(extensions ?? {});
	if (!entries.length) return;
	const doc = parent.ownerDocument!;
	const list = doc.createElementNS(NS.a, 'a:extLst');
	for (const [uri, xml] of entries) {
		const ext = doc.createElementNS(NS.a, 'a:ext');
		ext.setAttribute('uri', uri);
		for (const node of fragment(ext, xml, namespaces)) ext.appendChild(node);
		list.appendChild(ext);
	}
	parent.appendChild(list);
}

function fontCollection(parent: XmlElement, name: string, fonts: ThemeFontCollection): void {
	const doc = parent.ownerDocument!;
	const node = doc.createElementNS(NS.a, `a:${name}`);
	for (const [local, face] of [
		['latin', fonts.latin],
		['ea', fonts.eastAsia],
		['cs', fonts.complexScript],
	] as const) {
		const font = doc.createElementNS(NS.a, `a:${local}`);
		font.setAttribute('typeface', face ?? '');
		node.appendChild(font);
	}
	for (const [script, face] of Object.entries(fonts.scripts)) {
		const font = doc.createElementNS(NS.a, 'a:font');
		font.setAttribute('script', script);
		font.setAttribute('typeface', face);
		node.appendChild(font);
	}
	parent.appendChild(node);
}

/**
 * A complete `a:theme` part. Every one of the twelve colour slots must be present in the model;
 * the format scheme and extensions are product data and are copied as given.
 */
export function drawingThemeXml(theme: DrawingTheme, parts: DrawingThemeXmlParts): string {
	const namespaces = parts.namespaces ?? {};
	const doc = parseXml(
		`<a:theme xmlns:a="${NS.a}"${Object.entries(namespaces)
			.map(([prefix, uri]) => ` xmlns:${prefix}="${uri}"`)
			.join('')}/>`,
	);
	const root = doc.documentElement;
	if (theme.name !== undefined) root.setAttribute('name', theme.name);
	const elementsNode = doc.createElementNS(NS.a, 'a:themeElements');
	root.appendChild(elementsNode);
	const scheme = doc.createElementNS(NS.a, 'a:clrScheme');
	scheme.setAttribute('name', theme.colorScheme.name ?? theme.name ?? 'Custom');
	for (const slot of THEME_COLOR_SLOTS) {
		const color = theme.colorScheme.colors[slot];
		if (!color) throw new Error(`The theme colour scheme has no ${slot} colour.`);
		const node = doc.createElementNS(NS.a, `a:${slot}`);
		for (const child of fragment(node, drawingColorXml(color), namespaces)) node.appendChild(child);
		scheme.appendChild(node);
	}
	extensionList(scheme, parts.colorSchemeExtensions, namespaces);
	elementsNode.appendChild(scheme);
	const fonts = doc.createElementNS(NS.a, 'a:fontScheme');
	fonts.setAttribute('name', theme.fontScheme.name ?? theme.name ?? 'Custom');
	fontCollection(fonts, 'majorFont', theme.fontScheme.major);
	fontCollection(fonts, 'minorFont', theme.fontScheme.minor);
	elementsNode.appendChild(fonts);
	const format = fragment(elementsNode, parts.formatScheme, namespaces);
	if (
		format.length !== 1 ||
		format[0]!.localName !== 'fmtScheme' ||
		format[0]!.namespaceURI !== NS.a
	)
		throw new Error('The theme format scheme must be one a:fmtScheme element.');
	elementsNode.appendChild(format[0]!);
	extensionList(elementsNode, parts.themeElementsExtensions, namespaces);
	root.appendChild(doc.createElementNS(NS.a, 'a:objectDefaults'));
	root.appendChild(doc.createElementNS(NS.a, 'a:extraClrSchemeLst'));
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${buildXml(doc)}`;
}
