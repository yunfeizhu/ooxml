export { buildProcessPanel, buildReviewPanel } from './ribbon-review';
import { check, command, commandRow, group, menu, stack, type CommandSpec } from './ribbon-parts';
import { backgroundsGroup, pageSetupGroup } from './ribbon-page-setup';
import { themesGallery, variantOptions, variantsGallery } from './ribbon-themes';
import { diagramPartGallery } from './ribbon-diagram-parts';
import type { VisioDataCommand } from './ribbon-action';
import { layoutGroup, reLayoutGallery } from './ribbon-layout';

const OBJECTS = 'Embedded OLE objects are not supported; only pictures can be inserted.';

const GRAPHICS =
	'Data graphics are placed at their default position; this option is not built yet.';
const LINKING =
	'Rows are linked by dragging them from the External Data window; the linking wizard is not built yet.';

const unsupported = (
	id: string,
	label: string,
	icon: string,
	reason: string,
	size?: CommandSpec['size'],
) => ({ id, label, icon, unsupported: reason, ...(size ? { size } : {}) }) satisfies CommandSpec;

/**
 * Connector styles. Design > Connectors restyles the selected connectors (and sets the style of
 * new ones); Insert > Connector picks the style and arms the Connector tool.
 */
const connectorMenu = (doc: Document, id: string, label: string, scope: 'selection' | 'tool') =>
	menu(doc, {
		id,
		label,
		icon: 'connector',
		items: [
			...(
				[
					['right-angle', 'Right-Angle'],
					['straight', 'Straight'],
					['curved', 'Curved'],
				] as const
			).map(([route, name]) => ({
				id: `${id}-${route}`,
				label: scope === 'tool' ? `${name} Connector` : name,
				action: { type: 'connector-route' as const, route, scope },
				checked: route === 'right-angle',
			})),
			...(scope === 'selection'
				? [
						{
							id: 'line-jumps',
							label: 'Show Line Jumps',
							action: { type: 'page-setup' as const, command: { op: 'line-jumps' as const } },
							checked: true,
						},
					]
				: []),
		],
	});

/** Visio's Insert tab: Pages, Illustrations, Diagram Parts, Links and Text. */
export function buildInsertPanel(doc: Document, panel: HTMLElement): void {
	panel.append(
		commandRow(doc, 'Insert commands', [
			group(doc, 'Pages', [
				command(doc, {
					id: 'blank-page',
					label: 'New Page',
					icon: 'visioPagesPane',
					action: { type: 'page-insert' },
				}),
			]),
			group(doc, 'Illustrations', [
				command(doc, {
					id: 'pictures',
					label: 'Pictures',
					icon: 'visioPicture',
					action: { type: 'insert', item: 'picture' },
				}),
				command(
					doc,
					unsupported('chart', 'Chart', 'visioChart', 'Embedded Excel charts are not supported.'),
				),
				command(
					doc,
					unsupported(
						'cad-drawing',
						'CAD Drawing',
						'visioCad',
						'DWG and DXF import is not supported.',
					),
				),
			]),
			group(doc, 'Diagram Parts', [
				diagramPartGallery(doc, 'container'),
				diagramPartGallery(doc, 'callout'),
				connectorMenu(doc, 'insert-connector', 'Connector', 'tool'),
			]),
			group(doc, 'Links', [
				command(doc, {
					id: 'link',
					label: 'Link',
					icon: 'visioLink',
					action: { type: 'insert', item: 'link' },
					keys: ['Control+K', 'Ctrl+K'],
				}),
			]),
			group(doc, 'Text', [
				command(doc, {
					id: 'text-box',
					label: 'Text Box',
					icon: 'textBox',
					action: { type: 'tool', tool: 'text' },
				}),
				stack(doc, [
					command(doc, {
						id: 'screen-tip',
						label: 'ScreenTip',
						icon: 'message',
						size: 'small',
						action: { type: 'insert', item: 'screen-tip' },
					}),
					command(doc, {
						id: 'field',
						label: 'Field',
						icon: 'textBox',
						size: 'small',
						action: { type: 'text-feature', feature: 'field' },
					}),
					command(doc, unsupported('object', 'Object', 'visioPicture', OBJECTS, 'small')),
				]),
				command(doc, {
					id: 'symbol',
					label: 'Symbol',
					icon: 'visioSymbol',
					action: { type: 'text-feature', feature: 'symbol' },
				}),
			]),
		]),
	);
}

