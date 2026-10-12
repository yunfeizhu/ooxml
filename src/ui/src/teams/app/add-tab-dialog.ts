import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit';
import {
	contentUrl,
	detectContentKind,
	filterFiles,
	type ChannelTab,
	type FileEntry,
	type TabContent,
	type TeamsClient,
} from 'ooxml-core/teams';
import css from './add-tab-dialog.css?raw';

const APPS = [
	{ id: 'docx', label: 'Word', kind: 'docx', letter: 'W' },
	{ id: 'xlsx', label: 'Excel', kind: 'xlsx', letter: 'X' },
	{ id: 'pptx', label: 'PowerPoint', kind: 'pptx', letter: 'P' },
	{ id: 'vsdx', label: 'Visio', kind: 'vsdx', letter: 'V' },
	{ id: 'markdown', label: 'Markdown', kind: 'markdown', letter: 'M' },
	{ id: 'site', label: 'Static site', kind: 'website', letter: 'H' },
	{ id: 'text', label: 'Text', kind: 'text', letter: 'T' },
	{ id: 'website', label: 'Website', kind: null, letter: '↗' },
] as const;
type AppId = (typeof APPS)[number]['id'];
type AddTab = (
	name: string,
	content: TabContent,
	channelId: string,
	client: TeamsClient,
	postToChannel: boolean,
) => ChannelTab | 'canceled' | null;
const fileKey = (file: FileEntry): string => JSON.stringify([file.messageId, file.name, file.url]);

