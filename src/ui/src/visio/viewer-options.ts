import {
	readOfficeProfile,
	sanitizeOfficeProfile,
	writeOfficeProfile,
	type OfficeOptionCategory,
	type OfficeOptionValues,
	type OfficeOptionsChangeEvent,
	type OfficeProfile,
	type OfficeProfileChangeEvent,
} from '../controls';

const disabled = (reason: string) => ({ disabled: `Not available yet. ${reason}` });

/**
 * Visio's File > Options categories, in Visio's order. User name and Initials (the local profile,
 * also the identity in a shared session) and Office Theme (the status bar's look) are honoured;
 * every other setting is shown disabled with the capability it is waiting for.
 */
export const VISIO_OPTION_CATEGORIES: readonly OfficeOptionCategory[] = [
	{
		id: 'general',
		label: 'General',
		description: 'General options for working with Visio.',
		sections: [
			{
				id: 'ui',
				title: 'User Interface options',
				controls: [
					{
						kind: 'toggle',
						key: 'miniToolbar',
						label: 'Show Mini Toolbar on selection',
						...disabled('Needs rich text formatting.'),
					},
					{
						kind: 'toggle',
						key: 'livePreview',
						label: 'Enable Live Preview',
						...disabled('Styles are applied on click; hover previews are not drawn yet.'),
					},
					{
						kind: 'select',
						key: 'screenTips',
						label: 'ScreenTip style',
						choices: [{ value: 'descriptions', label: 'Show feature descriptions in ScreenTips' }],
						...disabled('ScreenTips always describe the command.'),
					},
				],
			},
			{
				id: 'personalize',
				title: 'Personalize your copy of Microsoft Office',
				description: 'Stored on this device only. Shared sessions show this name to others.',
				controls: [
					{ kind: 'text', key: 'userName', label: 'User name', maxLength: 64 },
					{ kind: 'text', key: 'userInitials', label: 'Initials', maxLength: 2 },
					{
						kind: 'select',
						key: 'officeTheme',
						label: 'Office Theme',
						info: 'Colorful gives the status bar the Visio colour, White keeps it neutral and Black is the dark theme.',
						choices: [
							{ value: 'colorful', label: 'Colorful' },
							{ value: 'neutral', label: 'White' },
							{ value: 'dark', label: 'Black' },
						],
					},
				],
			},
		],
	},
	{
		id: 'proofing',
		label: 'Proofing',
		description: 'Change how Visio corrects and formats your text.',
		disabled: 'Not available yet. Spelling and AutoCorrect need rich text editing.',
		sections: [],
	},
	{
		id: 'save',
		label: 'Save',
		description: 'Customize how drawings are saved.',
		disabled:
			'Not available yet. Drawings are saved as downloaded copies; AutoRecover is not kept.',
		sections: [],
	},
	{
		id: 'language',
		label: 'Language',
		description: 'Set the Office Language Preferences.',
		disabled: 'Not available yet. The viewer is English only.',
		sections: [],
	},
	{
		id: 'advanced',
		label: 'Advanced',
		description: 'Advanced options for working with Visio.',
		sections: [
			{
				id: 'editing',
				title: 'Editing options',
				controls: [
					{
						kind: 'number',
						key: 'undoLevels',
						label: 'Number of undo levels',
						min: 1,
						max: 99,
						...disabled('The history depth is fixed.'),
					},
					{
						kind: 'toggle',
						key: 'autoSizeText',
						label: 'Auto-size text while editing',
						...disabled('Needs core text layout.'),
					},
				],
			},
		],
	},
	{
		id: 'ribbon',
		label: 'Customize Ribbon',
		description: 'Customize the Ribbon and keyboard shortcuts.',
		disabled: 'Not available yet. The ribbon layout is fixed.',
		sections: [],
	},
	{
		id: 'qat',
		label: 'Quick Access Toolbar',
		description: 'Customize the Quick Access Toolbar.',
		disabled: 'Not available yet. The Quick Access Toolbar shows Undo and Redo.',
		sections: [],
	},
	{
		id: 'add-ins',
		label: 'Add-ins',
		description: 'View and manage Microsoft Office Add-ins.',
		disabled: 'Not available. Add-ins and macros never run in this viewer.',
		sections: [],
	},
	{
		id: 'trust',
		label: 'Trust Center',
		description: 'Help keep your documents safe and your computer secure and healthy.',
		disabled: 'Not available. Documents stay local and active content is never run.',
		sections: [],
	},
];

type OptionsDialog = HTMLElement & {
	categories: readonly OfficeOptionCategory[];
	values: OfficeOptionValues;
	category: string;
	show(): void;
};
type Account = HTMLElement & { profile: OfficeProfile };

