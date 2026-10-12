import { describe, expect, it, vi } from 'vitest';

import {
	findRibbonAddIn,
	resolveActiveRibbonAddIn,
	ribbonAddInControlId,
	ribbonAddInGroupViews,
	RIBBON_ADD_IN_EVENT,
	RIBBON_RESERVED_TAB_IDS,
	runRibbonAddInCommand,
	visibleRibbonAddIns,
	type RibbonAddInTab,
} from './ribbon-add-ins';

const reports = (run = vi.fn()): RibbonAddInTab => ({
	id: 'reports',
	label: 'Reports',
	groups: [
		{
			label: 'Export',
			commands: [
				{ id: 'export', label: 'Export', icon: 'save', run },
				{ id: 'a', label: 'A', size: 'small' },
				{ id: 'b', label: 'B', size: 'small' },
				{ id: 'c', label: 'C', size: 'small' },
				{ id: 'd', label: 'D', size: 'small', disabled: true, run },
				{ id: 'big', label: 'Big' },
				{ id: 'e', label: 'E', size: 'small' },
				{
					id: 'send',
					label: 'Send',
					icon: 'message',
					items: [
						{ id: 'send-mail', label: 'By mail', run },
						{ id: 'send-link', label: 'As link', title: 'Copy a link' },
					],
				},
			],
		},
	],
});

describe('PowerPoint ribbon add-in tabs', () => {
	it('never lets a host tab take a fixed or contextual tab id', () => {
		expect(RIBBON_RESERVED_TAB_IDS).toEqual(
			expect.arrayContaining(['file', 'home', 'slideShow', 'help', 'shapeFormat', 'text']),
		);
		const tabs = [
			{ ...reports(), id: 'home' },
			{ ...reports(), id: 'pictureFormat' },
			reports(),
			{ ...reports(), label: 'Again' },
			{ ...reports(), id: 'sign', label: 'Sign' },
		];
		expect(visibleRibbonAddIns(tabs).map((tab) => tab.label)).toEqual(['Reports', 'Sign']);
		expect(visibleRibbonAddIns(undefined)).toEqual([]);
		expect(findRibbonAddIn('sign', tabs)?.label).toBe('Sign');
		expect(findRibbonAddIn('home', tabs)).toBeUndefined();
		expect(findRibbonAddIn(null, tabs)).toBeUndefined();
	});

	it('keeps an add-in tab active while it exists and falls back when the host removes it', () => {
		const known = (id: string) => id === 'home' || id === 'insert';
		const tabs = [reports()];
		expect(resolveActiveRibbonAddIn('insert', tabs, known, 'home')).toBe('insert');
		expect(resolveActiveRibbonAddIn('reports', tabs, known, 'home')).toBe('reports');
		expect(resolveActiveRibbonAddIn('reports', [], known, 'home')).toBe('home');
		expect(resolveActiveRibbonAddIn('reports', undefined, known, 'home')).toBe('home');
	});

	it('lays large commands alone, small ones in columns of three and a drop-down as its items', () => {
		const [group] = ribbonAddInGroupViews(reports());
		expect(group!.label).toBe('Export');
		expect(group!.id).toBe('add-in.reports.group-0');
		expect(
			group!.commands.map((command) => [
				command.id.replace('add-in.reports.', ''),
				command.compact ? command.column : 'large',
			]),
		).toEqual([
			['export', 'large'],
			['a', 1],
			['b', 1],
			['c', 1],
			['d', 2],
			['big', 'large'],
			// A large command ends the column before it.
			['e', 3],
			['send-mail', 3],
			['send-link', 3],
		]);
		const byId = new Map(group!.commands.map((command) => [command.id, command]));
		expect(byId.get(ribbonAddInControlId('reports', 'd'))!.disabled).toBe(true);
		expect(byId.get(ribbonAddInControlId('reports', 'send-mail'))).toMatchObject({
			label: 'By mail',
			title: 'Send: By mail',
			icon: 'message',
		});
		expect(byId.get(ribbonAddInControlId('reports', 'send-link'))!.title).toBe('Copy a link');
		expect(byId.get(ribbonAddInControlId('reports', 'a'))!.icon).toBe('');
	});

	it('runs a command and announces it; unknown, disabled and parent ids do nothing', () => {
		const run = vi.fn();
		const tab = reports(run);
		const target = new EventTarget();
		const heard = vi.fn();
		target.addEventListener(RIBBON_ADD_IN_EVENT, (event) => {
			const custom = event as CustomEvent;
			heard(custom.detail, custom.bubbles, custom.composed);
		});
		expect(runRibbonAddInCommand(target, tab, ribbonAddInControlId('reports', 'export'))).toBe(
			true,
		);
		expect(run).toHaveBeenCalledTimes(1);
		expect(heard).toHaveBeenLastCalledWith({ tab: 'reports', command: 'export' }, true, true);
		expect(runRibbonAddInCommand(target, tab, ribbonAddInControlId('reports', 'send-mail'))).toBe(
			true,
		);
		expect(heard).toHaveBeenLastCalledWith({ tab: 'reports', command: 'send-mail' }, true, true);
		for (const id of ['d', 'send', 'missing'])
			expect(runRibbonAddInCommand(target, tab, ribbonAddInControlId('reports', id))).toBe(false);
		// An id from the viewer's own catalogue is not an add-in command.
		expect(runRibbonAddInCommand(target, tab, 'view.show.ruler')).toBe(false);
		expect(runRibbonAddInCommand(target, tab, 'export')).toBe(false);
		expect(run).toHaveBeenCalledTimes(2);
		expect(heard).toHaveBeenCalledTimes(2);
	});

	it('does not run the items of a disabled drop-down', () => {
		const run = vi.fn();
		const tab: RibbonAddInTab = {
			id: 'reports',
			label: 'Reports',
			groups: [
				{
					label: 'Send',
					commands: [
						{
							id: 'send',
							label: 'Send',
							disabled: true,
							items: [{ id: 'mail', label: 'Mail', run }],
						},
					],
				},
			],
		};
		expect(ribbonAddInGroupViews(tab)[0]!.commands[0]!.disabled).toBe(true);
		expect(
			runRibbonAddInCommand(new EventTarget(), tab, ribbonAddInControlId('reports', 'mail')),
		).toBe(false);
		expect(run).not.toHaveBeenCalled();
	});
});
