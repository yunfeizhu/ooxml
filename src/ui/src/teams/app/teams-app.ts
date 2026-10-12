// <teams-app>: one reactive element, one template, one CSS file. All collaboration and call logic
// lives in `createTeamsClient` (ooxml-core/teams); the visual pieces are ooxml-ui elements. This
// file only decides what is on screen (`render`) and forwards user intent to client actions.
import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit';
import {
	type FileUploader,
	type ChannelTab,
	type OfficeKind,
	type TeamsClient,
	type TeamsServerConfig,
	type TeamsState,
	type DraftContext,
	type TabContent,
	parseServerConfig,
} from 'ooxml-core/teams';
// Registered from the leaf modules, not the package root: the root imports this folder through
// `teams/index`, so importing it back would make `OFFICE_UI_TAGS` read `TEAMS_TAGS` too early.
import { registerControls } from '../../controls';
import { definePresence } from '../../presence';
import { installOfficeUiTheme, THEME_CSS } from '../../theme';
import { registerTeams } from '../index';
import { TeamsController } from './controller';
import { defineTeamsContentPreview, type FileEmbeds, type SaveFileCopy } from './content-preview';
import { defineTeamsChannelTab } from './channel-tab';
import { defineTeamsFilesPanel } from './files-panel';
import { defineTeamsSettings, type TeamsTheme } from './teams-settings';
import {
	loadConfig,
	loadIdentity,
	safeStorage,
	saveConfig,
	saveIdentity,
	type Identity,
} from './storage';
import css from './teams-app.css?raw';
import { threadPane } from './thread-pane';
import { followedThreads } from './followed-threads';
import { draftList } from './draft-list';
import { filePopoutDetail, filePopoutUrl } from './file-popout';
import { messageTransfers } from './message-transfers';
import { defineTeamsProfileMenu } from './profile-menu';
import { defineTeamsAddTabDialog } from './add-tab-dialog';
import { icon } from '../icons';
import { defineTeamsNavigationDrawer } from './navigation-drawer';
import { defineTeamsCreateChannelDialog } from './create-channel-dialog';

export type { FileUploader } from 'ooxml-core/teams';
export interface OpenFileDetail {
	/** Channel captured when content opens, so saving cannot target a later selection. */
	channelId?: string;
	attachment: {
		name: string;
		kind: OfficeKind;
		size?: number | undefined;
		url?: string | undefined;
		mime?: string | undefined;
	};
	/** The resolved URL, signed when the file lives on your authenticated server. */
	url: string | undefined;
}
export type FileOpeners = Partial<Record<OfficeKind, (detail: OpenFileDetail) => void>>;

type RailView = 'teams' | 'calls' | 'files' | 'followed' | 'drafts';
type Panel = '' | 'chat' | 'people';
const LOCAL_THEME = THEME_CSS.replaceAll(
	':root[data-office-theme="dark"]',
	':host([data-office-theme="dark"])',
)
	.replaceAll(':root:not([data-office-theme="light"])', ':host([data-office-theme="system"])')
	.replaceAll(':root', ':host([data-office-theme])');
const RAIL = [
	{ id: 'teams', label: 'Teams', icon: 'users' },
	{ id: 'calls', label: 'Calls', icon: 'phone' },
	{ id: 'files', label: 'Files', icon: 'folder' },
	{ id: 'followed', label: 'Followed threads', icon: 'chat' },
	{ id: 'drafts', label: 'Drafts', icon: 'chat' },
] as const;

export class TeamsApp extends LitElement {
	static override styles = [unsafeCSS(LOCAL_THEME), unsafeCSS(css)];
	static override properties = {
		workspaceId: { type: String, attribute: 'workspace-id' },
		userName: { type: String, attribute: 'user-name' },
		userId: { type: String, attribute: 'user-id' },
		serverConfig: { type: String, attribute: 'server-config' },
		config: { attribute: false },
		uploadFile: { attribute: false },
		openers: { attribute: false },
		embeds: { attribute: false },
		preview: { state: true },
		addingTab: { state: true },
		creatingChannel: { state: true },
		rail: { state: true },
		tab: { state: true },
		panel: { state: true },
		meeting: { state: true },
		settingsOpen: { state: true },
		navigationOpen: { state: true },
		toast: { state: true },
		identity: { state: true },
		followedUnreadOnly: { state: true },
		theme: { state: true },
		fileOpenPreference: { state: true },
		chatDensity: { state: true },
		showAppNames: { state: true },
	};
	declare workspaceId: string;
	declare userName: string;
	declare userId: string;
	declare serverConfig: string;
	/** Server settings. Omit to use the settings dialog (remembered in this browser) or local mode. */
	declare config: TeamsServerConfig | null;
	/** Where attachments go. Default: your server's `/files` endpoint. */
	declare uploadFile: FileUploader | undefined;
	/** Per-product openers override the built-in preview. */
	declare openers: FileOpeners;
	/** Host embedding pages, for example a PowerPoint viewer accepting a file URL. */
	declare embeds: FileEmbeds;
	declare preview: OpenFileDetail | null;
	declare rail: RailView;
	declare tab: string;
	declare addingTab: boolean;
	declare creatingChannel: boolean;
	declare panel: Panel;
	declare meeting: boolean;
	declare settingsOpen: boolean;
	declare navigationOpen: boolean;
	declare toast: string;
	declare identity: Identity | null;
	declare followedUnreadOnly: boolean;
	declare theme: TeamsTheme;
	declare fileOpenPreference: 'teams' | 'browser';
	declare chatDensity: 'comfy' | 'compact';
	declare showAppNames: boolean;

