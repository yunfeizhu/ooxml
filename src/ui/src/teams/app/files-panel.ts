import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit';
import {
	filterFiles,
	sortFiles,
	type FileSortField,
	type FileSortDirection,
	type Attachment,
	type FileEntry,
	type TeamsClient,
	type FileOperationOptions,
	type FileTransferProgress,
} from 'ooxml-core/teams';
import css from './files-panel.css?raw';
import { defineTeamsFileActions } from './file-actions';
import { defineMenuButton } from '../../menu/menu-button';
import { defineMenuItem } from '../../menu/menu-item';
import { icon } from '../icons';

/** File controls bind to channel-capturing core actions; uploaded bytes never enter UI state. */
export class TeamsFilesPanel extends LitElement {
	static override styles = unsafeCSS(css);
	static override properties = {
		client: { attribute: false },
		files: { attribute: false },
		channelId: { attribute: false },
		channelName: { attribute: false },
		canUpload: { type: Boolean },
		query: { state: true },
		creating: { state: true },
		sortField: { state: true },
		sortDirection: { state: true },
		busy: { state: true },
		error: { state: true },
		destination: { state: true },
		transfer: { state: true },
		canceled: { state: true },
	};
	declare client: TeamsClient | null;
	declare files: FileEntry[];
	declare channelId: string;
	declare channelName: string;
	declare canUpload: boolean;
	declare query: string;
	declare creating: boolean;
	declare sortField: FileSortField;
	declare sortDirection: FileSortDirection;
	declare busy: boolean;
	declare error: string;
	declare destination: string;
	declare transfer: FileTransferProgress | null;
	declare canceled: boolean;
	private active: AbortController | undefined;
	private retry: ((options: FileOperationOptions) => Promise<unknown>) | undefined;

