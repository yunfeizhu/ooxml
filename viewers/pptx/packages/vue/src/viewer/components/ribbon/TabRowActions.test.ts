import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import TabRowActions from './TabRowActions.vue';

type ActionsHost = HTMLElement & {
	state: { noShare: boolean; noComments: boolean; commentsPressed: boolean; commentsCount: number };
};

const actions = (wrapper: ReturnType<typeof mount>) =>
	wrapper.find('pptx-ui-ribbon-actions').element as ActionsHost;

/**
 * TabRowActions: the ribbon tab row's Record button and the shared Comments /
 * Share element. Covers the `hiddenActions` gating added for issue #64
 * (host-controlled toolbar visibility): Record and Share map to their own
 * `ToolbarActionId` ('record', 'share') and can be hidden independently.
 */
describe('tabRowActions', () => {
	it('renders Record and the shared Comments / Share element by default', () => {
		const wrapper = mount(TabRowActions, {
			props: { onEnterRehearsalMode: () => {}, onToggleComments: () => {} },
		});
		expect(wrapper.find('[aria-label="Record"]').exists()).toBeTruthy();
		expect(actions(wrapper).state.noShare).toBeFalsy();
		expect(actions(wrapper).state.noComments).toBeFalsy();
	});

	it('hides Share when "share" is in hiddenActions', () => {
		const wrapper = mount(TabRowActions, {
			props: { onEnterRehearsalMode: () => {}, hiddenActions: ['share'] },
		});
		expect(actions(wrapper).state.noShare).toBeTruthy();
		expect(wrapper.find('[aria-label="Record"]').exists()).toBeTruthy();
	});

	it('hides the Record button when "record" is in hiddenActions', () => {
		const wrapper = mount(TabRowActions, {
			props: { onEnterRehearsalMode: () => {}, hiddenActions: ['record'] },
		});
		expect(wrapper.find('[aria-label="Record"]').exists()).toBeFalsy();
		expect(actions(wrapper).state.noShare).toBeFalsy();
	});

	it('reflects the comments pane and routes the element events', async () => {
		const calls: string[] = [];
		const wrapper = mount(TabRowActions, {
			props: {
				onToggleComments: () => calls.push('comments'),
				onOpenShareDialog: () => calls.push('share'),
				isCommentsPanelOpen: true,
				slideCommentCount: 2,
			},
		});
		expect(actions(wrapper).state.commentsPressed).toBeTruthy();
		expect(actions(wrapper).state.commentsCount).toBe(2);
		await wrapper.find('pptx-ui-ribbon-actions').trigger('comments-toggle');
		await wrapper.find('pptx-ui-ribbon-actions').trigger('share-request');
		expect(calls).toStrictEqual(['comments', 'share']);
	});
});