	private readonly teams = new TeamsController(this, (text) => this.notify(text));
	private toastTimer: ReturnType<typeof setTimeout> | undefined;
	private openRequest = 0;
	private retainedTab: ChannelTab | undefined;
	private themeStorageKey = '';
	private readonly popoutRequested =
		new URL(globalThis.location?.href ?? 'https://workspace.invalid').searchParams.get(
			'openteams-file',
		) === '1';
	private readonly popout = filePopoutDetail(
		globalThis.location?.href ?? 'https://workspace.invalid',
	);

	constructor() {
		super();
		this.workspaceId = 'demo';
		this.userName = '';
		this.userId = '';
		this.serverConfig = '';
		this.config = null;
		this.uploadFile = undefined;
		this.openers = {};
		this.embeds = {};
		this.preview = null;
		this.retainedTab = undefined;
		this.addingTab = false;
		this.creatingChannel = false;
		this.rail = 'teams';
		this.tab = 'posts';
		this.panel = '';
		this.meeting = false;
		this.settingsOpen = false;
		this.navigationOpen = false;
		this.toast = '';
		this.identity = null;
		this.followedUnreadOnly = false;
		this.theme = 'system';
		this.fileOpenPreference = 'teams';
		this.chatDensity = 'comfy';
		this.showAppNames = true;
	}

	/** The core client behind this element, for hosts that want the raw actions. */
	get client(): TeamsClient | null {
		return this.teams.client;
	}

	override connectedCallback(): void {
		installOfficeUiTheme();
		registerControls();
		definePresence();
		registerTeams();
		defineTeamsSettings();
		defineTeamsContentPreview();
		defineTeamsChannelTab();
		defineTeamsFilesPanel();
		defineTeamsProfileMenu();
		defineTeamsAddTabDialog();
		defineTeamsNavigationDrawer();
		defineTeamsCreateChannelDialog();
		super.connectedCallback();
	}

	// ---- lifecycle --------------------------------------------------------------------------
	private resolveConfig(): TeamsServerConfig {
		if (this.config) return this.config;
		if (this.serverConfig) {
			try {
				return parseServerConfig(JSON.parse(this.serverConfig)).config;
			} catch {
				// An invalid attribute falls through to the remembered settings.
			}
		}
		return loadConfig() ?? parseServerConfig({}).config;
	}

	protected override willUpdate(changed: PropertyValues<this>): void {
		if (this.popoutRequested) return;
		const restart = [
			'workspaceId',
			'userName',
			'userId',
			'serverConfig',
			'config',
			'identity',
		].some((k) => changed.has(k as never));
		if (!restart && this.teams.client) return;
		this.preview = null;
		this.tab = 'posts';
		this.addingTab = false;
		this.creatingChannel = false;
		this.navigationOpen = false;
		this.settingsOpen = false;
		this.openRequest++;
		const named = this.userName
			? { id: this.userId || loadIdentity()?.id || crypto.randomUUID(), name: this.userName }
			: (this.identity ?? loadIdentity());
		if (this.userName && !this.userId) saveIdentity(named!);
		if (!named) return this.teams.stop();
		const workspaceId = /^[\w-]{1,100}$/u.test(this.workspaceId) ? this.workspaceId : 'demo';
		this.themeStorageKey = `teams:theme:${encodeURIComponent(workspaceId)}:${encodeURIComponent(named.id)}`;
		const rememberedTheme = safeStorage.getItem(this.themeStorageKey);
		if (!this.hasAttribute('host-theme'))
			this.theme =
				rememberedTheme === 'dark' || rememberedTheme === 'light' ? rememberedTheme : 'system';
		this.applyTheme();
		this.showAppNames =
			safeStorage.getItem(this.themeStorageKey.replace('teams:theme:', 'teams:app-names:')) !==
			'false';
		this.chatDensity =
			safeStorage.getItem(this.themeStorageKey.replace('teams:theme:', 'teams:density:')) ===
			'compact'
				? 'compact'
				: 'comfy';
		this.fileOpenPreference =
			safeStorage.getItem(this.themeStorageKey.replace('teams:theme:', 'teams:file-open:')) ===
			'browser'
				? 'browser'
				: 'teams';
		this.teams.start({
			workspaceId,
			user: named,
			config: this.resolveConfig(),
			storage: safeStorage,
			...(this.uploadFile ? { uploadFile: this.uploadFile } : {}),
		});
		this.dispatchEvent(
			new CustomEvent('teams-ready', { detail: { user: named }, bubbles: true, composed: true }),
		);
	}

	protected override updated(): void {
		this.setAttribute('data-chat-density', this.chatDensity);
		const state = this.teams.state;
		if (
			state?.thread &&
			document.visibilityState === 'visible' &&
			this.renderRoot.querySelector('.thread-pane')
		)
			this.teams.client?.markThreadRead(state.selectedChannelId, state.thread.root.id);
	}

