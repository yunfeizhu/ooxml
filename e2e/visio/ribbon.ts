import { expect, type Locator } from '@playwright/test';

/** Visio ribbon interactions shared by the browser specs. */
export async function taskPane(
	viewer: Locator,
	name: 'Shapes' | 'Shape Data' | 'Layers' | 'Pan & Zoom' | 'Size & Position',
): Promise<void> {
	await viewer.getByRole('tab', { name: 'View', exact: true }).click();
	await viewer.getByRole('button', { name: 'Task Panes', exact: true }).click();
	await viewer
		.locator(`office-ui-menu-button[data-menu="task-panes"] office-ui-menu-item[label="${name}"]`)
		.click();
}

export async function zoomPreset(viewer: Locator, percent: number): Promise<void> {
	await viewer.getByRole('tab', { name: 'View', exact: true }).click();
	await viewer.getByRole('button', { name: 'Zoom', exact: true }).click();
	await viewer
		.locator(`office-ui-menu-button[data-menu="zoom"] office-ui-menu-item[label="${percent}%"]`)
		.click();
}

/**
 * A window too narrow for the ribbon collapses groups into buttons, from the right. Opens the
 * popup of `label` when that group is collapsed, so its commands can be clicked.
 */
export async function ribbonGroup(viewer: Locator, label: string): Promise<void> {
	// The fit runs in an animation frame after a resize or a tab change.
	await viewer.evaluate(
		() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
	);
	const group = viewer.locator(
		`.ribbon-content:not([hidden]) office-ui-ribbon-group[label="${label}"]`,
	);
	if ((await group.getAttribute('data-collapsed')) === null) return;
	if ((await group.getAttribute('data-open')) !== null) return;
	await group.getByRole('button', { name: label, exact: true }).click();
	await expect(group).toHaveAttribute('data-open', '');
}

/** Home > Editing > Find > Find... opens the find bar, as Ctrl+F does. */
export async function openFind(viewer: Locator): Promise<Locator> {
	await viewer.getByRole('tab', { name: 'Home', exact: true }).click();
	const tools = viewer.locator('.ribbon-tools');
	if ((await tools.getAttribute('open')) === null) await tools.locator('summary').click();
	await ribbonGroup(viewer, 'Editing');
	await viewer.getByRole('button', { name: 'Find', exact: true }).click();
	await viewer.locator('office-ui-menu-item[label="Find..."]').click();
	return viewer.getByRole('searchbox', { name: 'Search diagram text' });
}

/** Visio's File backstage. */
export async function fileBackstage(
	viewer: Locator,
	item:
		| 'info'
		| 'new'
		| 'open'
		| 'save-as'
		| 'print'
		| 'share'
		| 'export'
		| 'account'
		| 'options' = 'info',
): Promise<void> {
	const backstage = viewer.locator('.backstage');
	if (!(await backstage.isVisible())) await viewer.locator('office-ui-ribbon .file').click();
	await viewer.locator(`[data-backstage-item="${item}"]`).click();
}

/** File > Save: downloads the VSDX copy (disabled for model-only and legacy drawings). */
export function saveCommand(viewer: Locator): Locator {
	return viewer.locator('[data-backstage-item="save"]');
}

/** File > Save As > Download a copy. */
export async function downloadCopy(viewer: Locator): Promise<Locator> {
	await fileBackstage(viewer, 'save-as');
	return viewer.locator('[data-backstage-page="save-as"] [data-backstage-action="download"]');
}

/** File > Export > Export the current page as SVG (the first entry; Change File Type repeats it). */
export async function exportSvgCommand(viewer: Locator): Promise<Locator> {
	await fileBackstage(viewer, 'export');
	return viewer
		.locator('[data-backstage-page="export"] [data-backstage-action="export-svg"]')
		.first();
}

/** File > New > the demo's slotted Sample workflow template. */
export async function loadSampleTemplate(viewer: Locator): Promise<void> {
	await fileBackstage(viewer, 'new');
	await viewer.locator('.template-card').click();
}

/**
 * Edit a shape's text in place, as in Visio: double-click it, type, then press Esc to keep the
 * change. The editor closes once the edit is handed to the drawing.
 */
export async function editShapeText(viewer: Locator, shapeId: string, text: string): Promise<void> {
	await viewer.locator(`svg.paper [data-shape-id="${shapeId}"]`).dblclick();
	const editor = viewer.locator('#edit-text');
	await expect(editor).toBeFocused();
	await editor.fill(text);
	await editor.press('Escape');
	await expect(editor).toHaveCount(0);
}

/** The Quick Access Toolbar's Undo or Redo. */
export function history(viewer: Locator, name: 'Undo' | 'Redo'): Locator {
	return viewer.locator('.qat').getByRole('button', { name, exact: true });
}

/**
 * Apply one edit to the selected shape through the element's public API. The page and shape ids
 * are filled in from the current selection, so `edit` carries only the command's own fields
 * (`{ type: 'move-shape', x, y }`, `{ type: 'rotate-shape', angle }` in radians, and so on).
 */
export async function editSelection(viewer: Locator, edit: Record<string, unknown>): Promise<void> {
	await viewer.evaluate(async (node, command) => {
		const element = node as unknown as {
			applyEdits(edits: readonly unknown[]): Promise<void>;
			controller: {
				state: {
					pageIndex: number;
					document: { pages: { id: string }[] } | null;
					selectedShape: { id: string } | null;
				};
			};
		};
		const state = element.controller.state;
		const page = state.document?.pages[state.pageIndex];
		if (!page || !state.selectedShape) throw new Error('Select a shape before editing it.');
		await element.applyEdits([{ ...command, pageId: page.id, shapeId: state.selectedShape.id }]);
	}, edit);
}

/** File > Options > General > Office Theme: Colorful, White or Black (the dark theme). */
export async function officeTheme(
	viewer: Locator,
	theme: 'Colorful' | 'White' | 'Black',
): Promise<void> {
	await fileBackstage(viewer, 'options');
	const dialog = viewer.locator('office-ui-options-dialog');
	await dialog.locator('[data-key="officeTheme"] select').selectOption({ label: theme });
	await dialog.locator('[data-action="ok"]').click();
}

/**
 * Home > Fill, Line or Font Color: open the menu and choose from Office's colour picker. `color`
 * is a swatch (`#rrggbb`), `none` (No Fill, No Line) or `more` (More Colors...).
 */
export async function pickColor(
	viewer: Locator,
	target: 'fill' | 'line' | 'font',
	color: string,
): Promise<void> {
	if (target === 'font') await viewer.locator('[data-menu="font-color"] .caret').click();
	else await viewer.locator(`[data-menu="${target}"] button`).first().click();
	const grid = viewer.locator(
		`office-ui-menu-button office-ui-color-grid[data-color-grid="${target}"]`,
	);
	await grid
		.locator(color.startsWith('#') ? `[data-color="${color}"]` : `[data-command="${color}"]`)
		.first()
		.click();
}

/** Home > Shape Styles launcher: Visio's Format Shape task pane. */
export async function formatShapePane(viewer: Locator): Promise<Locator> {
	await viewer.getByRole('tab', { name: 'Home', exact: true }).click();
	await viewer
		.locator('office-ui-ribbon-group[launcher="shape-styles-dialog"]')
		.getByRole('button', { name: 'Format Shape', exact: true })
		.click();
	const pane = viewer.locator('.format-pane');
	await expect(pane).toBeVisible();
	return pane;
}
