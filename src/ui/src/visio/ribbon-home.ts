import { textGroups } from './ribbon-home-format';
import { paintOptions } from './ribbon-style-options';
import { colorGrid, type ColorTarget } from './ribbon-color-menu';
import { effectsOptions, quickStyleGallery } from './ribbon-shape-styles';
import { command, commandRow, group, menu, stack, type CommandSpec } from './ribbon-parts';
import { changeShapeGallery } from './ribbon-change-shape';

const ARRANGE = 'Needs core alignment, position, z-order and grouping edits.';
const small = (spec: CommandSpec): CommandSpec => ({ size: 'small', ...spec });
const icon = (spec: CommandSpec): CommandSpec => ({ size: 'icon', ...spec });

/** Home > Fill or Line: Office's colour picker over the menu's own commands. */
function paintMenu(doc: Document, target: Exclude<ColorTarget, 'font'>, label: string) {
	const el = menu(doc, {
		id: target,
		label,
		icon: target,
		size: 'small',
		items: paintOptions(target),
	});
	el.prepend(colorGrid(doc, target));
	return el;
}

/**
 * Microsoft Visio's Home tab, group for group: Clipboard, Font, Paragraph, Tools, Shape
 * Styles, Arrange and Editing. Commands the core cannot perform yet are shown disabled with the
 * missing capability in their tooltip. On phones every group folds into the Tools disclosure.
 */