	private notify(text: string): void {
		this.toast = text;
		clearTimeout(this.toastTimer);
		this.toastTimer = setTimeout(() => (this.toast = ''), 4000);
	}

	// ---- intent -> client actions -----------------------------------------------------------
	private async openFile(
		a: OpenFileDetail['attachment'],
		mode?: 'teams' | 'browser',
	): Promise<void> {
		if (!this.canLeaveContent()) return;
		const browser =
			mode === 'browser' ||
			(!mode && a.kind !== 'other' && a.kind !== 'vsdx' && this.fileOpenPreference === 'browser');
		const popout = browser ? globalThis.open('about:blank', '_blank') : null;
		if (popout) popout.opener = null;
		const request = ++this.openRequest;
		const channelId =
			(a as { channelId?: string }).channelId ?? this.teams.state?.selectedChannelId;
		const url = await this.teams.client?.fileUrl(a);
		if (request !== this.openRequest || !this.isConnected) {
			popout?.close();
			return;
		}
		if (!this.canLeaveContent()) {
			popout?.close();
			return;
		}
		const detail: OpenFileDetail = { attachment: a, url, ...(channelId ? { channelId } : {}) };
		if (
			!this.dispatchEvent(
				new CustomEvent('teams-open-file', {
					detail,
					bubbles: true,
					composed: true,
					cancelable: true,
				}),
			)
		) {
			popout?.close();
			return;
		}
		const opener = this.openers[a.kind];
		if (opener) {
			popout?.close();
			return opener(detail);
		}
		if (browser && url) {
			const target = filePopoutUrl(detail, this.ownerDocument.location.href);
			if (popout && target) {
				popout.location.replace(target);
				return;
			}
			popout?.close();
			this.notify('Allow popups to open this file in a browser tab');
			return;
		}
		popout?.close();
		if (url) this.preview = detail;
		else this.notify('This file was shared by name only');
	}

	/** Preview a host-provided website or file without changing shared conversation state. */
	previewContent(detail: OpenFileDetail): void {
		if (!this.canLeaveContent()) return;
		this.openRequest++;
		this.preview = detail;
	}

	private canLeaveContent(): boolean {
		const direct = this.shadowRoot?.querySelector<HTMLElement & { canLeave(): boolean }>(
			'teams-content-preview',
		);
		const nested = this.shadowRoot
			?.querySelector('teams-channel-tab')
			?.shadowRoot?.querySelector<HTMLElement & { canLeave(): boolean }>('teams-content-preview');
		return (direct ?? nested)?.canLeave() ?? true;
	}

	private closePreview(): boolean {
		if (!this.canLeaveContent()) return false;
		this.openRequest++;
		this.preview = null;
		return true;
	}

	override disconnectedCallback(): void {
		this.openRequest++;
		this.preview = null;
		clearTimeout(this.toastTimer);
		super.disconnectedCallback();
	}

	private createChannel(): void {
		this.creatingChannel = true;
	}

	private commitChannel(name: string, description: string, client: TeamsClient | null): boolean {
		if (!this.creatingChannel || !client || client !== this.client || !this.closePreview())
			return false;
		client.createChannel(name, description);
		this.creatingChannel = false;
		this.tab = 'posts';
		this.rail = 'teams';
		this.meeting = false;
		void this.closeNavigation(true);
		void this.focusCreatedChannel();
		return true;
	}
	private async focusCreatedChannel(): Promise<void> {
		await this.updateComplete;
		await this.renderRoot.querySelector<LitElement>('teams-create-channel-dialog')?.updateComplete;
		const heading = this.renderRoot.querySelector<HTMLElement>('main h1');
		if (heading && !this.creatingChannel) {
			heading.tabIndex = -1;
			heading.focus();
		}
	}

	private onCallAction(action: string): void {
		const c = this.teams.client;
		if (!c) return;
		if (action === 'chat' || action === 'people') this.panel = this.panel === action ? '' : action;
		else if (action === 'leave') {
			this.meeting = false;
			this.panel = '';
			c.leaveCall();
		} else if (action === 'mic') c.toggleMic();
		else if (action === 'camera') void c.toggleCamera();
		else if (action === 'screen') void c.toggleScreenShare();
		else if (action === 'hand') c.toggleHand();
	}

	private startMeeting(channelId?: string): void {
		if (!this.closePreview()) return;
		void this.teams.client?.openCall(channelId);
		void this.closeNavigation(true);
		this.meeting = true;
		this.rail = 'teams';
	}

	private selectChannel(id: string): boolean {
		if (!this.closePreview()) return false;
		this.settingsOpen = false;
		this.addingTab = false;
		this.creatingChannel = false;
		this.teams.client?.select(id);
		this.teams.client?.search('');
		this.meeting = false;
		this.tab = 'posts';
		this.rail = 'teams';
		void this.closeNavigation(true);
		return true;
	}