	constructor() {
		super();
		this.client = null;
		this.files = [];
		this.channelId = '';
		this.channelName = '';
		this.canUpload = false;
		this.query = '';
		this.creating = false;
		this.sortField = 'ts';
		this.sortDirection = 'descending';
		this.busy = false;
		this.error = '';
		this.destination = '';
		this.transfer = null;
		this.canceled = false;
	}
	override disconnectedCallback(): void {
		this.active?.abort();
		super.disconnectedCallback();
	}
	override connectedCallback(): void {
		defineTeamsFileActions();
		defineMenuButton();
		defineMenuItem();
		super.connectedCallback();
	}
	protected override updated(changed: PropertyValues<this>): void {
		if (changed.has('client')) {
			this.active?.abort();
			this.active = undefined;
			this.busy = false;
			this.transfer = null;
			this.canceled = false;
			this.retry = undefined;
			this.error = '';
		}
	}
	private emit(
		action: 'open' | 'pin',
		attachment: FileEntry | (Attachment & { channelId: string }),
	): void {
		this.dispatchEvent(
			new CustomEvent(`teams-files-${action}`, {
				detail: { attachment },
				bubbles: true,
				composed: true,
			}),
		);
	}
	private async run(task: (options: FileOperationOptions) => Promise<unknown>): Promise<void> {
		if (this.busy) return;
		const client = this.client;
		const controller = new AbortController();
		this.active = controller;
		if (this.retry !== task) this.destination = this.channelName;
		this.busy = true;
		this.error = '';
		this.canceled = false;
		this.transfer = null;
		this.retry = task;
		try {
			await task({
				signal: controller.signal,
				onProgress: (progress) => {
					if (this.active === controller && this.client === client && this.isConnected)
						this.transfer = progress;
				},
			});
			if (this.client === client && this.active === controller) this.retry = undefined;
		} catch (error) {
			if (this.client === client && this.active === controller && this.isConnected) {
				this.canceled = controller.signal.aborted;
				if (!this.canceled)
					this.error = error instanceof Error ? error.message : 'Could not share files';
			}
		} finally {
			if (this.active === controller) {
				this.active = undefined;
				this.busy = false;
			}
		}
	}
	private upload(event: Event): void {
		const input = event.target as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		input.value = '';
		const { client, channelId } = this;
		if (!client || !files.length) return;
		void this.run((options) => client.uploadFiles(channelId, files, options));
	}
	private create(event: SubmitEvent): void {
		event.preventDefault();
		const name = String(new FormData(event.target as HTMLFormElement).get('name') ?? '');
		const { client, channelId } = this;
		if (!client) return;
		void this.run(async (options) => {
			const attachment = await client.createWorkbook(channelId, name, options);
			if (!this.isConnected || this.client !== client || this.channelId !== channelId) return;
			this.creating = false;
			this.emit('open', { ...attachment, channelId });
		});
	}
	private sortHeading(field: FileSortField, label: string) {
		const active = this.sortField === field;
		return html`<th scope="col" aria-sort=${active ? this.sortDirection : 'none'}>
			<button
				type="button"
				class="sort-command"
				@click=${() => {
					this.sortDirection =
						active && this.sortDirection === 'ascending' ? 'descending' : 'ascending';
					this.sortField = field;
				}}
			>
				${label}<span aria-hidden="true"
					>${active ? (this.sortDirection === 'ascending' ? '↑' : '↓') : '↕'}</span
				>
			</button>
		</th>`;
	}
	protected override render() {
		const files = sortFiles(
			filterFiles(this.files, this.query),
			this.sortField,
			this.sortDirection,
		);
		const disabled = this.busy || !this.canUpload || !this.channelId;
		return html`<div class="toolbar" role="toolbar" aria-label="File actions">
				<office-ui-menu-button
					class="new-command"
					label="+ New"
					.disabled=${disabled}
					@office-command=${async (event: CustomEvent<{ command: string }>) => {
						if (event.detail.command !== 'new-workbook' || disabled) return;
						this.creating = true;
						await this.updateComplete;
						this.renderRoot.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
					}}
				>
					<office-ui-menu-item
						label="New Excel workbook"
						command="new-workbook"
					></office-ui-menu-item>
				</office-ui-menu-button>
				<button
					type="button"
					?disabled=${disabled}
					@click=${() => this.renderRoot.querySelector<HTMLInputElement>('input[type="file"]')?.click()}
				>
					${icon('upload')} Upload
				</button>
				<input
					type="file"
					class="file-picker"
					aria-label="Upload files"
					multiple
					?disabled=${disabled}
					@change=${this.upload}
				/>
				<span class="toolbar-space"></span>
				<input
					type="search"
					aria-label="Search files"
					placeholder="Search files"
					.value=${this.query}
					@input=${(e: Event) => (this.query = (e.target as HTMLInputElement).value)}
				/>
			</div>
			<p class="hint">
				${this.canUpload ? `New files are shared in # ${this.channelName}.` : 'Configure file storage to upload files or create workbooks.'}
			</p>
			${
				this.creating
					? html`<form aria-label="Create Excel workbook" @submit=${this.create}>
							<input
								name="name"
								aria-label="Workbook name"
								placeholder="Workbook name"
								maxlength="75"
								required
								?disabled=${this.busy}
							/>
							<button type="submit" ?disabled=${disabled}>Create workbook</button>
							<button type="button" ?disabled=${this.busy} @click=${() => (this.creating = false)}>
								Cancel
							</button>
						</form>`
					: nothing
			}
			${
				this.busy
					? html`<div class="transfer">
							<p role="status">
								Sharing files in # ${this.destination}:
								${this.transfer?.phase === 'preparing' ? 'Preparing' : 'Uploading'}
								${this.transfer?.fileName ?? ''} (${this.transfer?.completed ?? 0} of
								${this.transfer?.total ?? 0} uploaded)
							</p>
							${this.transfer ? html`<progress aria-label="Files uploaded" max=${this.transfer.total} value=${this.transfer.completed}></progress>` : nothing}
							<button type="button" @click=${() => this.active?.abort()}>Cancel sharing</button>
						</div>`
					: nothing
			}
			${
				this.error || this.canceled
					? html`${this.canceled ? html`<p role="status">Sharing in # ${this.destination} canceled.</p>` : html`<p role="alert">Sharing in # ${this.destination} failed: ${this.error}</p>`}
							<button
								type="button"
								?disabled=${this.busy}
								@click=${() => this.retry && void this.run(this.retry)}
							>
								Retry sharing files
							</button>`
					: nothing
			}
			<div class="file-list">
				<table aria-label="Shared files">
					<thead>
						<tr>
							${this.sortHeading('name', 'Name')} ${this.sortHeading('ts', 'Shared on')}
							${this.sortHeading('author', 'Shared by')}
							<th scope="col">Location</th>
							<th scope="col"><span class="visually-hidden">Actions</span></th>
						</tr>
					</thead>
					<tbody>
						${
							files.length
								? files.map(
										(file) =>
											html`<tr>
												<td>
													<div class="file-name">
														<span class="badge" data-kind=${file.kind}
															>${{ docx: 'W', xlsx: 'X', pptx: 'P', vsdx: 'V', other: 'F' }[file.kind]}</span
														>
														<button
															class="file-open"
															type="button"
															aria-label=${`Open ${file.name}`}
															title=${file.name}
															?disabled=${!file.url}
															@click=${() => this.emit('open', file)}
														>
															${file.name}
														</button>
													</div>
												</td>
												<td><time>${new Date(file.ts).toLocaleDateString()}</time></td>
												<td>${file.author}</td>
												<td>
													${file.channelName ? `# ${file.channelName}` : `# ${this.channelName}`}
												</td>
												<td>
													<teams-file-actions
														.file=${file}
														.client=${this.client}
													></teams-file-actions>
												</td>
											</tr>`,
									)
								: html`<tr>
										<td colspan="5" class="none">
											${this.query.trim() ? 'No matching files.' : 'No files shared yet.'}
										</td>
									</tr>`
						}
					</tbody>
				</table>
			</div>`;
	}
}

export function defineTeamsFilesPanel(): void {
	if (globalThis.customElements && !customElements.get('teams-files-panel'))
		customElements.define('teams-files-panel', TeamsFilesPanel);
}
