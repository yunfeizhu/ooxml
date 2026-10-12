import { expect, it } from 'vitest';
import type { VisioText, VisioTextRun } from 'ooxml-core/visio';
import { renderText } from './render-text';
import { runDisplayText } from './text-run-style';

const run = (text: string, extra: Partial<VisioTextRun> = {}): VisioTextRun => ({
	text,
	fontFamily: 'Arial',
	fontSize: 0.15,
	color: '#000000',
	bold: false,
	italic: false,
	underline: false,
	...extra,
});
const text = (runs: VisioTextRun[]): VisioText => ({
	plainText: runs.map((item) => item.text).join(''),
	runs,
	fontFamily: 'Arial',
	fontSize: 0.15,
	color: '#000000',
	horizontalAlign: 'left',
	verticalAlign: 'top',
	transform: [1, 0, 0, 1, 0, 0],
	width: 4,
	height: 1,
	margins: { left: 0, right: 0, top: 0, bottom: 0 },
});

it('draws case, letter spacing and super/subscript runs and restores the baseline', () => {
	const group = renderText(
		text([
			run('E=mc'),
			run('2', { position: 'superscript' }),
			run(' word', { textCase: 'all-caps', letterSpacing: 0.02 }),
			run('x', { textCase: 'small-caps' }),
		]),
		new Set(),
	);
	const spans = [...group.querySelectorAll('tspan tspan')];
	expect(spans.map((span) => span.textContent)).toEqual(['E=mc', '2', ' WORD', 'x']);
	expect(Number(spans[1]!.getAttribute('font-size'))).toBeCloseTo(0.1);
	expect(Number(spans[1]!.getAttribute('dy'))).toBeCloseTo(-0.05);
	expect(Number(spans[2]!.getAttribute('dy'))).toBeCloseTo(0.05);
	expect(spans[2]!.getAttribute('letter-spacing')).toBe('0.02');
	expect(spans[3]!.getAttribute('font-variant')).toBe('small-caps');
	expect(runDisplayText("it's a test", { textCase: 'initial-caps' })).toBe("It's A Test");
});