	private async closeNavigation(navigated = false): Promise<void> {
		if (!this.navigationOpen) return;
		this.navigationOpen = false;
		await this.updateComplete;
		const drawer = this.renderRoot.querySelector<LitElement>('teams-navigation-drawer');
		await drawer?.updateComplete;
		if (this.navigationOpen || !this.isConnected) return;
		const trigger = this.renderRoot.querySelector<HTMLButtonElement>('[data-open-navigation]');
		const heading =
			this.renderRoot.querySelector<HTMLElement>('main h1') ??
			this.renderRoot.querySelector<HTMLElement>('main');
		if (!navigated && trigger?.getClientRects().length) trigger.focus();
		else if (heading) {
			heading.tabIndex = -1;
			heading.focus();
		}
	}

	private askSettings(): void {
		this.navigationOpen = false;
		this.settingsOpen = true;
	}

	private async closeSettings(): Promise<void> {
		this.settingsOpen = false;
		await this.updateComplete;
		if (!this.isConnected || this.settingsOpen) return;
		this.renderRoot
			.querySelector('office-ui-menu-button[label="Settings and more"]')
			?.shadowRoot?.querySelector<HTMLButtonElement>('button')
			?.focus();
	}

	private applyTheme(): void {
		if (this.theme === 'system') this.removeAttribute('data-office-theme');
		else this.setAttribute('data-office-theme', this.theme);
	}

	// ---- template ---------------------------------------------------------------------------
	protected override render() {
		if (this.popoutRequested)
			return this.popout
				? html`<div class="popout-view">
						<teams-content-preview
							.detail=${this.popout}
							@teams-preview-close=${() => globalThis.close()}
						></teams-content-preview>
					</div>`
				: html`<p role="alert">The file preview link is invalid.</p>`;
		const s = this.teams.state;
		if (!s) return this.welcome();
		return html`
			<div
				class="shell"
				@office-chat-open-tab=${(event: CustomEvent<{ tabId: string }>) => {
					if (this.teams.state?.tabs.some((entry) => entry.id === event.detail.tabId))
						this.selectTab(event.detail.tabId);
					else this.notify('This tab is no longer available in this channel');
				}}
			>
				${this.topbar(s)}
				<div class="body">
					<office-ui-app-rail
						.hideLabels=${!this.showAppNames}
						.items=${RAIL.map((i) => ({ ...i, ...(i.id === 'calls' && s.channels.some((c) => c.live) ? { badge: s.channels.filter((c) => c.live).length } : {}) }))}
						selected=${this.rail}
						@office-rail-select=${(e: CustomEvent<{ id: RailView }>) => {
							if (!this.closePreview()) return;
							this.settingsOpen = false;
							this.rail = e.detail.id;
							this.meeting = false;
						}}
					></office-ui-app-rail>
					<aside class="side" ?inert=${this.settingsOpen}>${this.sidebar(s)}</aside>
					<main class="main" ?inert=${this.settingsOpen}>${this.main(s)}</main>
					<teams-settings
						embedded
						?open=${this.settingsOpen}
						.config=${this.resolveConfig()}
						.theme=${this.theme}
						.fileOpenPreference=${this.fileOpenPreference}
						.chatDensity=${this.chatDensity}
						.showAppNames=${this.showAppNames}
						@teams-settings-app-names=${(event: CustomEvent<{ show: boolean }>) => {
							if (typeof event.detail.show !== 'boolean') return;
							this.showAppNames = event.detail.show;
							safeStorage.setItem(
								this.themeStorageKey.replace('teams:theme:', 'teams:app-names:'),
								String(this.showAppNames),
							);
						}}
						@teams-settings-density=${(event: CustomEvent<{ density: 'comfy' | 'compact' }>) => {
							if (!['comfy', 'compact'].includes(event.detail.density)) return;
							this.chatDensity = event.detail.density;
							safeStorage.setItem(
								this.themeStorageKey.replace('teams:theme:', 'teams:density:'),
								this.chatDensity,
							);
						}}
						@teams-settings-file-open=${(
							event: CustomEvent<{ preference: 'teams' | 'browser' }>,
						) => {
							if (!['teams', 'browser'].includes(event.detail.preference)) return;
							this.fileOpenPreference = event.detail.preference;
							safeStorage.setItem(
								this.themeStorageKey.replace('teams:theme:', 'teams:file-open:'),
								this.fileOpenPreference,
							);
						}}
						.followSettings=${s.threadFollowSettings}
						.userName=${s.user.name}
						@teams-settings-theme=${(event: CustomEvent<{ theme: TeamsTheme }>) => {
							if (!['system', 'light', 'dark'].includes(event.detail.theme)) return;
							this.theme = event.detail.theme;
							this.applyTheme();
							safeStorage.setItem(this.themeStorageKey, this.theme);
						}}
						@teams-settings-follow=${(event: CustomEvent<Partial<typeof s.threadFollowSettings>>) => this.teams.client?.setThreadFollowSettings(event.detail)}
						@teams-settings-close=${() => void this.closeSettings()}
						@teams-settings-apply=${(e: CustomEvent<{ config: TeamsServerConfig }>) => {
							if (!this.closePreview()) return;
							saveConfig(e.detail.config);
							this.config = e.detail.config;
							this.settingsOpen = false;
							this.dispatchEvent(
								new CustomEvent('teams-config-change', {
									detail: e.detail,
									bubbles: true,
									composed: true,
								}),
							);
						}}
					></teams-settings>
				</div>
				<teams-create-channel-dialog
					?open=${this.creatingChannel}
					.create=${(name: string, description: string) => this.commitChannel(name, description, this.client)}
					@teams-create-channel-close=${() => (this.creatingChannel = false)}
				></teams-create-channel-dialog>
				<teams-navigation-drawer
					.heading=${this.rail === 'calls' ? 'Calls' : 'Teams and channels'}
					?open=${this.navigationOpen}
					@teams-navigation-close=${() => void this.closeNavigation()}
				>
					${this.navigationOpen ? this.sidebar(s) : nothing}
				</teams-navigation-drawer>
				${this.toast ? html`<div class="toast" role="status">${this.toast}</div>` : nothing}

				<teams-add-tab-dialog
					.open=${this.addingTab}
					.client=${this.teams.client}
					.channelId=${s.selectedChannelId}
					.channelName=${s.channel?.name ?? ''}
					.files=${s.files}
					.add=${(
						name: string,
						content: TabContent,
						channelId: string,
						client: TeamsClient,
						postToChannel: boolean,
					) => {
						if (client !== this.teams.client || client.getState().selectedChannelId !== channelId)
							return null;
						if (!this.closePreview()) return 'canceled';
						const tab = client.addTab(name, content, { postToChannel });
						if (tab) {
							this.retainedTab = tab;
							this.tab = tab.id;
							this.addingTab = false;
							this.creatingChannel = false;
						}
						return tab;
					}}
					@teams-add-tab-close=${() => (this.addingTab = false)}
				></teams-add-tab-dialog>
			</div>
		`;
	}