/** The status bar's look: Visio's product colour ("Colorful") or the neutral suite bar. */
export type StatusBarTheme = 'colorful' | 'neutral';
const THEME_KEY = 'ooxml-visio-office-theme';
export const isStatusBarTheme = (value: unknown): value is StatusBarTheme =>
	value === 'colorful' || value === 'neutral';
/** The Office Theme remembered on this device, if any (storage may be unavailable). */
export function readStatusBarTheme(): StatusBarTheme | undefined {
	try {
		const stored = globalThis.localStorage?.getItem(THEME_KEY);
		return isStatusBarTheme(stored) ? stored : undefined;
	} catch {
		return undefined;
	}
}
function writeStatusBarTheme(theme: StatusBarTheme): void {
	try {
		globalThis.localStorage?.setItem(THEME_KEY, theme);
	} catch {
		// Kept for this session only.
	}
}

/** Office Theme as Options offers it: the two light looks, or the dark theme. */
export type OfficeThemeChoice = StatusBarTheme | 'dark';
const isOfficeThemeChoice = (value: unknown): value is OfficeThemeChoice =>
	value === 'dark' || isStatusBarTheme(value);

function profileValues(profile: OfficeProfile, officeTheme: OfficeThemeChoice): OfficeOptionValues {
	return {
		officeTheme,
		miniToolbar: false,
		livePreview: false,
		screenTips: 'descriptions',
		undoLevels: 20,
		autoSizeText: false,
		userName: profile.displayName,
		userInitials: profile.initial ?? '',
	};
}

/** The Options dialog element. Built once and appended to the viewer's shadow root. */
export function createOptionsDialog(doc: Document): HTMLElement {
	const dialog = doc.createElement('office-ui-options-dialog') as OptionsDialog;
	dialog.setAttribute('heading', 'Visio Options');
	dialog.categories = VISIO_OPTION_CATEGORIES;
	return dialog;
}

/**
 * File > Account and File > Options share one local profile. Edits in either are written to the
 * suite-wide profile store, mirrored into the other and reported through `onProfile`.
 */
export class ViewerProfile {
	#profile: OfficeProfile = readOfficeProfile();
	readonly #dialog: OptionsDialog;
	readonly #account: Account | null;
	constructor(
		root: ShadowRoot,
		private readonly onProfile: (profile: OfficeProfile) => void = () => {},
		/** Reads and applies the Office Theme on the viewer element. */
		private readonly theme: { get(): OfficeThemeChoice; set(theme: OfficeThemeChoice): void } = {
			get: () => 'neutral',
			set: () => {},
		},
	) {
		this.#dialog = root.querySelector<OptionsDialog>('office-ui-options-dialog')!;
		this.#account = root.querySelector<Account>('office-ui-account');
		this.#sync();
	}
	get profile(): OfficeProfile {
		return { ...this.#profile };
	}
	/** Open Visio Options, on General as Visio does. */
	showOptions(category = 'general'): void {
		this.#dialog.values = profileValues(this.#profile, this.theme.get());
		this.#dialog.category = category;
		this.#dialog.show();
	}
	wire(): () => void {
		const Abort = this.#dialog.ownerDocument.defaultView?.AbortController ?? AbortController;
		const events = new Abort();
		const options = { signal: events.signal };
		this.#dialog.addEventListener(
			'office-options-change',
			(event) => {
				const { values } = (event as OfficeOptionsChangeEvent).detail;
				if (isOfficeThemeChoice(values.officeTheme) && values.officeTheme !== this.theme.get()) {
					this.theme.set(values.officeTheme);
					// The light looks are remembered here; light or dark is the host's preference.
					if (values.officeTheme !== 'dark') writeStatusBarTheme(values.officeTheme);
				}
				const initial = String(values.userInitials ?? '').trim();
				this.#update({
					displayName: String(values.userName ?? '').trim(),
					avatarColor: this.#profile.avatarColor,
					...(initial ? { initial } : {}),
				});
			},
			options,
		);
		this.#account?.addEventListener(
			'office-profile-change',
			(event) => this.#update((event as OfficeProfileChangeEvent).detail.profile),
			options,
		);
		return () => events.abort();
	}
	#update(profile: OfficeProfile): void {
		// Kept for this session even when storage is unavailable (private browsing).
		this.#profile = sanitizeOfficeProfile(profile);
		writeOfficeProfile(this.#profile);
		this.#sync();
		this.onProfile(this.profile);
	}
	#sync(): void {
		if (this.#account) this.#account.profile = this.#profile;
		this.#dialog.values = profileValues(this.#profile, this.theme.get());
	}
}
