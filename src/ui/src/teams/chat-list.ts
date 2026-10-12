import { html, nothing, type TemplateResult } from 'lit';
import { definer } from '../registry';
import { TeamsElement, dayLabel, formatSize, formatTime, withStyles } from './base';
import { icon } from './icons';
import css from './chat-list.css?raw';

export interface ChatAttachment {
	name: string;
	kind: 'docx' | 'xlsx' | 'pptx' | 'vsdx' | 'other';
	size?: number;
	url?: string;
}

export interface ChatMessage {
	id: string;
	authorId: string;
	authorName: string;
	text: string;
	ts: number;
	editedAt?: number;
	deleted?: boolean;
	replyTo?: string;
	tabId?: string;
	attachments?: ChatAttachment[];
	reactions?: Record<string, string[]>;
}

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉'] as const;
const KIND_LETTER: Record<ChatAttachment['kind'], string> = {
	docx: 'W',
	xlsx: 'X',
	pptx: 'P',
	vsdx: 'V',
	other: 'F',
};
const GROUP_MS = 5 * 60_000;

/**
 * The conversation: messages as Teams-style bubbles with day separators, quoted replies,
 * reaction pills, Office file cards and a hover toolbar. Properties: `messages`, `selfId`.
 * Events (bubbling, composed): `office-chat-react` `{ messageId, emoji }` (toggle),
 * `office-chat-reply` / `office-chat-edit` / `office-chat-delete` `{ messageId }` and
 * `office-chat-open-file` `{ attachment }`, `office-chat-open-tab` `{ tabId }`.
 * Message text is always rendered as text.
 */
export class OfficeUiChatList extends TeamsElement {
	static override styles = withStyles(css);
	static override properties = {
		messages: { attribute: false },
		selfId: { type: String, attribute: 'self-id' },
		replyCounts: { attribute: false },
	};
	declare messages: ChatMessage[];
	declare selfId: string;
	declare replyCounts: Record<string, number>;
	private stickToBottom = true;

	constructor() {
		super();
		this.messages = [];
		this.selfId = '';
		this.replyCounts = {};
	}

	override connectedCallback(): void {
		super.connectedCallback();
		this.setAttribute('role', 'log');
		this.setAttribute('aria-live', 'polite');
		this.setAttribute('aria-label', 'Messages');
		this.addEventListener('scroll', () => {
			this.stickToBottom = this.scrollHeight - this.scrollTop - this.clientHeight < 64;
		});
	}

	protected override updated(): void {
		if (this.stickToBottom) this.scrollTop = this.scrollHeight;
	}

	protected override render() {
		if (this.messages.length === 0) return html`<p class="empty">No messages yet. Say hello.</p>`;
		const byId = new Map(this.messages.map((m) => [m.id, m]));
		const rows: TemplateResult[] = [];
		let previous: ChatMessage | undefined;
		for (const m of this.messages) {
			if (!previous || dayLabel(previous.ts) !== dayLabel(m.ts))
				rows.push(html`<div class="day"><span>${dayLabel(m.ts)}</span></div>`);
			const grouped =
				previous !== undefined &&
				previous.authorId === m.authorId &&
				m.ts - previous.ts < GROUP_MS &&
				!m.replyTo &&
				dayLabel(previous.ts) === dayLabel(m.ts);
			rows.push(this.message(m, grouped, byId.get(m.replyTo ?? '')));
			previous = m;
		}
		return html`${rows}`;
	}

