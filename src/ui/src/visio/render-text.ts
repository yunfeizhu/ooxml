import type { VisioText } from 'ooxml-core/visio';
import { matrix, safeColor, svgElement } from './render-svg';
import type { TextLayoutBudget } from './text-layout';
import { layoutParagraphs } from './paragraph-layout';
import { runBaselineShift, runDisplaySize, runDisplayText } from './text-run-style';

/** Browser-font layout is approximate until compared with the licensed Visio reference corpus. */
export function renderText(
	text: VisioText,
	warnings: Set<string>,
	budget?: TextLayoutBudget,
): SVGGElement {
	const group = svgElement('g');
	group.setAttribute(
		'transform',
		`${matrix(text.transform)} translate(0 ${text.height}) scale(1 -1)`,
	);
	const backgrounds = svgElement('g'),
		bullets = svgElement('g');
	group.append(backgrounds);
	const node = svgElement('text');
	node.style.whiteSpace = 'pre';
	node.setAttribute('font-family', text.fontFamily);
	node.setAttribute('font-size', String(text.fontSize));
	node.setAttribute('fill', safeColor(text.color));
	let layout: ReturnType<typeof layoutParagraphs>;
	try {
		layout = layoutParagraphs(text, undefined, budget);
	} catch {
		warnings.add('Text was omitted because it exceeded the safe layout complexity limit.');
		return group;
	}
	const y =
		text.verticalAlign === 'top'
			? text.margins.top
			: text.verticalAlign === 'bottom'
				? text.height - text.margins.bottom - layout.height
				: (text.height - layout.height) / 2;
	for (const line of layout.lines) {
		if (text.backgroundColor) {
			const rectangle = svgElement('rect');
			const width =
				line.align === 'distributed' || (line.align === 'justify' && !line.last)
					? line.availableWidth
					: line.width;
			const x =
				line.align === 'center'
					? line.x - width / 2
					: line.align === 'right'
						? line.x - width
						: line.x;
			const font =
				line.runs.reduce((size, run) => Math.max(size, run.fontSize), 0) || text.fontSize;
			rectangle.setAttribute('x', String(x));
			rectangle.setAttribute('y', String(y + line.y - font * 0.8));
			rectangle.setAttribute('width', String(width));
			rectangle.setAttribute('height', String(font * 1.2));
			rectangle.setAttribute('fill', safeColor(text.backgroundColor));
			rectangle.setAttribute('fill-opacity', String(text.backgroundOpacity ?? 1));
			backgrounds.append(rectangle);
		}
		const row = svgElement('tspan');
		row.setAttribute('x', String(line.x));
		row.setAttribute('y', String(y + line.y));
		row.setAttribute('direction', line.direction);
		row.setAttribute('unicode-bidi', 'plaintext');
		const right = line.align === 'right';
		row.setAttribute(
			'text-anchor',
			line.align === 'center' ? 'middle' : right === (line.direction === 'rtl') ? 'start' : 'end',
		);
		if (line.align === 'justify' && !line.last) {
			const spaces = line.runs.reduce(
				(count, run) => count + (run.text.match(/\s/gu)?.length ?? 0),
				0,
			);
			if (spaces)
				row.setAttribute(
					'word-spacing',
					String(Math.max(0, (line.availableWidth - line.width) / spaces)),
				);
		}
		if (line.align === 'distributed') {
			row.setAttribute('textLength', String(line.availableWidth));
			row.setAttribute('lengthAdjust', 'spacing');
		}
		let shift = 0;
		for (const run of line.runs) {
			const span = svgElement('tspan');
			span.textContent = runDisplayText(run.text, run);
			span.setAttribute('font-family', run.fontFamily);
			span.setAttribute('font-size', String(runDisplaySize(run)));
			if (run.textCase === 'small-caps') span.setAttribute('font-variant', 'small-caps');
			if (run.letterSpacing) span.setAttribute('letter-spacing', String(run.letterSpacing));
			// Super/subscript: relative dy moves the baseline and the next run moves it back.
			const target = runBaselineShift(run);
			if (target !== shift) span.setAttribute('dy', String(target - shift));
			shift = target;
			span.setAttribute('fill', safeColor(run.color));
			span.setAttribute('fill-opacity', String(run.opacity ?? text.opacity ?? 1));
			if (run.bold) span.setAttribute('font-weight', 'bold');
			if (run.italic) span.setAttribute('font-style', 'italic');
			const decorations = [
				run.underline ? 'underline' : '',
				run.strikethrough ? 'line-through' : '',
			].filter(Boolean);
			if (decorations.length) span.setAttribute('text-decoration', decorations.join(' '));
			row.append(span);
		}
		node.append(row);
		if (line.bullet) {
			const bullet = svgElement('text');
			bullet.textContent = line.bullet.text;
			bullet.setAttribute('x', String(line.bullet.x));
			bullet.setAttribute('y', String(y + line.y));
			bullet.setAttribute('font-family', line.bullet.fontFamily);
			bullet.setAttribute('font-size', String(line.bullet.fontSize));
			bullet.setAttribute('fill', safeColor(text.color));
			bullet.setAttribute('fill-opacity', String(text.opacity ?? 1));
			bullets.append(bullet);
		}
	}
	warnings.add(
		'Text metrics and automatic wrapping use browser fonts; Visio line breaking and paragraph layout remain approximate.',
	);
	if (layout.height > text.height - text.margins.top - text.margins.bottom)
		warnings.add('Text exceeds its saved text-box height.');
	group.append(bullets, node);
	return group;
}