	private welcome() {
		return html`
			<div class="welcome">
				<form
					@submit=${(e: SubmitEvent) => {
						e.preventDefault();
						const name = new FormData(e.target as HTMLFormElement).get('name')?.toString().trim();
						if (!name) return;
						const identity = { id: crypto.randomUUID(), name };
						saveIdentity(identity);
						this.identity = identity;
					}}
				>
					<span class="logo">T</span>
					<h1>Welcome to Teams</h1>
					<p>Pick the name your colleagues will see.</p>
					<input
						name="name"
						placeholder="Your name"
						aria-label="Your name"
						maxlength="40"
						autocomplete="name"
						required
					/>
					<button type="submit">Continue</button>
				</form>
			</div>
		`;
	}

	private topbar(s: TeamsState) {
		return html`
			<header class="topbar">
				<div class="brand">
					<button
						type="button"
						class="navigation-toggle"
						data-open-navigation
						aria-label="Open navigation"
						title="Open navigation"
						aria-haspopup="dialog"
						aria-expanded=${String(this.navigationOpen)}
						@click=${() => (this.navigationOpen = true)}
					>
						${icon('navigation')}
					</button>
					<span class="logo">T</span><span>Teams</span>
				</div>
				<div class="search">
					<input
						type="search"
						placeholder="Search messages"
						aria-label="Search messages"
						.value=${s.searchQuery}
						@input=${(e: Event) => this.teams.client?.search((e.target as HTMLInputElement).value)}
					/>
					${
						s.searchQuery
							? html`<ul class="results" role="listbox" aria-label="Search results">
									${
										s.searchResults.length === 0
											? html`<li class="none">No results</li>`
											: s.searchResults.map(
													(h) =>
														html`<li>
															<button
																type="button"
																@click=${() => {
																	if (this.selectChannel(h.channelId)) {
																		this.teams.client?.search('');
																		void this.openThread(h.message.id);
																	}
																}}
															>
																<strong>${h.message.authorName}</strong>
																<span class="in">in # ${h.channelName}</span>
																<span class="snippet">${h.message.text.slice(0, 100)}</span>
															</button>
														</li>`,
												)
									}
								</ul>`
							: nothing
					}
				</div>
				<div class="me">
					<office-ui-menu-button
						label="Settings and more"
						icon="more"
						icon-only
						@office-command=${(event: CustomEvent<{ command: string }>) => {
							if (event.detail.command === 'teams-settings') this.askSettings();
						}}
					>
						<office-ui-menu-item label="Settings" command="teams-settings"></office-ui-menu-item>
					</office-ui-menu-button>
					<teams-profile-menu
						.state=${s}
						@teams-profile-status=${(
							event: CustomEvent<{ availability: 'available' | 'busy' | 'away' }>,
						) => {
							if (['available', 'busy', 'away'].includes(event.detail.availability))
								this.teams.client?.setAvailability(event.detail.availability);
						}}
					></teams-profile-menu>
				</div>
			</header>
		`;
	}

	private sidebar(s: TeamsState) {
		if (this.rail === 'calls') {
			const live = s.channels.filter((c) => c.live);
			return html`
				<h2>Calls</h2>
				<ul class="plain">
					${s.channels.map(
						(c) =>
							html`<li>
								<span># ${c.name}</span>
								<button
									type="button"
									class=${c.live ? 'join live' : 'join'}
									@click=${() => this.startMeeting(c.id)}
								>
									${c.live ? 'Join' : 'Meet now'}
								</button>
							</li>`,
					)}
				</ul>
				${live.length === 0 ? html`<p class="hint">Nobody is in a call right now.</p>` : nothing}
			`;
		}
		return html`
			<office-ui-channel-list
				heading="Channels"
				selected-id=${s.selectedChannelId}
				.channels=${s.channels}
				@office-channel-select=${(e: CustomEvent<{ id: string }>) => this.selectChannel(e.detail.id)}
				@office-channel-create=${this.createChannel}
			></office-ui-channel-list>
		`;
	}

