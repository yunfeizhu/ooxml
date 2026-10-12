import backstage from './backstage.css?raw';
import canvas from './canvas.css?raw';
import ribbon from './ribbon.css?raw';
import shapes from './shapes.css?raw';
import sizePosition from './size-position.css?raw';
import textTool from './text-tool.css?raw';
import presentation from './presentation.css?raw';
import insert from './insert.css?raw';
import pageSetup from './page-setup.css?raw';
import review from './review.css?raw';
import data from './data.css?raw';
import layout from './layout.css?raw';
import textFeatures from './text-features.css?raw';
import taskPane from './task-pane.css?raw';
import titleBar from './title-bar.css?raw';
import formatPane from './format-pane.css?raw';
import { visioThemeAliases, visioThemeBridge } from './theme';

/**
 * Viewer stylesheets as text for the shadow root. New styles are CSS files here; the legacy
 * `styles.ts` string moves into this directory when it is next changed.
 */
export const canvasAndRibbonStyles = [
	ribbon,
	shapes,
	backstage,
	canvas,
	sizePosition,
	textTool,
	presentation,
	insert,
	pageSetup,
	review,
	data,
	layout,
	textFeatures,
	taskPane,
	titleBar,
	formatPane,
	visioThemeBridge,
].join('\n');

export { visioThemeAliases };