/** Supported apps configure existing channel content. Creation stays with the owning host/core. */
export class TeamsAddTabDialog extends LitElement {
	static override styles = unsafeCSS(css);
	static override properties = {
		open: { type: Boolean },
		client: { attribute: false },
		channelId: { attribute: false },
		channelName: { attribute: false },
		files: { attribute: false },
		add: { attribute: false },
		app: { state: true },
		query: { state: true },
		selectedKey: { state: true },
		name: { state: true },
		url: { state: true },
		error: { state: true },
		postToChannel: { state: true },
	};
	declare open: boolean;
	declare client: TeamsClient | null;
	declare channelId: string;
	declare channelName: string;
	declare files: FileEntry[];
	declare add: AddTab | null;
	declare app: AppId | null;
	declare query: string;
	declare selectedKey: string;
	declare name: string;
	declare url: string;
	declare error: string;
	declare postToChannel: boolean;
	private owner: TeamsClient | null = null;
	private context = '';
	private contextName = '';
	constructor() {
		super();
		this.open = false;
		this.client = null;
		this.channelId = '';
		this.channelName = '';
		this.files = [];
		this.add = null;
		this.app = null;
		this.query = '';
		this.selectedKey = '';
		this.name = '';
		this.url = '';
		this.error = '';
		this.postToChannel = true;
	}
	protected override willUpdate(changed: PropertyValues<this>): void {
		if (changed.has('open') && this.open) {
			this.owner = this.client;
			this.context = this.channelId;
			this.contextName = this.channelName;
			this.app = null;
			this.query = '';
			this.selectedKey = '';
			this.name = '';
			this.url = '';
			this.error = '';
			this.postToChannel = true;
		}
	}
	protected override updated(changed: PropertyValues<this>): void {
		const dialog = this.renderRoot.querySelector('dialog')!;
		if (this.open && !dialog.open) dialog.showModal();
		else if (!this.open && dialog.open) dialog.close();
		if (changed.has('app') && this.open)
			this.renderRoot
				.querySelector<HTMLElement>(this.app ? '[data-configure]' : '[data-first-app]')
				?.focus();
	}
	private close(): void {
		this.dispatchEvent(new CustomEvent('teams-add-tab-close', { bubbles: true, composed: true }));
	}
	private get current(): boolean {
		return (
			!!this.owner &&
			this.owner === this.client &&
			this.context === this.channelId &&
			this.owner.getState().selectedChannelId === this.context &&
			this.owner.getState().channels.some((channel) => channel.id === this.context)
		);
	}
	private eligible(kind: string): FileEntry[] {
		return this.files.filter(
			(file) =>
				detectContentKind(file.name, file.mime) === kind &&
				!!contentUrl(file.url, this.ownerDocument.baseURI),
		);
	}
	private get selected(): FileEntry | undefined {
		const app = APPS.find((entry) => entry.id === this.app);
		return app?.kind
			? this.eligible(app.kind).find((file) => fileKey(file) === this.selectedKey)
			: undefined;
	}
	private availableLabel(kind: string): string {
		const count = this.eligible(kind).length;
		return `${count} shared ${count === 1 ? 'file' : 'files'}`;
	}
	private choose(app: AppId): void {
		this.app = app;
		this.query = '';
		this.selectedKey = '';
		this.name = '';
		this.url = '';
		this.error = '';
	}
	private submit(event: SubmitEvent): void {
		event.preventDefault();
		this.error = '';
		if (!this.current || !this.owner || !this.add) {
			this.error = 'The channel changed. Close this dialog and try again.';
			return;
		}
		if (this.app === 'website' && !contentUrl(this.url, this.ownerDocument.baseURI)) {
			this.error = 'Enter a valid http or https website URL.';
			return;
		}
		const content: TabContent | null =
			this.app === 'website'
				? { type: 'website', url: this.url }
				: this.selected
					? { type: 'file', attachment: this.selected }
					: null;
		if (!content) {
			this.error = 'Choose a file shared in this channel.';
			return;
		}
		const result = this.add(this.name, content, this.context, this.owner, this.postToChannel);
		if (!result) this.error = 'Enter a tab name and valid content.';
	}
	protected override render() {
		const app = APPS.find((entry) => entry.id === this.app);
		const files = app?.kind ? filterFiles(this.eligible(app.kind), this.query) : [];
		return html`<dialog aria-label="Add a tab" @cancel=${this.close} @close=${this.close}>
			<header>
				<h1>Add a tab</h1>
				<button type="button" aria-label="Close add tab" @click=${this.close}>×</button>
			</header>
			${
				!app
					? html`<section>
							<h2>Choose an app</h2>
							<p>Pin content to # ${this.contextName} so everyone in the channel can find it.</p>
							<div class="apps">
								${APPS.map(
									(entry, index) =>
										html`<button
											type="button"
											class="app"
											aria-label=${`Choose ${entry.label}`}
											?data-first-app=${index === 0}
											?autofocus=${index === 0}
											@click=${() => this.choose(entry.id)}
										>
											<span class="badge" data-kind=${entry.kind ?? 'other'}>${entry.letter}</span
											><strong>${entry.label}</strong>
											<small
												>${entry.kind ? this.availableLabel(entry.kind) : 'Add a web address'}</small
											>
										</button>`,
								)}
							</div>
							<p class="hint">File tabs use files already shared in this channel.</p>
						</section>`
					: html`<form @submit=${this.submit}>
							<div class="app-heading">
								<span class="badge" data-kind=${app.kind ?? 'other'}>${app.letter}</span>
								<h2>${app.label}</h2>
								<button
									type="button"
									@click=${() => {
										this.app = null;
										this.error = '';
									}}
								>
									Back
								</button>
							</div>
							<label
								>Tab name<input
									data-configure
									name="name"
									maxlength="80"
									required
									.value=${this.name}
									@input=${(event: Event) => {
										this.name = (event.target as HTMLInputElement).value;
										this.error = '';
									}}
							/></label>
							${
								!app.kind
									? html`<label
												>Tab website URL<input
													type="url"
													required
													maxlength="2048"
													placeholder="https://example.com"
													.value=${this.url}
													@input=${(event: Event) => {
														this.url = (event.target as HTMLInputElement).value;
														this.error = '';
													}}
											/></label>
											<p class="hint">
												Some websites block embedding. Their link remains available from the
												preview.
											</p>`
									: html`<label
												>Search shared files<input
													type="search"
													.value=${this.query}
													@input=${(event: Event) => (this.query = (event.target as HTMLInputElement).value)}
											/></label>
											<fieldset class="files">
												<legend>Choose a file</legend>
												${files.map(
													(file) =>
														html`<label class="file"
															><input
																type="radio"
																name="shared-file"
																.value=${fileKey(file)}
																.checked=${this.selectedKey === fileKey(file)}
																@change=${() => {
																	this.selectedKey = fileKey(file);
																	this.name = file.name;
																	this.error = '';
																}}
															/><span
																><strong>${file.name}</strong
																><small>Shared by ${file.author}</small></span
															></label
														>`,
												)}
												${files.length ? nothing : html`<p class="hint">${this.query ? 'No matching files.' : `No ${app.label} files are shared in this channel. Upload a file from Shared first.`}</p>`}
											</fieldset>
											${this.selected ? html`<p class="hint">Selected: ${this.selected.name}</p>` : this.selectedKey ? html`<p role="alert">This file is no longer shared in this channel.</p>` : nothing}`
							}
							${!this.current ? html`<p role="alert">The channel changed. Close this dialog and try again.</p>` : nothing}
							${this.error ? html`<p role="alert">${this.error}</p>` : nothing}
							<label class="post-choice"
								><input
									type="checkbox"
									.checked=${this.postToChannel}
									@change=${(event: Event) => (this.postToChannel = (event.target as HTMLInputElement).checked)}
								/>Post to the channel about this tab</label
							>
							<footer>
								<button type="button" @click=${this.close}>Cancel</button
								><button
									type="submit"
									class="primary"
									?disabled=${!this.current || !this.name.trim() || (app.kind ? !this.selected : !this.url.trim())}
								>
									Save
								</button>
							</footer>
						</form>`
			}
		</dialog>`;
	}
}
export function defineTeamsAddTabDialog(): void {
	if (!customElements.get('teams-add-tab-dialog'))
		customElements.define('teams-add-tab-dialog', TeamsAddTabDialog);
}
