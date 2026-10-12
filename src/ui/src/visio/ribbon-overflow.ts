import { attachRibbonGroupOverflow, type RibbonGroupOverflow } from '../ribbon/group-overflow';

/** The icon on a collapsed group's button, by the group's name. */
const GROUP_ICONS: Readonly<Record<string, string>> = {
	Clipboard: 'paste',
	Font: 'fontColor',
	Paragraph: 'alignLeft',
	Tools: 'pointer',
	'Shape Styles': 'quickStyles',
	Arrange: 'alignObjects',
	Editing: 'search',
	Pages: 'visioPagesPane',
	Illustrations: 'visioPicture',
	'Diagram Parts': 'connector',
	Links: 'visioLink',
	Text: 'textBox',
	'Page Setup': 'fitPage',
	Themes: 'quickStyles',
	Variants: 'effects',
	Backgrounds: 'fill',
	Layout: 'position',
	'External Data': 'visioData',
	'Data Graphics': 'visioChart',
	'Display Data': 'bullets',
	'Show/Hide': 'visioShapeData',
	'Advanced Data Linking': 'visioLink',
	Subprocess: 'visioPagesPane',
	'Diagram Validation': 'check',
	'SharePoint Workflow': 'visioData',
	Proofing: 'check',
	Accessibility: 'check',
	Language: 'message',
	Comments: 'message',
	Reports: 'visioData',
	Views: 'visioPresentation',
	Show: 'ruler',
	Zoom: 'zoomIn',
	'Visual Aids': 'grid',
	Window: 'copy',
	Macros: 'visioMacros',
	Help: 'help',
};

/** Below this width the phone layout folds Home into its Tools disclosure instead. */
const PHONE_MAX_WIDTH = 760;

/**
 * Visio collapses ribbon groups into buttons, from the right, when the window is too narrow for
 * them (on Home: Editing first, Clipboard last). The folding is ooxml-ui's shared
 * `attachRibbonGroupOverflow`; this supplies Visio's group icons.
 */
export function wireRibbonOverflow(ribbon: HTMLElement): RibbonGroupOverflow {
	return attachRibbonGroupOverflow(ribbon, {
		icon: (group) => GROUP_ICONS[group.getAttribute('label') ?? ''],
		minWidth: PHONE_MAX_WIDTH + 1,
	});
}