	private message(m: ChatMessage, grouped: boolean, parent: ChatMessage | undefined) {
		const own = m.authorId === this.selfId;
		const reactions = Object.entries(m.reactions ?? {}).filter(([, users]) => users.length > 0);
		return html`
			<article
				class="msg"
				data-message-id=${m.id}
				data-own=${String(own)}
				data-grouped=${String(grouped)}
			>
				<div class="gutter">
					${
						grouped
							? nothing
							: html`<office-ui-avatar name=${m.authorName} seed=${m.authorId}></office-ui-avatar>`
					}
				</div>
				<div class="body">
					${
						grouped
							? nothing
							: html`<header>
									<span class="author">${m.authorName}</span>
									<time>${formatTime(m.ts)}</time>
								</header>`
					}
					<div class="bubble">
						${
							parent
								? html`<blockquote>
										<strong>${parent.authorName}</strong
										>${parent.deleted ? 'This message was deleted' : parent.text.slice(0, 120)}
									</blockquote>`
								: nothing
						}
						${
							m.deleted
								? html`<span class="deleted">This message was deleted</span>`
								: html`<span class="text">${m.text}</span>${
											m.editedAt ? html` <span class="edited">(edited)</span>` : nothing
										}`
						}
						${!m.deleted && m.attachments?.length ? this.files(m.attachments) : nothing}
						${!m.deleted && m.tabId ? html`<button class="thread-link" type="button" @click=${() => this.fire('office-chat-open-tab', { tabId: m.tabId })}>Open tab</button>` : nothing}
					</div>
					${
						!m.deleted && reactions.length
							? html`<div class="reactions">
									${reactions.map(
										([emoji, users]) => html`
											<button
												type="button"
												class="pill"
												aria-pressed=${String(users.includes(this.selfId))}
												aria-label=${`${emoji} ${users.length}`}
												@click=${() => this.fire('office-chat-react', { messageId: m.id, emoji })}
											>
												<span>${emoji}</span><span>${users.length}</span>
											</button>
										`,
									)}
								</div>`
							: nothing
					}
					${m.deleted ? nothing : this.toolbar(m, own)}
					${this.replyCounts[m.id] === undefined ? nothing : html`<button type="button" class="thread-link" @click=${() => this.fire('office-chat-thread', { messageId: m.id })}>${this.replyCounts[m.id]} ${this.replyCounts[m.id] === 1 ? 'reply' : 'replies'}</button>`}
				</div>
			</article>
		`;
	}

	private toolbar(m: ChatMessage, own: boolean) {
		return html`
			<div class="toolbar" role="toolbar" aria-label="Message actions">
				${QUICK_REACTIONS.slice(0, 4).map(
					(emoji) =>
						html`<button
							type="button"
							aria-label=${`React ${emoji}`}
							@click=${() => this.fire('office-chat-react', { messageId: m.id, emoji })}
						>
							${emoji}
						</button>`,
				)}
				<button
					type="button"
					title="Reply"
					aria-label="Reply"
					@click=${() => this.fire('office-chat-reply', { messageId: m.id })}
				>
					${icon('reply')}
				</button>
				${
					own
						? html`<button
									type="button"
									title="Edit"
									aria-label="Edit"
									@click=${() => this.fire('office-chat-edit', { messageId: m.id })}
								>
									${icon('pencil')}
								</button>
								<button
									type="button"
									title="Delete"
									aria-label="Delete"
									@click=${() => this.fire('office-chat-delete', { messageId: m.id })}
								>
									${icon('trash')}
								</button>`
						: nothing
				}
			</div>
		`;
	}

	private files(files: ChatAttachment[]) {
		return html`<div class="files">
			${files.map(
				(a) => html`
					<button
						type="button"
						class="file"
						aria-label=${`Open ${a.name}`}
						@click=${() => this.fire('office-chat-open-file', { attachment: a })}
					>
						<span class="badge" data-kind=${a.kind}>${KIND_LETTER[a.kind]}</span>
						<span class="meta">
							<span class="file-name">${a.name}</span>
							<span class="file-size">${a.kind.toUpperCase()} ${formatSize(a.size)}</span>
						</span>
					</button>
				`,
			)}
		</div>`;
	}
}

export const defineChatList = definer('office-ui-chat-list', () => OfficeUiChatList);
