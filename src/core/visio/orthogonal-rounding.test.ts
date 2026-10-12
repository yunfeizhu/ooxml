import { describe, expect, it } from 'vitest';
import { parseXml } from '../xml/index';
import { geometryPaths } from './geometry';
import { readSheet } from './sheet';
import { parseVsdx } from './index';
import { roundedOrthogonalPath, type RectanglePoint as Point } from './rounded-geometry';
import { cell, fixture, row, section, shape, xml } from './test-fixtures';
const rows = (points: readonly Point[], relative = false) =>
	points
		.map((p, i) =>
			row(
				i + 1,
				(relative ? 'Rel' : '') + (i ? 'LineTo' : 'MoveTo'),
				cell('X', p[0]) + cell('Y', p[1]),
			),
		)
		.join('');
const source = (points: readonly Point[], relative = false) =>
	section('Geometry', cell('NoFill', 1) + rows(points, relative));
function parse(contents: string, radius = 0.25) {
	const warnings: string[] = [];
	let commands = 0;
	const paths = geometryPaths(
		readSheet(parseXml(xml('Shape', cell('Rounding', radius) + contents)).documentElement),
		4,
		2,
		(code) => warnings.push(code),
		() => {
			commands++;
		},
	);
	return { paths, warnings, commands };
}
const chain: Point[] = [
	[0, 0],
	[2, 0],
	[2, 1],
	[4, 1],
];
describe('bounded open orthogonal rounding', () => {
	it('preserves endpoints and alternating circular sweeps', () => {
		const result = parse(source(chain));
		expect(result.paths[0]!.path).toBe(
			'M 0 0 L 1.75 0 A 0.25 0.25 0 0 1 2 0.25 L 2 0.75 A 0.25 0.25 0 0 0 2.25 1 L 4 1',
		);
		expect(result.commands).toBe(6);
		expect(result.warnings).toEqual([]);
	});
	it('handles relative coordinates and forward collinear vertices without merging them', () => {
		const result = parse(
			source(
				[
					[0, 0],
					[0.25, 0],
					[0.5, 0],
					[0.5, 0.5],
					[1, 0.5],
				],
				true,
			),
		);
		expect(result.paths[0]!.path).toContain('M 0 0 L 1 0 L 1.75 0 A 0.25 0.25');
		expect(result.paths[0]!.path.endsWith('L 4 1')).toBe(true);
	});
	it('accepts exactly touching arc tangents without extending endpoints', () => {
		expect(
			parse(
				source([
					[0, 0],
					[0.25, 0],
					[0.25, 0.5],
					[0.5, 0.5],
				]),
			).warnings,
		).toEqual([]);
	});
	it.each([
		[
			[0, 0],
			[2, 0],
			[2, 0],
			[2, 1],
		],
		[
			[0, 0],
			[2, 0],
			[1, 0],
			[1, 1],
		],
		[
			[0, 0],
			[2, 1e-10],
			[2, 1],
		],
		[
			[0, 0],
			[2, 0],
			[4, 0],
		],
	] as Point[][])(
		'leaves duplicates, reversals, diagonals and straight paths diagnosed: %j',
		(...points) => {
			const content = source(points as Point[]);
			expect(parse(content).paths).toEqual(parse(content, 0).paths);
			expect(parse(content).warnings).toContain('unsupported-corner-rounding');
		},
	);
	it('preserves curved and multi-subpath sections independently', () => {
		const curve = section(
			'Geometry',
			rows(chain.slice(0, 2)) + row(3, 'ArcTo', cell('X', 2) + cell('Y', 1) + cell('A', 0.2)),
			1,
		);
		const multi = section(
			'Geometry',
			rows(chain) + row(5, 'MoveTo', cell('X', 8) + cell('Y', 2)),
			2,
		);
		const result = parse(source(chain) + curve + multi);
		expect(result.paths[0]!.path).toContain(' A ');
		expect(result.paths.slice(1)).toEqual(parse(curve + multi, 0).paths);
		expect(result.warnings).toHaveLength(2);
	});
	it('does not round defaulted, nonfinite, subprecision or overflowing coordinates', () => {
		const missing = source(chain).replace('<Cell N="X" V="0"/>', '');
		expect(parse(missing).paths).toEqual(parse(missing, 0).paths);
		expect(parse(missing).warnings).toContain('unsupported-corner-rounding');
		const invalid = source(chain).replace('N="X" V="0"', 'N="X" V="NaN"');
		expect(parse(invalid).paths).toEqual(parse(invalid, 0).paths);
		for (const points of [
			[
				[0, 0],
				[Infinity, 0],
				[Infinity, 1],
			],
			[
				[-1e308, 0],
				[1e308, 0],
				[1e308, 1],
			],
			[
				[1e20, 0],
				[2e20, 0],
				[2e20, 1e20],
			],
		] as Point[][])
			expect(roundedOrthogonalPath(points, 0.25, (x, y) => `${x} ${y}`)).toBeUndefined();
		expect(parse(source(chain), 1e-12).warnings).toContain('unsupported-corner-rounding');
	});
	it('preserves analytic tangent/radius/sweep invariants under reflection, reversal and translation', () => {
		for (let seed = 1; seed <= 64; seed++) {
			const radius = seed / 128,
				sx = seed % 2 ? -1 : 1,
				sy = seed % 3 ? 1 : -1;
			let points: Point[] = [
				[0, 0],
				[2, 0],
				[2, 2],
				[4, 2],
				[4, 4],
			];
			points = points.map(([x, y]) => [x * sx + seed, y * sy - seed]);
			if (seed % 5) points.reverse();
			const result = roundedOrthogonalPath(points, radius, (x, y) => `${x} ${y}`)!;
			const commands = result.path.match(/[MLA] [^MLA]+/g)!;
			expect(commands[0]!.trim()).toBe(`M ${points[0]!.join(' ')}`);
			expect(commands.at(-1)!.trim()).toBe(`L ${points.at(-1)!.join(' ')}`);
			for (let i = 1; i < points.length - 1; i++) {
				const prev = points[i - 1]!,
					vertex = points[i]!,
					next = points[i + 1]!;
				const entry = commands[2 * i - 1]!.trim().split(' ').slice(1).map(Number);
				const arc = commands[2 * i]!.trim().split(' ').slice(1).map(Number);
				const exit = arc.slice(5);
				expect(arc.slice(0, 4)).toEqual([radius, radius, 0, 0]);
				expect(Math.hypot(entry[0]! - vertex[0], entry[1]! - vertex[1])).toBeCloseTo(radius, 12);
				expect(Math.hypot(exit[0]! - vertex[0], exit[1]! - vertex[1])).toBeCloseTo(radius, 12);
				const cross =
					(vertex[0] - prev[0]) * (next[1] - vertex[1]) -
					(vertex[1] - prev[1]) * (next[0] - vertex[0]);
				expect(arc[4]).toBe(cross > 0 ? 1 : 0);
				const center = [entry[0]! + exit[0]! - vertex[0], entry[1]! + exit[1]! - vertex[1]];
				expect(
					(entry[0]! - center[0]!) * (vertex[0] - prev[0]) +
						(entry[1]! - center[1]!) * (vertex[1] - prev[1]),
				).toBeCloseTo(0, 12);
				expect(
					(exit[0]! - center[0]!) * (next[0] - vertex[0]) +
						(exit[1]! - center[1]!) * (next[1] - vertex[1]),
				).toBeCloseTo(0, 12);
			}
		}
	});
	it('accounts for a long alternating chain without a fixed corner cap', () => {
		const points: Point[] = [[0, 0]];
		for (let i = 1; i <= 512; i++) points.push([Math.ceil(i / 2), Math.floor(i / 2)]);
		const result = parse(source(points));
		expect(result.paths[0]!.path.match(/ A /g)).toHaveLength(511);
		expect(result.commands).toBe(1024);
		expect(result.warnings).toEqual([]);
	});
	it('charges every extra arc and preserves transforms and endpoint cells', async () => {
		const cells =
			cell('Width', 4) +
			cell('Height', 1) +
			cell('PinX', 5) +
			cell('PinY', 7) +
			cell('Angle', 0.7) +
			cell('FlipX', 1) +
			cell('BeginX', 5) +
			cell('EndX', 9);
		const bytes = await fixture({
			pages: [
				{
					id: '0',
					contents: `<Shapes>${shape('1', cells + cell('Rounding', 0.25) + source(chain))}</Shapes>`,
				},
			],
		});
		await expect(parseVsdx(bytes, { maxGeometryCommands: 5 })).rejects.toMatchObject({
			code: 'GEOMETRY_LIMIT',
		});
		const model = await parseVsdx(bytes, { maxGeometryCommands: 6 });
		const original = await parseVsdx(
			await fixture({
				pages: [{ id: '0', contents: `<Shapes>${shape('1', cells + source(chain))}</Shapes>` }],
			}),
		);
		const { geometry: _g, ...rounded } = model.pages[0]!.shapes[0]!;
		const { geometry: _h, ...unrounded } = original.pages[0]!.shapes[0]!;
		// Besides the geometry, only the saved radius (shown in Format Shape) tells them apart.
		expect(rounded.style.rounding).toBeGreaterThan(0);
		expect({ ...rounded, style: { ...rounded.style, rounding: undefined } }).toEqual(unrounded);
	});
});
