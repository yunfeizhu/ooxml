/**
 * #39: an empty table cell is saved with the size it is drawn at, so it
 * reopens at that size instead of the deck's default and its row keeps its
 * height.
 */
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { PresentationBuilder } from '../../builders/sdk/PresentationBuilder';
import { PptxHandler } from '../../PptxHandler';
import type { PptxData, PptxTableCell, TablePptxElement } from '../../types';

function findTable(data: PptxData): TablePptxElement {
	const table = data.slides[0]!.elements.find((element) => element.type === 'table');
	if (!table || table.type !== 'table') {
		throw new Error('table not found');
	}
	return table;
}

async function seedDeck(): Promise<ArrayBuffer> {
	const { handler, data, createSlide } = await PresentationBuilder.create({ initialSlideCount: 0 });
	data.slides.push(
		createSlide('Blank')
			.addTable({ rows: [{ cells: [{ text: 'A' }, { text: 'B' }] }] })
			.build(),
	);
	const bytes = await handler.save(data.slides);
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const cell = (text: string): PptxTableCell => ({
	text,
	...(text ? { textRuns: [{ text, style: { fontSize: 7 } }] } : {}),
	style: { fontSize: 7 },
});

describe('empty table cell size on save (#39)', () => {
	it('writes the cell size into an empty cell and reads it back', async () => {
		const handler = new PptxHandler();
		const data = await handler.load(await seedDeck());
		findTable(data).tableData!.rows = [
			{ height: 17, cells: [cell('Plant'), cell('45')] },
			{ height: 17, cells: [cell(''), cell('150')] },
			{ height: 17, cells: [cell('Office'), cell('105')] },
		];

		const saved = await handler.save(data.slides);
		const slideXml = await (
			await JSZip.loadAsync(saved)
		)
			.file('ppt/slides/slide1.xml')!
			.async('string');
		const emptyParagraph = /<a:tc>\s*<a:txBody>[\s\S]*?<a:p>(?:(?!<a:r>)[\s\S])*?<\/a:p>/u.exec(
			slideXml,
		);
		expect(emptyParagraph?.[0]).toMatch(/<a:endParaRPr[^>]*\bsz="700"/u);

		const reopened = await new PptxHandler().load(
			saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength) as ArrayBuffer,
		);
		// The reader takes an empty cell's size from `a:endParaRPr@sz`; without
		// it the line falls back to the deck's default size.
		expect(findTable(reopened).tableData!.rows[1]!.cells[0]!.style?.fontSize).toBe(7);
	});
});
