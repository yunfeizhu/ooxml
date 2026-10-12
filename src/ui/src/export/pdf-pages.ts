/**
 * A minimal PDF 1.4 writer for raster pages: each page has its own size in points and shows
 * JPEG images at top-down placements. DOM-free; callers rasterize and own the Blob. This is the
 * same object layout as PowerPoint's slide PDF export (`pptx/export/pdf-slides.ts`), with byte
 * offsets counted in bytes (strings are written as Latin-1) and a page size per page.
 */

/** JPEG bytes and pixel size of one image. */
export interface PdfJpegImage {
	bytes: Uint8Array;
	width: number;
	height: number;
}
export interface PdfImagePage {
	/** Page size in points (1/72 in). */
	width: number;
	height: number;
	/** Images with top-down placements in points; drawn in order. */
	images: readonly {
		image: PdfJpegImage;
		placement: { x: number; y: number; width: number; height: number };
	}[];
}

const latin1 = (text: string): Uint8Array => {
	const bytes = new Uint8Array(text.length);
	for (let index = 0; index < text.length; index++) bytes[index] = text.charCodeAt(index) & 0xff;
	return bytes;
};
const number = (value: number) => (Number.isFinite(value) ? value.toFixed(2) : '0.00');

/** Assemble the PDF bytes. Pages and images are validated for finite, positive sizes. */
export function buildImagePagesPdf(pages: readonly PdfImagePage[]): Uint8Array<ArrayBuffer> {
	if (!pages.length) throw new Error('A PDF needs at least one page.');
	const chunks: Uint8Array[] = [];
	const offsets: number[] = [];
	let position = 0;
	const emit = (chunk: string | Uint8Array) => {
		const bytes = typeof chunk === 'string' ? latin1(chunk) : chunk;
		chunks.push(bytes);
		position += bytes.length;
	};
	const object = (id: number, body: string) => {
		offsets[id] = position;
		emit(`${id} 0 obj\n${body}\nendobj\n`);
	};
	emit('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
	let next = 3;
	const kids: number[] = [];
	for (const page of pages) {
		if (!(page.width > 0 && page.height > 0) || !Number.isFinite(page.width + page.height))
			throw new Error('PDF page sizes must be positive and finite.');
		const imageIds = page.images.map(() => next++);
		const pageId = next++;
		const contentId = next++;
		kids.push(pageId);
		page.images.forEach(({ image }, index) => {
			if (!(image.width > 0 && image.height > 0))
				throw new Error('PDF images need a positive pixel size.');
			const id = imageIds[index]!;
			offsets[id] = position;
			emit(
				`${id} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${Math.round(image.width)} /Height ${Math.round(image.height)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`,
			);
			emit(image.bytes);
			emit('\nendstream\nendobj\n');
		});
		const resources = imageIds.map((id, index) => `/Img${index} ${id} 0 R`).join(' ');
		object(
			pageId,
			`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${number(page.width)} ${number(page.height)}] /Contents ${contentId} 0 R /Resources << /XObject << ${resources} >> >> >>`,
		);
		const content = page.images
			.map(({ placement }, index) => {
				const bottom = page.height - placement.y - placement.height;
				return `q ${number(placement.width)} 0 0 ${number(placement.height)} ${number(placement.x)} ${number(bottom)} cm /Img${index} Do Q`;
			})
			.join('\n');
		object(contentId, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
	}
	object(1, '<< /Type /Catalog /Pages 2 0 R >>');
	object(
		2,
		`<< /Type /Pages /Kids [${kids.map((id) => `${id} 0 R`).join(' ')}] /Count ${kids.length} >>`,
	);
	const xref = position;
	const count = next;
	let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
	for (let id = 1; id < count; id++)
		table += `${String(offsets[id] ?? 0).padStart(10, '0')} 00000 n \n`;
	emit(`${table}trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
	const result = new Uint8Array(new ArrayBuffer(position));
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}
	return result;
}
