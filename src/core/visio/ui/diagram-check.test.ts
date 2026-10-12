import { describe, expect, it } from 'vitest';
import type { VisioDocument, VisioPage, VisioShape } from '../model';
import { checkVisioDiagram } from './diagram-check';
import { visioShapeReport, visioShapeReportCsv, visioShapeReportText } from './shape-report';

const shape = (
	id: string,
	x: number,
	y: number,
	extra: Partial<VisioShape> = {},
	width = 1,
	height = 1,
): VisioShape =>
	({
		id,
		name: `Process ${id}`,
		kind: 'shape',
		width,
		height,
		transform: [1, 0, 0, 1, x, y],
		geometry: [{ path: 'M0 0', fill: true, stroke: true }],
		style: {},
		text: { plainText: 'Step' },
		hidden: false,
		children: [],
		...extra,
	}) as VisioShape;
const page = (shapes: VisioShape[], connectors: VisioPage['connectors'] = []): VisioPage => ({
	id: '0',
	name: 'Page-1',
	width: 8.5,
	height: 11,
	isBackground: false,
	shapes,
	connectors,
});
const doc = (...pages: VisioPage[]): VisioDocument => ({ format: 'vsdx', pages, diagnostics: [] });
const connect = (from: string, cell: string, to: string) => ({
	fromShapeId: from,
	toShapeId: to,
	fromCell: cell,
	toCell: 'PinX',
});

describe('Check Diagram', () => {
	const line = (id: string, name = 'Dynamic connector') =>
		shape(id, 2, 2, { kind: 'connector', name, text: { plainText: '' } as VisioShape['text'] });
	const drawing = doc(
		page(
			[
				shape('1', 1, 1),
				shape('2', 4, 1),
				line('3'),
				line('4'),
				line('5'),
				line('6', 'Line'),
				shape('7', 20, 20),
				shape('8', 4, 1),
				shape('9', 6, 6, {
					text: { plainText: ' ' } as VisioShape['text'],
					geometry: [{ path: 'M0 0', fill: false, stroke: false }],
				}),
				line('10'),
			],
			[
				connect('4', 'BeginX', '1'),
				connect('5', 'BeginX', '1'),
				connect('5', 'EndX', '1'),
				connect('10', 'BeginX', '1'),
				connect('10', 'EndX', '2'),
			],
		),
	);
	it('reports each generic rule once, with stable IDs, and nothing for sound shapes', () => {
		const issues = checkVisioDiagram(drawing);
		expect(issues.map((issue) => [issue.ruleId, issue.shapeId])).toEqual([
			['connector-unglued', '3'],
			['connector-partially-glued', '4'],
			['connector-same-shape', '5'],
			['shape-off-page', '7'],
			['shape-stacked', '8'],
			['shape-empty', '9'],
		]);
		expect(issues[2]!).toMatchObject({
			id: 'connector-same-shape:0:5',
			ruleSet: 'connectivity',
			message: 'Dynamic connector is glued to Process 1 at both ends.',
		});
		expect(issues[4]!.message).toBe(
			'Process 8 sits exactly on top of Process 2 (same position and size).',
		);
	});
	it('runs only the enabled rule sets, skips background pages and honours the issue limit', () => {
		expect(
			checkVisioDiagram(drawing, { ruleSets: ['placement'] }).map((issue) => issue.ruleId),
		).toEqual(['shape-off-page', 'shape-stacked']);
		expect(checkVisioDiagram(drawing, { maxIssues: 2 })).toHaveLength(2);
		expect(checkVisioDiagram(doc({ ...drawing.pages[0]!, isBackground: true }))).toEqual([]);
	});
});

describe('Shape Reports', () => {
	const drawing = doc(
		page([
			shape('1', 1, 2, {
				masterId: '4',
				rotation: { pinX: 1.5, pinY: 2.5, angle: 0 },
				shapeData: [
					{
						id: 'Row_1',
						name: 'Cost',
						label: 'Cost',
						type: 2,
						valueKind: 'number',
						rawValue: '12.5',
						value: 12.5,
					},
					{
						id: 'Row_2',
						name: 'Hidden',
						type: 0,
						valueKind: 'string',
						value: 'x',
						invisible: true,
					},
				],
				text: { plainText: '=SUM(A1), "quoted"' } as VisioShape['text'],
			}),
			shape('2', -3, 0, {
				kind: 'group',
				children: [shape('3', 0, 0, { text: { plainText: 'Inner' } as VisioShape['text'] })],
			}),
		]),
		{ ...page([shape('5', 0, 0)]), id: '1', name: 'Page-2' },
	);
	it('lists every shape with its page, type, master, size, pin, text and shape data', () => {
		const report = visioShapeReport(drawing, { pageIndex: 0 });
		expect(report.columns.slice(-2)).toEqual(['Text', 'Cost']);
		expect(report.rows.map((row) => [row.id, row.type, row.master, row.x, row.y])).toEqual([
			['1', 'Shape', '4', 1.5, 2.5],
			['2', 'Group', '', -2.5, 0.5],
			['3', 'Shape', '', 0.5, 0.5],
		]);
		expect(report.rows[0]!.data).toEqual({ Cost: '12.5' });
		expect(visioShapeReport(drawing).rows).toHaveLength(4);
		expect(visioShapeReport(drawing, { maxRows: 2 })).toMatchObject({ truncated: true });
	});
	it('exports CSV that spreadsheets cannot evaluate and tab-separated text', () => {
		const report = visioShapeReport(drawing, { pageIndex: 0 });
		const csv = visioShapeReportCsv(report).split('\r\n');
		expect(csv[0]).toBe(
			'Page,ID,Name,Type,Master,Width (in),Height (in),Pin X (in),Pin Y (in),Text,Cost',
		);
		expect(csv[1]).toBe(`Page-1,1,Process 1,Shape,4,1,1,1.5,2.5,"'=SUM(A1), ""quoted""",12.5`);
		expect(csv[2]).toContain(',-2.5,0.5,');
		expect(visioShapeReportText(report).split('\n')[3]).toBe(
			'Page-1\t3\tProcess 3\tShape\t\t1\t1\t0.5\t0.5\tInner\t',
		);
	});
});
