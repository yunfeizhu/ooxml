import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { parseXml } from '../xml/index';
import { editVsdx } from './edit';
import { parseVsdx } from './parser';

/**
 * Optional: point VISIO_NATIVE_TEXT_EXTENT at the directory written by
 * `scripts/record-visio-text-extent.ps1`. Its flow.vsdx holds a flowchart Process shape that
 * Visio grew to fit a long label; shrinking it and typing the label again must give back every
 * cached value Visio wrote. The drawing embeds a Microsoft master and stays out of git.
 */
const directory = process.env.VISIO_NATIVE_TEXT_EXTENT;
const file = directory ? join(directory, 'flow.vsdx') : undefined;

async function cells(bytes: Uint8Array): Promise<{ id: string; values: Map<string, string> }> {
	const zip = await JSZip.loadAsync(bytes);
	const doc = parseXml(await zip.file('visio/pages/page1.xml')!.async('string'));
	const shape = Array.from(doc.getElementsByTagName('Shape')).find((node) =>
		node.hasAttribute('Master'),
	)!;
	const values = new Map<string, string>();
	for (const cell of Array.from(shape.getElementsByTagName('Cell'))) {
		const path: string[] = [];
		for (let node: Element | null = cell; node && node !== shape; node = node.parentNode as Element)
			path.unshift(
				`${node.localName}:${node.getAttribute('N') ?? ''}:${node.getAttribute('IX') ?? ''}`,
			);
		values.set(path.join('/'), `${cell.getAttribute('V')}|${cell.getAttribute('F') ?? ''}`);
	}
	return { id: shape.getAttribute('ID')!, values };
}

describe.skipIf(!file || !existsSync(file))('Resize with Text against Visio', () => {
	it('writes the caches Visio wrote for a label that grows a Process shape', async () => {
		const source = new Uint8Array(readFileSync(file!));
		const original = await cells(source);
		const model = (await parseVsdx(source)).pages[0]!.shapes.find(
			(shape) => shape.id === original.id,
		)!;
		const label = model.text.plainText;
		expect(model.height).toBe(1);
		const replace = (text: string) =>
			({ type: 'replace-plain-text', pageId: '0', shapeId: original.id, text }) as const;
		const short = await editVsdx(source, [replace('Process')]);
		expect(short.diagnostics.map((item) => item.code)).toContain('edit-text-size');
		expect((await parseVsdx(short.bytes)).pages[0]!.shapes[0]!.height).toBe(0.75);
		const again = await cells((await editVsdx(short.bytes, [replace(label)])).bytes);
		const number = (entry: string | undefined) => Number(entry?.split('|')[0]);
		const different: string[] = [];
		for (const [path, entry] of original.values) {
			const ours = again.values.get(path);
			const same =
				ours === entry ||
				(Number.isFinite(number(entry)) && Math.abs(number(ours) - number(entry)) < 1e-9);
			if (!same) different.push(`${path}: ${ours} instead of ${entry}`);
		}
		expect(different).toEqual([]);
		expect([...again.values.keys()].filter((path) => !original.values.has(path))).toEqual([]);
	});
});
