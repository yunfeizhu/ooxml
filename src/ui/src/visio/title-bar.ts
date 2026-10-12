import type { OfficeProfile, OfficeTitleBarState } from '../controls';
import type { ViewerState } from './controller';

type TitleBarElement = HTMLElement & { state: OfficeTitleBarState };

/**
 * Visio's title bar on the shared `office-ui-title-bar`, as Word, Excel and PowerPoint use it: the
 * V mark, the Quick Access Toolbar (Save, Undo, Redo), the drawing's name and state, and the
 * signed-in name at the right. Tell me stays on the ribbon's tab row, where Visio has it.
 */
export function createTitleBar(doc: Document): HTMLElement {
	const bar = doc.createElement('office-ui-title-bar');
	bar.className = 'title-bar';
	const account = doc.createElement('span');
	// Visio centres the document name in the title bar.
	bar.setAttribute('centered', '');
	account.slot = 'account';
	account.className = 'title-account';
	const name = doc.createElement('span');
	name.className = 'title-account-name';
	const avatar = doc.createElement('span');
	avatar.className = 'title-account-avatar';
	avatar.setAttribute('aria-hidden', 'true');
	account.append(name, avatar);
	bar.append(account);
	// The bar has its height from the start, so the first fit of the page measures the real canvas.
	(bar as TitleBarElement).state = { appMark: 'V', fileName: 'Visio' };
	return bar;
}

/** One or two initials for the avatar, from an explicit initial or the display name. */
function initials(profile: OfficeProfile): string {
	if (profile.initial) return profile.initial.slice(0, 2).toUpperCase();
	const words = profile.displayName.trim().split(/\s+/).filter(Boolean);
	return (
		(words[0]?.[0] ?? '') + (words.length > 1 ? (words.at(-1)?.[0] ?? '') : '')
	).toUpperCase();
}

/** What the drawing's state reads as beside its name; nothing for an unchanged drawing. */
function status(state: ViewerState): string {
	if (!state.document) return '';
	if (state.loading) return 'Opening...';
	if (state.document.format === 'vsd' || !state.edit.sourceAvailable) return 'Read-only';
	return state.edit.dirty ? 'Unsaved changes' : '';
}

export function renderTitleBar(
	bar: HTMLElement,
	state: ViewerState,
	fileName: string,
	profile: OfficeProfile,
): void {
	const busy = state.loading || state.edit.busy;
	(bar as TitleBarElement).state = {
		appMark: 'V',
		fileName: fileName || (state.document ? 'Drawing1' : 'Visio'),
		status: status(state),
		tone: state.loading ? 'saving' : 'idle',
		quickAccess: {
			label: 'Quick Access Toolbar',
			items: [
				{
					id: 'save',
					icon: 'save',
					label: 'Save',
					title: state.edit.sourceAvailable
						? 'Save (Ctrl+S): download a copy'
						: 'Save: open a .vsdx file to save a copy',
					disabled: !state.edit.sourceAvailable || busy,
				},
				{
					id: 'undo',
					icon: 'undo',
					label: 'Undo',
					title: 'Undo (Ctrl+Z)',
					disabled: !state.edit.canUndo || busy,
				},
				{
					id: 'redo',
					icon: 'redo',
					label: 'Redo',
					title: 'Redo (Ctrl+Y)',
					disabled: !state.edit.canRedo || busy,
				},
			],
		},
	};
	const account = bar.querySelector<HTMLElement>('.title-account')!;
	account.hidden = !profile.displayName;
	account.querySelector('.title-account-name')!.textContent = profile.displayName;
	const avatar = account.querySelector<HTMLElement>('.title-account-avatar')!;
	avatar.textContent = initials(profile);
	avatar.style.background = profile.avatarColor;
}