export function buildHomePanel(doc: Document, panel: HTMLElement): void {
	const [clipboard, font, paragraph] = textGroups(doc);
	const tools = group(doc, 'Tools', [
		stack(doc, [
			command(
				doc,
				small({
					id: 'pointer',
					label: 'Pointer Tool',
					icon: 'pointer',
					action: { type: 'tool', tool: 'pointer' },
					keys: ['Control+1', 'Ctrl+1'],
					pressed: true,
				}),
			),
			command(
				doc,
				small({
					id: 'connector',
					label: 'Connector',
					icon: 'connector',
					action: { type: 'tool', tool: 'connector' },
					keys: ['Control+3', 'Ctrl+3'],
				}),
			),
			command(
				doc,
				small({
					id: 'text-tool',
					label: 'Text',
					icon: 'textBox',
					action: { type: 'tool', tool: 'text' },
					keys: ['Control+2', 'Ctrl+2'],
				}),
			),
		]),
		stack(doc, [
			menu(doc, {
				id: 'rectangle',
				label: 'Rectangle',
				icon: 'rectangle',
				size: 'icon',
				split: true,
				action: { type: 'tool', tool: 'rectangle' },
				keys: ['Control+8', 'Ctrl+8'],
				items: [
					{
						id: 'rectangle-item',
						label: 'Rectangle',
						icon: 'rectangle',
						action: { type: 'tool', tool: 'rectangle' },
						checked: false,
					},
					{
						id: 'ellipse',
						label: 'Ellipse',
						action: { type: 'tool', tool: 'ellipse' },
						keys: ['Control+9', 'Ctrl+9'],
						checked: false,
					},
					{
						id: 'line-tool',
						label: 'Line',
						icon: 'line',
						action: { type: 'tool', tool: 'line' },
						keys: ['Control+6', 'Ctrl+6'],
						checked: false,
					},
					{
						id: 'freeform',
						label: 'Freeform',
						action: { type: 'tool', tool: 'freeform' },
						keys: ['Control+5', 'Ctrl+5'],
						checked: false,
					},
					{
						id: 'arc',
						label: 'Arc',
						action: { type: 'tool', tool: 'arc' },
						keys: ['Control+7', 'Ctrl+7'],
						checked: false,
					},
					{
						id: 'pencil',
						label: 'Pencil',
						icon: 'pencil',
						action: { type: 'tool', tool: 'pencil' },
						keys: ['Control+4', 'Ctrl+4'],
						checked: false,
					},
				],
			}),
			command(
				doc,
				icon({
					id: 'connection-point',
					label: 'Connection Point',
					icon: 'visioConnectionPoint',
					action: { type: 'tool', tool: 'connection-point' },
					keys: ['Control+Shift+1', 'Ctrl+Shift+1'],
				}),
			),
			command(
				doc,
				icon({
					id: 'text-block',
					label: 'Text Block',
					icon: 'visioTextBlock',
					action: { type: 'text-feature', feature: 'text-block' },
					keys: ['Control+Shift+4', 'Ctrl+Shift+4'],
					pressed: false,
				}),
			),
		]),
	]);
	const styles = group(
		doc,
		'Shape Styles',
		[
			quickStyleGallery(doc),
			stack(doc, [
				paintMenu(doc, 'fill', 'Fill'),
				paintMenu(doc, 'line', 'Line'),
				menu(doc, {
					id: 'effects',
					label: 'Effects',
					icon: 'effects',
					size: 'small',
					items: effectsOptions(),
				}),
			]),
		],
		{ dialog: 'Format Shape' },
	);
	const arrange = group(doc, 'Arrange', [
		menu(doc, {
			id: 'align',
			label: 'Align',
			icon: 'alignObjects',
			items: (['left', 'center', 'right', 'top', 'middle', 'bottom'] as const).map((edge) => ({
				id: `align-shapes-${edge}`,
				label: `Align ${edge[0]!.toUpperCase()}${edge.slice(1)}`,
				action: { type: 'arrange', operation: { type: 'align', edge } },
			})),
		}),
		menu(doc, {
			id: 'position',
			label: 'Position',
			icon: 'position',
			unsupported: ARRANGE,
			items: [
				{ id: 'auto-align', label: 'Auto Align & Space', action: { type: 'auto-align' } },
				{
					id: 'distribute-horizontal',
					label: 'Distribute Horizontally',
					action: { type: 'arrange', operation: { type: 'distribute', axis: 'horizontal' } },
				},
				{
					id: 'distribute-vertical',
					label: 'Distribute Vertically',
					action: { type: 'arrange', operation: { type: 'distribute', axis: 'vertical' } },
				},
				{
					id: 'rotate',
					label: 'Rotate Shapes',
					items: [
						{
							id: 'rotate-left',
							label: 'Rotate Left 90°',
							action: { type: 'rotate', direction: 'left' },
						},
						{
							id: 'rotate-right',
							label: 'Rotate Right 90°',
							action: { type: 'rotate', direction: 'right' },
						},
						{
							id: 'flip-horizontal',
							label: 'Flip Horizontal',
							action: { type: 'flip', axis: 'horizontal' },
						},
						{
							id: 'flip-vertical',
							label: 'Flip Vertical',
							action: { type: 'flip', axis: 'vertical' },
						},
					],
				},
			],
		}),
		stack(doc, [
			menu(doc, {
				id: 'bring-to-front',
				label: 'Bring to Front',
				icon: 'bringToFront',
				size: 'small',
				split: true,
				action: { type: 'shape-order', order: 'front' },
				items: [
					{
						id: 'bring-forward',
						label: 'Bring Forward',
						action: { type: 'shape-order', order: 'forward' },
					},
				],
			}),
			menu(doc, {
				id: 'send-to-back',
				label: 'Send to Back',
				icon: 'sendToBack',
				size: 'small',
				split: true,
				action: { type: 'shape-order', order: 'back' },
				items: [
					{
						id: 'send-backward',
						label: 'Send Backward',
						action: { type: 'shape-order', order: 'backward' },
					},
				],
			}),
			menu(doc, {
				id: 'group',
				label: 'Group',
				icon: 'group',
				size: 'small',
				items: [
					{
						id: 'group-shapes',
						label: 'Group',
						icon: 'group',
						action: { type: 'grouping', operation: 'group' },
						keys: ['Control+Shift+G', 'Ctrl+Shift+G'],
					},
					{
						id: 'ungroup',
						label: 'Ungroup',
						action: { type: 'grouping', operation: 'ungroup' },
						keys: ['Control+Shift+U', 'Ctrl+Shift+U'],
					},
				],
			}),
		]),
	]);
	const editing = group(doc, 'Editing', [
		changeShapeGallery(doc),
		stack(doc, [
			menu(doc, {
				id: 'find',
				label: 'Find',
				icon: 'search',
				size: 'small',
				items: [
					{
						id: 'find-item',
						label: 'Find...',
						icon: 'search',
						action: { type: 'search' },
						keys: ['Control+F', 'Ctrl+F'],
					},
					{
						id: 'replace',
						label: 'Replace...',
						action: { type: 'replace' },
						keys: ['Control+H', 'Ctrl+H'],
					},
				],
			}),
			menu(doc, {
				id: 'layers',
				label: 'Layers',
				icon: 'visioLayers',
				size: 'small',
				items: [
					{
						id: 'layer-properties',
						label: 'Layer Properties...',
						action: { type: 'layer-properties' },
					},
					{
						id: 'assign-layer',
						label: 'Assign to Layer...',
						action: { type: 'assign-layers' },
					},
				],
			}),
			menu(doc, {
				id: 'select',
				label: 'Select',
				icon: 'pointer',
				size: 'small',
				items: [
					{
						id: 'select-all',
						label: 'Select All',
						action: { type: 'selection', mode: 'all' },
						keys: ['Control+A', 'Ctrl+A'],
					},
					{
						id: 'clear-selection',
						label: 'Deselect All',
						action: { type: 'selection', mode: 'clear' },
					},
					{ id: 'select-by-type', label: 'Select by Type...', action: { type: 'select-by-type' } },
				],
			}),
		]),
	]);
	const tools0 = doc.createElement('details');
	tools0.className = 'ribbon-tools';
	tools0.open = true;
	const summary = doc.createElement('summary');
	const caret = doc.createElement('span');
	caret.setAttribute('aria-hidden', 'true');
	caret.textContent = '⌄';
	summary.append('Tools ', caret);
	const content = doc.createElement('div');
	content.className = 'tools-content';
	content.append(clipboard, font, paragraph, tools, styles, arrange, editing);
	tools0.append(summary, content);
	panel.append(commandRow(doc, 'Home commands', [tools0]));
}
