import { describe, expect, it } from 'vitest';
import { editVsdx } from './edit';
import { parseVsdx } from './parser';
import { VisioPackage } from './package';
import { createVsdx } from './create-document';
import { snapshotFormatting } from './edit-formatting-commands';
import { VISIO_REFLECTION_PRESETS } from './edit-formatting-glow';
import { shapeEffects } from './effects';
import { copySnapshotScene } from './ui/snapshot-scene';
import { assertViewableDocument } from './ui/scene-validation';
import { visioGlowKey, visioReflectionKey, visioShapeEffectValues } from './ui/shape-effects';
import { attribute, children } from './sheet';

const target = { type: 'format-shape' as const, pageId: '0', shapeId: '1' };
async function drawing(): Promise<Uint8Array> {
	return (
		await editVsdx(await createVsdx(), [
			{ type: 'create-rectangle', pageId: '0', shapeId: '1', x: 1, y: 1, width: 2, height: 1 },
		])
	).bytes;
}
async function cells(bytes: Uint8Array): Promise<Map<string, Element>> {
	const root = await (await VisioPackage.open(bytes)).readXml('visio/pages/page1.xml');
	const node = children(children(root, 'Shapes')[0], 'Shape')[0]!;
	return new Map(children(node, 'Cell').map((item) => [attribute(item, 'N')!, item]));
}

describe('glow, soft edges and reflection edits', () => {
	it('write Visio effect cells and read them back into the scene', async () => {
		const preset = VISIO_REFLECTION_PRESETS.find((item) => item.id === 'half-4')!;
		const saved = await editVsdx(await drawing(), [
			{
				...target,
				glow: { size: 8, color: '#ED7D31', transparency: 60 },
				softEdges: 2.5,
				reflection: preset,
			},
		]);
		const written = await cells(saved.bytes);
		expect(attribute(written.get('GlowSize'), 'U')).toBe('PT');
		expect(Number(attribute(written.get('GlowSize'), 'V'))).toBeCloseTo(8 / 72);
		expect(attribute(written.get('GlowColor'), 'F')).toBe('RGB(237,125,49)');
		expect(attribute(written.get('GlowColorTrans'), 'V')).toBe('0.6');
		expect(Number(attribute(written.get('SoftEdgesSize'), 'V'))).toBeCloseTo(2.5 / 72);
		expect(attribute(written.get('ReflectionSize'), 'V')).toBe('0.55');
		expect(attribute(written.get('ReflectionTrans'), 'V')).toBe('0.5');
		expect(Number(attribute(written.get('ReflectionDist'), 'V'))).toBeCloseTo(4 / 72);
		const document = await parseVsdx(saved.bytes);
		const shape = document.pages[0]!.shapes[0]!;
		expect(shape.style.glow).toMatchObject({ color: '#ed7d31' });
		expect(shape.style.glow!.opacity).toBeCloseTo(0.4);
		expect(shape.style.glow!.size).toBeCloseTo(8 / 72);
		expect(shape.style.softEdges).toBeCloseTo(2.5 / 72);
		expect(shape.style.reflection).toMatchObject({ size: 0.55, opacity: 0.5 });
		expect(visioShapeEffectValues(shape)).toEqual({
			glow: { size: 8, color: '#ed7d31', transparency: 60 },
			softEdges: 2.5,
			reflection: { size: 55, transparency: 50, distance: 4, blur: 0.5 },
		});
		expect(visioGlowKey(shape)).toBe('8-#ed7d31');
		expect(visioReflectionKey(shape)).toBe('half-4');
		assertViewableDocument(copySnapshotScene(document));
		expect(document.diagnostics.some((item) => item.code === 'unverified-effects')).toBe(true);
		const removed = await editVsdx(saved.bytes, [
			{
				...target,
				glow: { size: 0, color: '#000000', transparency: 0 },
				softEdges: 0,
				reflection: { size: 0, transparency: 0, distance: 0, blur: 0 },
			},
		]);
		const plain = (await parseVsdx(removed.bytes)).pages[0]!.shapes[0]!;
		expect(plain.style.glow).toBeUndefined();
		expect(plain.style.softEdges).toBeUndefined();
		expect(plain.style.reflection).toBeUndefined();
		expect(visioGlowKey(plain)).toBe('none');
		expect(visioReflectionKey(plain)).toBe('none');
	});
	it('combine with a Quick Style and refuse invalid values', async () => {
		expect(
			snapshotFormatting({ ...target, quickStyle: { color: 2, matrix: 1 }, softEdges: 5 }),
		).toMatchObject({ softEdges: 5 });
		for (const bad of [
			{ glow: { size: -1, color: '#000000', transparency: 0 } },
			{ glow: { size: 5, color: 'red', transparency: 0 } },
			{ glow: { size: 5, color: '#000000', transparency: 101 } },
			{ softEdges: 101 },
			{ softEdges: Number.NaN },
			{ reflection: { size: 120, transparency: 0, distance: 0, blur: 0 } },
			{ reflection: null },
		])
			expect(() => snapshotFormatting({ ...target, ...(bad as object) })).toThrow();
	});
	it('ignore theme-selected effect cells', () => {
		const report = () => {};
		const themed = new Map([
			['GlowSize', { value: 'Themed' }],
			['SoftEdgesSize', { value: 'Themed' }],
			['ReflectionSize', { value: 'Themed' }],
		]);
		expect(shapeEffects(themed, () => '#000000', report)).toEqual({});
		const clear = new Map([
			['GlowSize', { value: '0.1' }],
			['GlowColorTrans', { value: '1' }],
		]);
		expect(shapeEffects(clear, () => '#000000', report)).toEqual({});
	});
});
