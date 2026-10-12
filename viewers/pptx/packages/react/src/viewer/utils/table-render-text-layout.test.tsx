import { translationsEn } from 'ooxml-ui/pptx/i18n';
/**
 * Table cells use PowerPoint's single line spacing (1.2x the font size) and
 * default cell margins. Left to the page, a cell inherited its host's
 * line-height (1.5 under Tailwind), so every wrapped line sat too far below the
 * one above it, and a fixed 4px inset fitted more text on a line than PowerPoint does.
 */
import type { TablePptxElement, XmlObject } from 'pptx-viewer-core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { renderTableElement } from './table-render';

vi.mock<typeof import('react-i18next')>(import('react-i18next'), () => ({
	useTranslation: () => ({
		t: (key: string) => translationsEn[key] ?? key,
	}),
}));

function table(withXml: boolean, cellProperties: Record<string, string> = {}): TablePptxElement {
	return {
		id: 'tbl-1',
		type: 'table',
		x: 0,
		y: 0,
		width: 400,
		height: 120,
		tableData: { columnWidths: [1], rows: [{ cells: [{ text: 'A1' }] }] },
		...(withXml
			? {
					rawXml: {
						'a:graphic': {
							'a:graphicData': {
								'a:tbl': {
									'a:tblGrid': { 'a:gridCol': { '@_w': '3657600' } },
									'a:tr': {
										'a:tc': {
											'a:txBody': { 'a:p': { 'a:r': { 'a:t': 'A1' } } },
											'a:tcPr': cellProperties,
										},
									},
								},
							},
						},
					} as XmlObject,
				}
			: {}),
	} as TablePptxElement;
}

describe('table cell text layout', () => {
	it.each([
		['a table loaded from a file', true],
		['a table built in the editor', false],
	])('uses single line spacing and default margins on the cells of %s', (_name, withXml) => {
		const markup = renderToStaticMarkup(renderTableElement(table(withXml), {}));
		const cell = markup.match(/<td[^>]*style="([^"]*)"/u)?.[1];
		expect(cell).toContain('line-height:1.2');
		expect(cell).toContain('padding-left:9.6px');
		expect(cell).toContain('padding-top:4.8px');
	});

	it("keeps a file cell's own margins, an explicit zero included", () => {
		const markup = renderToStaticMarkup(
			renderTableElement(table(true, { '@_marL': '0', '@_marT': '91440' }), {}),
		);
		const cell = markup.match(/<td[^>]*style="([^"]*)"/u)?.[1];
		expect(cell).toContain('padding-left:0');
		expect(cell).toContain('padding-top:9.6px');
		expect(cell).toContain('padding-right:9.6px');
	});
});