	private main(s: TeamsState) {
		if (this.rail === 'drafts' && this.teams.client)
			return draftList(s, this.teams.client, (context) => void this.resumeDraft(context));
		if (this.preview)
			return html`<teams-content-preview
				.detail=${this.preview}
				.embeds=${this.embeds}
				.saveCopy=${this.saveCopyFor(this.preview, s)}
				@teams-preview-close=${this.closePreview}
			></teams-content-preview>`;
		if (this.rail === 'files') return this.allFiles(s);
		if (this.rail === 'followed' && this.teams.client)
			return followedThreads(
				s,
				this.teams.client,
				(thread) => {
					if (this.selectChannel(thread.channelId)) void this.openThread(thread.root.id);
				},
				this.followedUnreadOnly,
				(value) => {
					this.followedUnreadOnly = value;
				},
			);
		if (s.call && this.meeting) return this.meetingView(s);
		return html`
			${
				s.call && !this.meeting
					? html`<div class="callbar">
							You are in a call in # ${s.call.channelName}
							<button
								type="button"
								@click=${() => {
									if (this.selectChannel(s.call!.channelId)) this.meeting = true;
								}}
							>
								Return to call
							</button>
						</div>`
					: nothing
			}
			${this.conversation(s)}
		`;
	}

	private conversation(s: TeamsState, compact = false) {
		const channel = s.channel;
		const c = this.teams.client;
		const compose = s.editing ?? s.replyingTo;
		const sharedTab = s.tabs.find((t) => t.id === this.tab);
		if (sharedTab) this.retainedTab = sharedTab;
		const activeTab =
			sharedTab ??
			(this.retainedTab?.id === this.tab && this.retainedTab.channelId === s.selectedChannelId
				? this.retainedTab
				: undefined);
		return html`
			${
				compact
					? nothing
					: html`<header class="channel-head">
							<h1><span class="hash">#</span> ${channel?.name ?? 'No channel yet'}</h1>
							<nav class="tabs" role="tablist">
								${(['posts', 'files'] as const).map(
									(t) =>
										html`<button
											type="button"
											role="tab"
											aria-selected=${String(this.tab === t)}
											@click=${() => this.selectTab(t)}
										>
											${t === 'posts' ? 'Posts' : 'Shared'}
										</button>`,
								)}
								${s.tabs.map((t) => html`<button type="button" role="tab" aria-selected=${String(this.tab === t.id)} @click=${() => this.selectTab(t.id)}>${t.name}</button>`)}
							</nav>
							<button
								type="button"
								aria-label="Add tab"
								title="Add tab"
								?disabled=${!channel}
								@click=${() => (this.addingTab = !this.addingTab)}
							>
								+
							</button>
							${
								sharedTab
									? html`<button
											type="button"
											data-tab-conversation
											aria-label="Show tab conversation"
											title="Show tab conversation"
											aria-expanded=${String(s.thread?.root.tabId === sharedTab.id)}
											@click=${async () => {
												if (s.thread?.root.tabId === sharedTab.id) {
													await this.closeThread();
													return;
												}
												if (!c?.openTabConversation(sharedTab.id)) {
													this.notify('Could not open this tab conversation');
													return;
												}
												await Promise.resolve();
												await this.updateComplete;
												this.shadowRoot
													?.querySelector<HTMLElement>('[data-thread-heading]')
													?.focus();
											}}
										>
											${icon('chat')}
										</button>`
									: nothing
							}
							${
								sharedTab?.createdBy === s.user.id
									? html`<office-ui-menu-button
											label="Tab options"
											icon="more"
											icon-only
											@office-command=${(event: CustomEvent<{ command: string }>) => {
												if (event.detail.command === 'rename-tab') {
													const name = globalThis.prompt?.('Tab name', sharedTab.name)?.trim();
													if (name) c?.renameTab(sharedTab.id, name);
												} else if (event.detail.command === 'remove-tab') {
													if (!this.canLeaveContent()) return;
													if (
														globalThis.confirm?.(`Remove ${sharedTab.name} from this channel?`) ===
															true &&
														c?.removeTab(sharedTab.id)
													) {
														this.openRequest++;
														this.preview = null;
														this.tab = 'posts';
													}
												}
											}}
											><office-ui-menu-item
												label="Rename tab"
												command="rename-tab"
											></office-ui-menu-item
											><office-ui-menu-item
												label="Remove tab"
												command="remove-tab"
											></office-ui-menu-item
										></office-ui-menu-button>`
									: nothing
							}
							<span class="topic">${channel?.topic ?? ''}</span>
							<div class="people" aria-label="People online">
								${s.people.slice(0, 5).map((p) => html`<office-ui-avatar size="sm" name=${p.name} seed=${p.id} color=${p.color} presence=${p.availability}></office-ui-avatar>`)}
								${s.people.length > 5 ? html`<span class="more">+${s.people.length - 5}</span>` : nothing}
							</div>
							<button
								type="button"
								class="meet"
								?disabled=${!channel}
								@click=${() => this.startMeeting()}
							>
								${s.channels.find((x) => x.id === s.selectedChannelId)?.live ? 'Join call' : 'Meet now'}
							</button>
						</header>`
			}
			${c ? messageTransfers(s, c) : nothing}
			${activeTab && !sharedTab && !compact ? html`<p role="status">This tab was removed from the channel. Your open copy remains here until you close it.</p>` : nothing}
			${
				activeTab && !compact
					? html`<div
							class="conversation-grid tab-conversation"
							data-thread=${String(s.thread?.root.tabId === activeTab.id)}
						>
							<div class="conversation-main">
								<teams-channel-tab
									.tab=${activeTab}
									.client=${c ?? null}
									.embeds=${this.embeds}
									.canSave=${s.canUploadFiles}
									@teams-preview-close=${() => this.selectTab('posts')}
								></teams-channel-tab>
							</div>
							${
								s.thread?.root.tabId === activeTab.id && c
									? threadPane(
											s,
											c,
											(attachment) => void this.openFile(attachment),
											() => void this.closeThread(),
										)
									: nothing
							}
						</div>`
					: this.tab === 'files' && !compact
						? this.fileList(s.files, s)
						: html`<div class="conversation-grid" data-thread=${String(!!s.thread && !compact)}>
								<div class="conversation-main">
									<office-ui-chat-list
										.messages=${compact ? s.messages : s.posts}
										.replyCounts=${compact ? {} : s.replyCounts}
										self-id=${s.user.id}
										@office-chat-react=${(e: CustomEvent<{ messageId: string; emoji: string }>) => c?.toggleReaction(e.detail.messageId, e.detail.emoji)}
										@office-chat-thread=${(e: CustomEvent<{ messageId: string }>) => void this.openThread(e.detail.messageId)}
										@office-chat-reply=${(e: CustomEvent<{ messageId: string }>) => (compact ? c?.startReply(e.detail.messageId) : void this.openThread(e.detail.messageId, 'reply'))}
										@office-chat-edit=${(e: CustomEvent<{ messageId: string }>) => (compact ? c?.startEdit(e.detail.messageId) : void this.openThread(e.detail.messageId, 'edit'))}
										@office-chat-delete=${(e: CustomEvent<{ messageId: string }>) => globalThis.confirm?.('Delete this message?') !== false && c?.deleteMessage(e.detail.messageId)}
										@office-chat-open-file=${(e: CustomEvent<{ attachment: OpenFileDetail['attachment'] & { kind: OfficeKind } }>) => this.openFile(e.detail.attachment)}
									></office-ui-chat-list>
									${
										s.thread && !compact
											? nothing
											: html`<office-ui-chat-composer
													.typing=${s.typing}
													.replyingTo=${s.replyingTo?.authorName ?? null}
													.editing=${s.editing !== null}
													.value=${s.draft.text}
													.files=${s.draft.files}
													.missingFiles=${s.draft.missingFiles}
													@office-chat-draft=${(e: CustomEvent<TeamsState['draft']>) => c?.setDraft(e.detail)}
													?disabled=${!channel}
													placeholder=${channel ? `Message # ${channel.name}` : 'Create a channel first'}
													@office-chat-typing=${() => c?.notifyTyping()}
													@office-chat-cancel=${() => c?.cancelCompose()}
													@office-chat-send=${(e: CustomEvent<TeamsState['draft']>) => void c?.send(e.detail)}
													data-compose=${compose ? 'on' : 'off'}
												></office-ui-chat-composer>`
									}
								</div>
								${
									!compact && c
										? threadPane(
												s,
												c,
												(attachment) => void this.openFile(attachment),
												() => void this.closeThread(),
											)
										: nothing
								}
							</div>`
			}
		`;
	}

	private selectTab(id: string): void {
		if (!this.closePreview()) return;
		this.teams.client?.closeThread();
		this.tab = id;
		this.addingTab = false;
		this.creatingChannel = false;
	}

	private async openThread(id: string, action?: 'reply' | 'edit'): Promise<void> {
		const client = this.teams.client;
		client?.openThread(id);
		if (action === 'reply') client?.startReply(id);
		if (action === 'edit') client?.startEdit(id);
		await Promise.resolve();
		await this.updateComplete;
		this.shadowRoot?.querySelector<HTMLElement>('[data-thread-heading]')?.focus();
	}
	private async resumeDraft(context: DraftContext): Promise<void> {
		if (!this.closePreview() || !this.teams.client?.openDraft(context)) return;
		this.rail = 'teams';
		this.tab = 'posts';
		this.meeting = false;
		await Promise.resolve();
		await this.updateComplete;
		this.shadowRoot
			?.querySelector('office-ui-chat-composer')
			?.shadowRoot?.querySelector('textarea')
			?.focus();
	}
	private async closeThread(): Promise<void> {
		const client = this.teams.client;
		const root = client?.getState().thread?.root.id;
		client?.closeThread();
		await Promise.resolve();
		await this.updateComplete;
		const tabButton = this.shadowRoot?.querySelector<HTMLElement>('[data-tab-conversation]');
		if (tabButton) {
			tabButton.focus();
			return;
		}
		const list = this.shadowRoot?.querySelector('.conversation-main office-ui-chat-list');
		const message = Array.from(
			list?.shadowRoot?.querySelectorAll<HTMLElement>('[data-message-id]') ?? [],
		).find((element) => element.dataset.messageId === root);
		message?.querySelector<HTMLElement>('.thread-link, button[aria-label="Reply"]')?.focus();
	}

	private pinFile(file: TeamsState['files'][number]): void {
		if (!this.selectChannel(file.channelId ?? this.teams.state?.selectedChannelId ?? '')) return;
		const tab = this.teams.client?.addTab(
			file.name,
			{ type: 'file', attachment: file },
			{ postToChannel: true },
		);
		if (tab) this.selectTab(tab.id);
		else this.notify('This file needs an uploaded URL before it can be pinned');
	}

	private saveCopyFor(detail: OpenFileDetail, state: TeamsState): SaveFileCopy | undefined {
		const client = this.teams.client;
		const channelId = detail.channelId;
		if (!client || !channelId || !state.canUploadFiles) return undefined;
		return async (file, options) => {
			await client.saveFileCopy(channelId, file, options);
		};
	}

	private fileList(files: TeamsState['files'], state: TeamsState) {
		return html`<teams-files-panel
			.client=${this.teams.client}
			.files=${files}
			.channelId=${state.selectedChannelId}
			.channelName=${state.channel?.name ?? ''}
			.canUpload=${state.canUploadFiles}
			@teams-files-open=${(event: CustomEvent<{ attachment: OpenFileDetail['attachment']; mode?: 'teams' | 'browser' }>) => void this.openFile(event.detail.attachment, event.detail.mode)}
			@teams-files-browser=${(event: CustomEvent<{ attachment: OpenFileDetail['attachment'] }>) => void this.openFile(event.detail.attachment, 'browser')}
			@teams-files-pin=${(event: CustomEvent<{ attachment: TeamsState['files'][number] }>) => this.pinFile(event.detail.attachment)}
		></teams-files-panel>`;
	}

	private allFiles(s: TeamsState) {
		return html`<header class="channel-head">
				<h1>Files</h1>
				<span class="topic">Shared across your channels</span>
			</header>
			${this.fileList(s.allFiles, s)}`;
	}

	private meetingView(s: TeamsState) {
		const call = s.call!;
		if (call.phase === 'prejoin')
			return html`
				<office-ui-prejoin
					heading=${`# ${call.channelName}`}
					name=${s.user.name}
					.preview=${call.preview as unknown as MediaStream | null}
					?audio=${call.prejoin.audio}
					?video=${call.prejoin.video}
					@office-prejoin-change=${(e: CustomEvent<{ audio?: boolean; video?: boolean }>) => void this.teams.client?.setPrejoin(e.detail)}
					@office-prejoin-join=${() => void this.teams.client?.joinCall()}
					@office-prejoin-cancel=${() => ((this.meeting = false), this.teams.client?.leaveCall())}
				></office-ui-prejoin>
			`;
		const self = call.self;
		return html`
			<section class="meeting">
				<office-ui-call-controls
					heading=${`# ${call.channelName}`}
					started-at=${call.startedAt ?? 0}
					?mic=${self?.state.audio}
					?camera=${self?.state.video}
					?screen=${self?.state.screen}
					?hand=${self?.state.hand}
					?share-unavailable=${typeof navigator.mediaDevices?.getDisplayMedia !== 'function'}
					panel=${this.panel}
					@office-call-action=${(e: CustomEvent<{ action: string }>) => this.onCallAction(e.detail.action)}
				></office-ui-call-controls>
				<div class="stage">
					<office-ui-call-grid
						.participants=${call.participants.map((p) => ({
							id: p.id,
							name: p.name,
							self: p.self,
							stream: p.stream as unknown as MediaStream | null,
							audio: p.state.audio,
							video: p.state.video,
							screen: p.state.screen,
							hand: p.state.hand,
							connection: p.connection,
						}))}
					></office-ui-call-grid>
					${
						this.panel === 'chat'
							? html`<aside class="panel chat">${this.conversation(s, true)}</aside>`
							: this.panel === 'people'
								? html`<aside class="panel people-panel">
										<h2>People (${call.participants.length})</h2>
										<ul class="plain">
											${call.participants.map(
												(p) =>
													html`<li>
														<office-ui-avatar
															size="sm"
															name=${p.name}
															seed=${p.id}
														></office-ui-avatar>
														<span>${p.name}${p.self ? ' (you)' : ''}</span>
														${p.state.hand ? html`<span title="Hand raised">✋</span>` : nothing}
													</li>`,
											)}
										</ul>
									</aside>`
								: nothing
					}
				</div>
			</section>
		`;
	}
}

export function defineTeamsApp(
	registry: CustomElementRegistry | undefined = globalThis.customElements,
): void {
	if (registry && !registry.get('teams-app')) registry.define('teams-app', TeamsApp);
}
