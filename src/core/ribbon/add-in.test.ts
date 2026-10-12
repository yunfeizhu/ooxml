import { describe, expect, it } from 'vitest';
import {
	acceptedRibbonAddIns,
	findRibbonAddInCommand,
	ribbonAddInCommands,
	RIBBON_ADD_IN_EVENT,
	type RibbonAddInTab,
} from './index';

const tab = (id: string, label = id): RibbonAddInTab => ({ id, label, groups: [] });

const reports: RibbonAddInTab = {
	id: 'reports',
	label: 'Reports',
	groups: [
		{
			label: 'Export',
			commands: [
				{ id: 'export', label: 'Export' },
				{ id: 'locked', label: 'Locked', disabled: true },
				{
					id: 'send',
					label: 'Send',
					items: [
						{ id: 'send-mail', label: 'By mail' },
						{ id: 'send-off', label: 'Unavailable', disabled: true },
					],
				},
			],
		},
		{ label: 'Options', commands: [{ id: 'options', label: 'Options', size: 'small' }] },
	],
};

describe('ribbon add-in tabs', () => {
	it('names the event every editor dispatches', () => {
		expect(RIBBON_ADD_IN_EVENT).toBe('office-ribbon-add-in');
	});

	it('keeps tabs in order and drops empty, repeated and reserved ids', () => {
		const first = tab('reports');
		const accepted = acceptedRibbonAddIns(
			[first, tab('reports', 'Again'), tab('home', 'Fake Home'), tab(''), tab('sign')],
			['home', 'insert'],
		);
		expect(accepted.map((item) => item.id)).toEqual(['reports', 'sign']);
		expect(accepted[0]).toBe(first);
	});

	it('accepts nothing from a missing list and tolerates holes in an untyped one', () => {
		expect(acceptedRibbonAddIns(undefined)).toEqual([]);
		expect(acceptedRibbonAddIns(null)).toEqual([]);
		const untyped = [
			null,
			{ label: 'No id', groups: [] },
			tab('ok'),
		] as unknown as RibbonAddInTab[];
		expect(acceptedRibbonAddIns(untyped).map((item) => item.id)).toEqual(['ok']);
	});

	it('lists every command with its drop-down items and finds only enabled ones', () => {
		expect(ribbonAddInCommands(reports).map((command) => command.id)).toEqual([
			'export',
			'locked',
			'send',
			'send-mail',
			'send-off',
			'options',
		]);
		expect(findRibbonAddInCommand(reports, 'send-mail')?.label).toBe('By mail');
		expect(findRibbonAddInCommand(reports, 'locked')).toBeUndefined();
		expect(findRibbonAddInCommand(reports, 'send-off')).toBeUndefined();
		expect(findRibbonAddInCommand(reports, 'missing')).toBeUndefined();
		expect(findRibbonAddInCommand(reports, undefined)).toBeUndefined();
	});
});
