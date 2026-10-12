import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { editVsdx } from './edit';
import { parseVsdx } from './parser';
import { createVsdx } from './create-document';
import { VISIO_GLUE, VISIO_SNAP, VISIO_SNAP_GLUE_DEFAULTS, visioSnapGlue } from './snap-glue';
import { snapshotEdits } from './ui/edit-commands';
import type { VisioEdit } from './edit-commands';

const documentXml = async (bytes: Uint8Array) =>
	(await JSZip.loadAsync(bytes)).file('visio/document.xml')!.async('string');
const edit = (fields: Record<string, unknown>) =>
	({ type: 'set-snap-glue', ...fields }) as VisioEdit;

describe('Snap & Glue document settings', () => {
	it('reads Visio defaults for a drawing that stores none', async () => {
		const document = await parseVsdx(await createVsdx());
		expect(document.snapGlue).toBeUndefined();
		expect(visioSnapGlue(document)).toEqual(VISIO_SNAP_GLUE_DEFAULTS);
		expect(visioSnapGlue(document)).toEqual({
			snapSettings: 65847,
			glueSettings: VISIO_GLUE.guides | VISIO_GLUE.connectionPoints,
			dynamicGrid: true,
		});
	});

	it('writes the settings as DocumentSettings children in Visio order and reads them back', async () => {
		const snapSettings =
			VISIO_SNAP.rulerSubdivisions | VISIO_SNAP.guides | VISIO_SNAP.connectionPoints;
		const glueSettings = VISIO_GLUE.guides | VISIO_GLUE.connectionPoints | VISIO_GLUE.geometry;
		const saved = await editVsdx(await createVsdx(), [
			edit({ snapSettings, glueSettings, dynamicGrid: false }),
		]);
		expect(saved.changedParts).toEqual(['visio/document.xml']);
		// The form recorded from Visio 16 for the same values.
		expect(await documentXml(saved.bytes)).toContain(
			'<GlueSettings>41</GlueSettings><SnapSettings>37</SnapSettings><DynamicGridEnabled>0</DynamicGridEnabled>',
		);
		const document = await parseVsdx(saved.bytes);
		expect(document.snapGlue).toEqual({ snapSettings, glueSettings, dynamicGrid: false });
		// A later change touches only its own element.
		const off = await editVsdx(saved.bytes, [
			edit({ snapSettings: snapSettings | VISIO_SNAP.disabled }),
		]);
		const xml = await documentXml(off.bytes);
		expect(xml).toContain(`<SnapSettings>${37 + 32768}</SnapSettings>`);
		expect(xml).toContain('<GlueSettings>41</GlueSettings>');
	});

	it('changes nothing for the current or default values', async () => {
		const bytes = await createVsdx();
		expect(
			(await editVsdx(bytes, [edit({ glueSettings: 9, dynamicGrid: true })])).changedParts,
		).toEqual([]);
		const saved = await editVsdx(bytes, [edit({ glueSettings: 8 })]);
		expect((await editVsdx(saved.bytes, [edit({ glueSettings: 8 })])).changedParts).toEqual([]);
	});

	it('keeps bits it does not know', async () => {
		const zip = await JSZip.loadAsync(await createVsdx());
		const xml = await zip.file('visio/document.xml')!.async('string');
		expect(xml).toContain('<DocumentSettings');
		zip.file(
			'visio/document.xml',
			xml.replace(
				/(<DocumentSettings[^>]*?)\/>/,
				'$1><SnapSettings>131073</SnapSettings></DocumentSettings>',
			),
		);
		const bytes = await zip.generateAsync({ type: 'uint8array' });
		expect((await parseVsdx(bytes)).snapGlue).toEqual({ snapSettings: 1 });
		const saved = await editVsdx(bytes, [edit({ snapSettings: VISIO_SNAP.grid })]);
		expect(await documentXml(saved.bytes)).toContain(`<SnapSettings>${131072 + 2}</SnapSettings>`);
	});

	it('rejects unknown bits and empty commands, and rides with other page-level edits', async () => {
		for (const bad of [
			edit({}),
			edit({ snapSettings: 64 }),
			edit({ glueSettings: 16 }),
			edit({ dynamicGrid: 1 }),
		])
			expect(() => snapshotEdits([bad])).toThrow();
		const saved = await editVsdx(await createVsdx(), [
			edit({ glueSettings: 8 }),
			{ type: 'set-page-layout', pageId: '0', lineJumpCode: 0 },
		]);
		expect([...saved.changedParts].sort()).toEqual(['visio/document.xml', 'visio/pages/pages.xml']);
	});
});
