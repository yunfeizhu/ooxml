import { describe, expect, it } from 'vitest';
import { createVsdx } from './create-document';
import { editVsdx } from './edit';
import { parseVsdx } from './parser';
import { VisioPackage } from './package';
import { visioBuiltInStencil } from './stencil-windows';
import { fixture } from './test-fixtures';
import { createSampleVsdx } from './ui/sample-drawing';

const NS = 'xmlns="http://schemas.microsoft.com/office/visio/2012/main"';
const withWindows = (windows: string) =>
	fixture({
		edit: (zip) => {
			zip.file('visio/windows.xml', `<Windows ${NS}>${windows}</Windows>`);
			zip.file(
				'visio/_rels/document.xml.rels',
				'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
					'<Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/pages" Target="pages/pages.xml"/>' +
					'<Relationship Id="rId9" Type="http://schemas.microsoft.com/visio/2010/relationships/windows" Target="windows.xml"/>' +
					'</Relationships>',
			);
		},
	});

describe('stencils docked in the drawing window', () => {
	it('maps Visio stencil files to the built-in stencils', () => {
		expect(visioBuiltInStencil('BASFLO_U.vssx')).toBe('basic-flowchart');
		expect(
			visioBuiltInStencil(
				'C:\\Program Files\\Microsoft Office\\Root\\Office16\\visio content\\1033\\BASFLO_M.VSSX',
			),
		).toBe('basic-flowchart');
		expect(visioBuiltInStencil('content/basic_u.vss')).toBe('basic');
		expect(visioBuiltInStencil('ARROWS_U.vssx')).toBe('arrow-shapes');
		expect(visioBuiltInStencil('NETWRK_U.vssx')).toBeUndefined();
		expect(visioBuiltInStencil('BASFLO_U.vssx.exe')).toBeUndefined();
	});

	it('reads the stencil windows as file names, in order, without their folders', async () => {
		const model = await parseVsdx(
			await withWindows(
				'<Window ID="0" WindowType="Drawing" Document="ignored.vssx"/>' +
					'<Window ID="1" WindowType="Stencil" Document="C:\\Program Files\\visio content\\1033\\BASFLO_U.vssx"/>' +
					'<Window ID="2" WindowType="Stencil" Document="My Shapes/Favorites.vssx"/>' +
					'<Window ID="3" WindowType="Stencil" Document="D:\\other\\BASFLO_U.vssx"/>' +
					'<Window ID="4" WindowType="Stencil"/>',
			),
		);
		expect(model.stencils).toEqual(['BASFLO_U.vssx', 'Favorites.vssx']);
		expect((await parseVsdx(await fixture())).stencils).toBeUndefined();
		// A broken windows part costs the list, not the drawing.
		const broken = await parseVsdx(await withWindows('<Window'));
		expect(broken.pages).toHaveLength(1);
	});

	it('writes the stencils a new drawing docks, and keeps them through edits', async () => {
		const bytes = await createVsdx({ stencils: ['basic-flowchart', 'basic', 'basic-flowchart'] });
		const windows = await (await VisioPackage.open(bytes)).readXml('visio/windows.xml');
		const docked = Array.from(windows.getElementsByTagName('Window')).filter(
			(window) => window.getAttribute('WindowType') === 'Stencil',
		);
		expect(docked.map((window) => window.getAttribute('Document'))).toEqual([
			'BASFLO_U.vssx',
			'BASIC_U.vssx',
		]);
		expect(docked.map((window) => window.getAttribute('ID'))).toEqual(['1', '2']);
		const edited = await editVsdx(bytes, [
			{ type: 'create-rectangle', pageId: '0', shapeId: '1', x: 2, y: 2, width: 1, height: 1 },
		]);
		expect((await parseVsdx(edited.bytes)).stencils).toEqual(['BASFLO_U.vssx', 'BASIC_U.vssx']);
		expect((await parseVsdx(await createVsdx())).stencils).toBeUndefined();
		await expect(createVsdx({ stencils: ['nope' as 'basic'] })).rejects.toThrow(/stencil/);
	});

	it('docks Basic Flowchart Shapes in the sample flowchart', async () => {
		expect((await parseVsdx(await createSampleVsdx())).stencils).toEqual(['BASFLO_U.vssx']);
	});
});
