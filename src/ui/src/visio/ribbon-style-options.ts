import type { CommandSpec } from './ribbon-parts';

/**
 * The commands under the colour grid of Home > Fill and Line (`colorGrid` supplies the colours,
 * No Fill or No Line and More Colors): line weight and pattern, and the paint options dialog.
 */
export function paintOptions(target: 'fill' | 'line'): CommandSpec[] {
	const items: CommandSpec[] = [];
	if (target === 'line') {
		items.push({
			id: 'line-weight',
			label: 'Weight',
			items: [0.5, 1, 1.5, 2, 3, 4, 6].map((value) => ({
				id: `line-weight-${value}`,
				label: `${value} pt`,
				action: { type: 'shape-format', patch: { lineWeight: value } },
				checked: false,
			})),
		});
		items.push({
			id: 'line-pattern',
			label: 'Pattern',
			items: Array.from({ length: 23 }, (_, index) => ({
				id: `line-pattern-${index + 1}`,
				label: index === 0 ? 'Solid' : `Pattern ${index + 1}`,
				action: { type: 'shape-format' as const, patch: { linePattern: index + 1 } },
				checked: false,
			})),
		});
	}
	items.push({
		id: `${target}-options`,
		label: 'More Options...',
		action: { type: 'format-shape-pane', section: target },
	});
	return items;
}