/** Visio's Design tab: Page Setup, Themes, Variants, Backgrounds and Layout. */
export function buildDesignPanel(doc: Document, panel: HTMLElement): void {
	panel.append(
		commandRow(doc, 'Design commands', [
			pageSetupGroup(doc),
			group(doc, 'Themes', [themesGallery(doc)]),
			group(doc, 'Variants', [variantsGallery(doc), variantOptions(doc)]),
			backgroundsGroup(doc),
			layoutGroup(doc, [
				reLayoutGallery(doc),
				connectorMenu(doc, 'connectors', 'Connectors', 'selection'),
			]),
		]),
	);
}

/** Visio's Data tab. Shape Data Window maps to the viewer's shape inspector. */
export function buildDataPanel(doc: Document, panel: HTMLElement): void {
	const data = (command: VisioDataCommand) => ({ type: 'data', command }) as const;
	panel.append(
		commandRow(doc, 'Data commands', [
			group(doc, 'External Data', [
				command(doc, {
					id: 'quick-import',
					label: 'Quick Import',
					icon: 'visioData',
					action: data('quick-import'),
				}),
				command(doc, {
					id: 'custom-import',
					label: 'Custom Import',
					icon: 'visioData',
					action: data('custom-import'),
				}),
				command(doc, {
					id: 'refresh-all',
					label: 'Refresh All',
					icon: 'reset',
					action: data('refresh'),
				}),
			]),
			group(doc, 'Data Graphics', [
				menu(doc, {
					id: 'data-graphics',
					label: 'Data Graphics',
					icon: 'visioChart',
					items: [
						{ id: 'graphic-text', label: 'Text Callout...', action: data('graphic-text') },
						{ id: 'graphic-bar', label: 'Data Bar...', action: data('graphic-bar') },
						{ id: 'graphic-icon', label: 'Icon Set...', action: data('graphic-icon') },
						{ id: 'graphic-color', label: 'Color by Value...', action: data('graphic-color') },
						{
							id: 'graphic-remove',
							label: 'Remove Data Graphics',
							action: data('graphic-remove'),
						},
					],
				}),
				stack(doc, [
					command(doc, unsupported('graphic-position', 'Position', 'position', GRAPHICS, 'small')),
					command(
						doc,
						unsupported('graphic-configure', 'Configure', 'settings', GRAPHICS, 'small'),
					),
					command(doc, unsupported('graphic-auto-space', 'Auto Space', 'grid', GRAPHICS, 'small')),
				]),
			]),
			group(doc, 'Display Data', [
				menu(doc, {
					id: 'insert-legend',
					label: 'Insert Legend',
					icon: 'bullets',
					items: [
						{ id: 'legend-vertical', label: 'Vertical', action: data('legend') },
						{
							id: 'legend-horizontal',
							label: 'Horizontal',
							action: data('legend-horizontal'),
						},
					],
				}),
			]),
			group(doc, 'Show/Hide', [
				stack(doc, [
					check(doc, {
						id: 'shape-data-window',
						label: 'Shape Data Window',
						action: { type: 'reveal', panel: 'selection' },
					}),
					check(doc, {
						id: 'external-data-window',
						label: 'External Data Window',
						action: data('external-data-window'),
					}),
					check(doc, {
						id: 'data-graphic-fields',
						label: 'Data Graphic Fields',
						unsupported:
							'Data graphics are chosen in the Data Graphics menu; there is no fields pane.',
					}),
				]),
			]),
			group(doc, 'Advanced Data Linking', [
				command(doc, unsupported('link-data', 'Link Data', 'visioLink', LINKING)),
				command(
					doc,
					unsupported('advanced-data-graphics', 'Advanced Data Graphics', 'visioChart', GRAPHICS),
				),
			]),
		]),
	);
}

/** Visio's Help tab. Help and Show Training open the viewer guide; support is not connected. */
export function buildHelpPanel(doc: Document, panel: HTMLElement): void {
	panel.append(
		commandRow(doc, 'Help commands', [
			group(doc, 'Help', [
				command(doc, {
					id: 'help',
					label: 'Help',
					icon: 'help',
					action: { type: 'help', topic: 'help' },
					keys: ['F1', 'F1'],
				}),
				command(
					doc,
					unsupported(
						'contact-support',
						'Contact Support',
						'message',
						'No support service is connected.',
					),
				),
				command(
					doc,
					unsupported(
						'help-feedback',
						'Feedback',
						'message',
						'Feedback is not collected by this viewer.',
					),
				),
				command(doc, {
					id: 'show-training',
					label: 'Show Training',
					icon: 'visioPresentation',
					action: { type: 'help', topic: 'training' },
				}),
			]),
		]),
	);
}
