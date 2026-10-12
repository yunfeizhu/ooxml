import { combo, command, group, menu, stack, type CommandSpec } from './ribbon-parts';
import { colorGrid } from './ribbon-color-menu';

const caseItems: CommandSpec[] = (
	[
		['sentence', 'Sentence case.'],
		['lower', 'lowercase'],
		['upper', 'UPPERCASE'],
		['capitalize', 'Capitalize Each Word'],
		['toggle', 'tOGGLE cASE'],
	] as const
).map(([mode, label]) => ({ id: `case-${mode}`, label, action: { type: 'change-case', mode } }));
const small = (spec: CommandSpec): CommandSpec => ({ size: 'small', ...spec });
const icon = (spec: CommandSpec): CommandSpec => ({ size: 'icon', ...spec });

/** Home > Font Color: the button applies the last colour, the caret opens Office's picker. */
function fontColorMenu(doc: Document) {
	const el = menu(doc, {
		id: 'font-color',
		label: 'Font Color',
		icon: 'fontColor',
		size: 'icon',
		split: true,
		action: { type: 'font-color' },
		items: [],
	});
	el.append(colorGrid(doc, 'font'));
	return el;
}

/** Visio's Home > Clipboard, Font and Paragraph groups, in Visio's layout. */
export function textGroups(doc: Document): [HTMLElement, HTMLElement, HTMLElement] {
	const clipboard = group(doc, 'Clipboard', [
		menu(doc, {
			id: 'paste',
			label: 'Paste',
			icon: 'paste',
			split: true,
			action: { type: 'clipboard', operation: 'paste' },
			keys: ['Control+V', 'Ctrl+V'],
			items: [
				{ id: 'paste-item', label: 'Paste', action: { type: 'clipboard', operation: 'paste' } },
				{ id: 'paste-special', label: 'Paste Special...', action: { type: 'paste-special' } },
				{
					id: 'duplicate',
					label: 'Duplicate',
					icon: 'copy',
					action: { type: 'duplicate' },
					keys: ['Control+D', 'Ctrl+D'],
				},
			],
		}),
		stack(doc, [
			command(
				doc,
				small({
					id: 'cut',
					label: 'Cut',
					icon: 'cut',
					action: { type: 'clipboard', operation: 'cut' },
					keys: ['Control+X', 'Ctrl+X'],
				}),
			),
			command(
				doc,
				small({
					id: 'copy',
					label: 'Copy',
					icon: 'copy',
					action: { type: 'clipboard', operation: 'copy' },
					keys: ['Control+C', 'Ctrl+C'],
				}),
			),
			command(
				doc,
				small({
					id: 'format-painter',
					label: 'Format Painter',
					icon: 'formatPainter',
					pressed: false,
					action: { type: 'format-painter', mode: 'once' },
				}),
			),
		]),
	]);
	const font = group(
		doc,
		'Font',
		[
			stack(doc, [
				stack(
					doc,
					[
						combo(doc, {
							id: 'font',
							label: 'Font',
							placeholder: 'Calibri',
							width: 128,
							action: (value) => ({ type: 'font-family', value }),
						}),
						combo(doc, {
							id: 'font-size',
							label: 'Font Size',
							placeholder: '12pt.',
							width: 64,
							action: (value) => ({ type: 'font-size', value: Number(value) }),
						}),
						command(
							doc,
							icon({
								id: 'grow-font',
								label: 'Increase Font Size',
								icon: 'growFont',
								action: { type: 'font-step', direction: 1 },
							}),
						),
						command(
							doc,
							icon({
								id: 'shrink-font',
								label: 'Decrease Font Size',
								icon: 'shrinkFont',
								action: { type: 'font-step', direction: -1 },
							}),
						),
					],
					true,
				),
				stack(
					doc,
					[
						command(
							doc,
							icon({
								id: 'bold',
								label: 'Bold',
								icon: 'bold',
								pressed: false,
								action: { type: 'text-toggle', property: 'bold' },
							}),
						),
						command(
							doc,
							icon({
								id: 'italic',
								label: 'Italic',
								icon: 'italic',
								pressed: false,
								action: { type: 'text-toggle', property: 'italic' },
							}),
						),
						command(
							doc,
							icon({
								id: 'underline',
								label: 'Underline',
								icon: 'underline',
								pressed: false,
								action: { type: 'text-toggle', property: 'underline' },
							}),
						),
						command(
							doc,
							icon({
								id: 'strikethrough',
								label: 'Strikethrough',
								icon: 'strikethrough',
								pressed: false,
								action: { type: 'text-toggle', property: 'strikethrough' },
							}),
						),
						menu(doc, {
							id: 'change-case',
							label: 'Change Case',
							icon: 'changeCase',
							size: 'icon',
							items: caseItems,
						}),
						fontColorMenu(doc),
					],
					true,
				),
			]),
		],
		{ dialog: 'Font options (Text dialog)' },
	);
	const paragraph = group(
		doc,
		'Paragraph',
		[
			stack(doc, [
				stack(
					doc,
					[
						command(
							doc,
							icon({
								id: 'align-top',
								label: 'Align Top',
								icon: 'alignTop',
								pressed: false,
								action: { type: 'text-align', axis: 'vertical', value: 'top' },
							}),
						),
						command(
							doc,
							icon({
								id: 'align-middle',
								label: 'Align Middle',
								icon: 'alignMiddle',
								pressed: false,
								action: { type: 'text-align', axis: 'vertical', value: 'middle' },
							}),
						),
						command(
							doc,
							icon({
								id: 'align-bottom',
								label: 'Align Bottom',
								icon: 'alignBottom',
								pressed: false,
								action: { type: 'text-align', axis: 'vertical', value: 'bottom' },
							}),
						),
						command(
							doc,
							icon({
								id: 'bullets',
								label: 'Bullets',
								icon: 'bullets',
								pressed: false,
								action: { type: 'text-bullets' },
							}),
						),
						command(
							doc,
							icon({
								id: 'rotate-text',
								label: 'Rotate Text',
								icon: 'visioRotateText',
								action: { type: 'text-rotate' },
							}),
						),
					],
					true,
				),
				stack(
					doc,
					[
						command(
							doc,
							icon({
								id: 'align-left',
								label: 'Align Left',
								icon: 'alignLeft',
								pressed: false,
								action: { type: 'text-align', axis: 'horizontal', value: 'left' },
							}),
						),
						command(
							doc,
							icon({
								id: 'align-center',
								label: 'Center',
								icon: 'alignCenter',
								pressed: false,
								action: { type: 'text-align', axis: 'horizontal', value: 'center' },
							}),
						),
						command(
							doc,
							icon({
								id: 'align-right',
								label: 'Align Right',
								icon: 'alignRight',
								pressed: false,
								action: { type: 'text-align', axis: 'horizontal', value: 'right' },
							}),
						),
						command(
							doc,
							icon({
								id: 'justify',
								label: 'Justify',
								icon: 'justify',
								pressed: false,
								action: { type: 'text-align', axis: 'horizontal', value: 'justify' },
							}),
						),
						command(
							doc,
							icon({
								id: 'indent-decrease',
								label: 'Decrease Indent',
								icon: 'indentDecrease',
								action: { type: 'text-indent', direction: 'decrease' },
							}),
						),
						command(
							doc,
							icon({
								id: 'indent-increase',
								label: 'Increase Indent',
								icon: 'indentIncrease',
								action: { type: 'text-indent', direction: 'increase' },
							}),
						),
					],
					true,
				),
			]),
		],
		{ dialog: 'Paragraph options (Text dialog)' },
	);
	return [clipboard, font, paragraph];
}
