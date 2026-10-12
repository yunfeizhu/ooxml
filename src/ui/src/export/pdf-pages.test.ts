import { describe, expect, it } from 'vitest';
import { buildImagePagesPdf } from './pdf-pages';

const jpeg = (width: number, height: number) => ({
	bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
	width,
	height,
});
const latin1 = (bytes: Uint8Array) => String.fromCharCode(...bytes);

describe('buildImagePagesPdf', () => {
	it('writes one sized page per entry with exact byte offsets', () => {
		const bytes = buildImagePagesPdf([
			{
				width: 612,
				height: 792,
				images: [{ image: jpeg(10, 20), placement: { x: 0, y: 0, width: 612, height: 792 } }],
			},
			{ width: 300, height: 200, images: [] },
		]);
		const text = latin1(bytes);
		expect(text.startsWith('%PDF-1.4\n')).toBe(true);
		expect(text).toContain('/MediaBox [0 0 612.00 792.00]');
		expect(text).toContain('/MediaBox [0 0 300.00 200.00]');
		expect(text).toContain('/Count 2');
		expect(text).toContain('q 612.00 0 0 792.00 0.00 0.00 cm /Img0 Do Q');
		const xref = Number(/startxref\n(\d+)/.exec(text)![1]);
		expect(text.slice(xref, xref + 4)).toBe('xref');
		const entries = [...text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) =>
			Number(m[1]),
		);
		for (const [index, offset] of entries.entries())
			expect(text.slice(offset).startsWith(`${index + 1} 0 obj`)).toBe(true);
	});
	it('refuses empty documents and invalid sizes', () => {
		expect(() => buildImagePagesPdf([])).toThrow();
		expect(() => buildImagePagesPdf([{ width: 0, height: 10, images: [] }])).toThrow();
	});
});
