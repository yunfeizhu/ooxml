import { VISIO_DIAGRAM_RULE_SETS } from 'ooxml-core/visio/ui';
import type { VisioReviewCommand } from './ribbon-action';
import { check, command, commandRow, group, menu, stack } from './ribbon-parts';

const review = (command: VisioReviewCommand) => ({ type: 'review' as const, command });

/**
 * Visio's Process tab: Subprocess, Diagram Validation (this viewer's generic rules) and SharePoint
 * Workflow, which is shown disabled because no server is connected.
 */
export function buildProcessPanel(doc: Document, panel: HTMLElement): void {
	panel.append(
		commandRow(doc, 'Process commands', [
			group(doc, 'Subprocess', [
				command(doc, {
					id: 'create-new',
					label: 'Create New',
					icon: 'visioPagesPane',
					action: review('subprocess-new'),
				}),
				command(doc, {
					id: 'link-existing',
					label: 'Link to Existing',
					icon: 'visioLink',
					action: review('subprocess-existing'),
				}),
				command(doc, {
					id: 'create-from-selection',
					label: 'Create from Selection',
					icon: 'group',
					action: review('subprocess-selection'),
				}),
			]),
			group(doc, 'Diagram Validation', [
				menu(doc, {
					id: 'check-diagram',
					label: 'Check Diagram',
					icon: 'check',
					split: true,
					action: review('check-diagram'),
					items: [
						{ id: 'check-diagram-now', label: 'Check Diagram', action: review('check-diagram') },
						{
							id: 'rules-to-check',
							label: 'Rules to Check',
							items: VISIO_DIAGRAM_RULE_SETS.map((set) => ({
								id: `rule-set-${set.id}`,
								label: set.name,
								checked: true,
								action: { type: 'review' as const, command: 'rule-set' as const, ruleSet: set.id },
							})),
						},
						{
							id: 'import-rules',
							label: 'Import Rules From',
							unsupported:
								'Visio rule sets (formula-based RuleFilter and RuleTest) are not evaluated; only the built-in generic rules run.',
						},
					],
				}),
				stack(doc, [
					command(doc, {
						id: 'ignore-issue',
						label: 'Ignore This Issue',
						icon: 'eyeOff',
						size: 'small',
						action: review('ignore-issue'),
					}),
					check(doc, {
						id: 'issues-window',
						label: 'Issues Window',
						action: review('issues-window'),
					}),
				]),
			]),
			group(
				doc,
				'SharePoint Workflow',
				(
					[
						['workflow-import', 'Import', 'visioData'],
						['workflow-export', 'Export', 'visioData'],
						['workflow-stage-outline', 'Stage Outline', 'bullets'],
						['workflow-create', 'Create Workflow', 'visioPagesPane'],
					] as const
				).map(([id, label, icon]) =>
					command(doc, { id, label, icon, unsupported: 'No SharePoint server is connected.' }),
				),
			),
		]),
	);
}

/** Visio's Review tab: Proofing, Accessibility, Language, Comments and Reports. */
export function buildReviewPanel(doc: Document, panel: HTMLElement): void {
	panel.append(
		commandRow(doc, 'Review commands', [
			group(doc, 'Proofing', [
				command(doc, {
					id: 'spelling',
					label: 'Spelling',
					icon: 'check',
					action: { type: 'text-feature', feature: 'spelling' },
					keys: ['F7', 'F7'],
				}),
				command(doc, {
					id: 'thesaurus',
					label: 'Thesaurus',
					icon: 'search',
					unsupported: 'No thesaurus dictionary is bundled with this editor.',
				}),
			]),
			group(doc, 'Accessibility', [
				command(doc, {
					id: 'check-accessibility',
					label: 'Check Accessibility',
					icon: 'check',
					unsupported: 'The accessibility checker (alt text, reading order) is not built yet.',
				}),
			]),
			group(doc, 'Language', [
				command(doc, {
					id: 'language',
					label: 'Language',
					icon: 'message',
					action: { type: 'text-feature', feature: 'language' },
				}),
			]),
			group(doc, 'Comments', [
				command(doc, {
					id: 'new-comment',
					label: 'New Comment',
					icon: 'message',
					action: review('new-comment'),
				}),
				command(doc, {
					id: 'comments-pane',
					label: 'Comments Pane',
					icon: 'visioInspectorPane',
					action: review('comments-pane'),
				}),
				command(doc, {
					id: 'ink',
					label: 'Ink',
					icon: 'visioInk',
					unsupported: 'Ink strokes are not supported.',
				}),
			]),
			group(doc, 'Reports', [
				command(doc, {
					id: 'shape-reports',
					label: 'Shape Reports',
					icon: 'visioData',
					action: review('shape-reports'),
				}),
			]),
		]),
	);
}
