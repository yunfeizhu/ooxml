import { html, nothing, type PropertyValues } from 'lit';
import { live } from 'lit/directives/live.js';
import { definer } from '../registry';
import { TeamsElement, withStyles } from './base';
import { icon } from './icons';
import css from './chat-composer.css?raw';
import { MAX_ATTACHMENTS, type ChatDraft } from 'ooxml-core/teams';

export const EMOJI = [
	'😀',
	'😄',
	'😂',
	'🙂',
	'😉',
	'😍',
	'🤔',
	'😮',
	'😢',
	'😡',
	'👍',
	'👎',
	'👏',
	'🙏',
	'💪',
	'🎉',
	'🔥',
	'❤️',
	'✅',
	'👀',
] as const;
const MAX_FILES = MAX_ATTACHMENTS;

/**
 * The compose box: a growing text area, attach and emoji buttons, reply or edit banner and a
 * typing line. Enter sends, Shift+Enter adds a line. Properties: `typing` (names), `replyingTo`
 * (a label or null), `editing` (true while editing), `disabled`, `placeholder`, and `value`.
 * Events: `office-chat-draft` `{ text, files, missingFiles }` after a user change,
 * `office-chat-send` `{ text, files }`, `office-chat-typing` `{}` (throttled) and
 * `office-chat-cancel` `{}` (the banner's close button or Escape). File bytes are never read here:
 * the host stores them wherever its server says and posts a link.
 */
export class OfficeUiChatComposer extends TeamsElement {
	static override styles = withStyles(css);
	static override properties = {
		typing: { attribute: false },
		replyingTo: { attribute: false },
		editing: { type: Boolean },
		disabled: { type: Boolean, reflect: true },
		placeholder: { type: String },
		value: { type: String },
		files: { state: true },
		missingFiles: { attribute: false },
		emojiOpen: { state: true },
	};
	declare typing: string[];
	declare replyingTo: string | null;
	declare editing: boolean;
	declare disabled: boolean;
	declare placeholder: string;
	declare value: string;
	declare files: ChatDraft['files'];
	declare missingFiles: string[];
	declare emojiOpen: boolean;
	private lastTyping = 0;

	constructor() {
		super();
		this.typing = [];
		this.replyingTo = null;
		this.editing = false;
		this.disabled = false;
		this.placeholder = 'Type a message';
		this.value = '';
		this.files = [];
		this.missingFiles = [];
		this.emojiOpen = false;
	}

	private focusMessage(): void {
		void this.updateComplete.then(() =>
			this.renderRoot.querySelector('textarea')?.focus({ preventScroll: true }),
		);
	}
	private resizeMessage(): void {
		const area = this.renderRoot.querySelector('textarea');
		if (!area) return;
		area.style.height = 'auto';
		area.style.height = `${Math.min(area.scrollHeight, 160)}px`;
	}
	protected override updated(changed: PropertyValues<this>): void {
		if (changed.has('value')) this.resizeMessage();
		if (changed.has('replyingTo') || changed.has('editing')) {
			if (this.replyingTo !== null || this.editing)
				this.renderRoot.querySelector('textarea')?.focus();
		}
	}

	private get canSend(): boolean {
		return (
			!this.disabled &&
			!this.missingFiles.length &&
			(this.value.trim() !== '' || this.files.length > 0)
		);
	}

	private submit(): void {
		if (!this.canSend) return;
		const { value: text, files } = this;
		this.value = '';
		this.files = [];
		this.emojiOpen = false;
		this.fire('office-chat-send', { text, files });
		this.focusMessage();
	}

	private onInput(event: Event): void {
		this.value = (event.target as HTMLTextAreaElement).value;
		this.saveDraft();
		const now = Date.now();
		if (now - this.lastTyping > 2000) {
			this.lastTyping = now;
			this.fire('office-chat-typing', {});
		}
	}

	private onKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape' && this.emojiOpen) {
			this.emojiOpen = false;
			this.focusMessage();
			return;
		}
		if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
			event.preventDefault();
			this.submit();
		} else if (event.key === 'Escape' && (this.replyingTo !== null || this.editing)) {
			this.fire('office-chat-cancel', {});
		}
	}

	private pick(event: Event): void {
		const input = event.target as HTMLInputElement;
		this.addFiles(Array.from(input.files ?? []));
		input.value = '';
	}
	private addFiles(files: File[]): void {
		if (this.disabled) return;
		this.files = [...this.files, ...files].slice(0, MAX_FILES);
		this.missingFiles = this.missingFiles.filter(
			(name) => !this.files.some((file) => file.name === name),
		);
		this.saveDraft();
		this.focusMessage();
	}
	private saveDraft(): void {
		this.fire('office-chat-draft', {
			text: this.value,
			files: [...this.files],
			missingFiles: [...this.missingFiles],
		});
	}

	private typingLine(): string {
		const n = this.typing.slice(0, 3);
		if (n.length === 0) return '';
		return n.length === 1 ? `${n[0]} is typing…` : `${n.join(', ')} are typing…`;
	}

	protected override render() {
		const banner = this.editing
			? 'Editing message'
			: this.replyingTo !== null
				? `Replying to ${this.replyingTo}`
				: '';
		return html`
			<div class="typing" aria-live="polite">${this.typingLine()}</div>
			<div
				class="box"
				@dragover=${(event: DragEvent) => {
					if (event.dataTransfer?.types.includes('Files')) {
						event.preventDefault();
						event.stopPropagation();
					}
				}}
				@drop=${(event: DragEvent) => {
					if (event.dataTransfer?.files.length) {
						event.preventDefault();
						event.stopPropagation();
						this.addFiles([...event.dataTransfer.files]);
					}
				}}
			>
				${
					this.missingFiles.length
						? html`<div role="status">
								Reattach or discard these draft attachments before sending:
								<ul>
									${this.missingFiles.map(
										(name) =>
											html`<li>
												${name}<button
													type="button"
													aria-label=${`Discard missing ${name}`}
													@click=${() => {
														this.missingFiles = this.missingFiles.filter((item) => item !== name);
														this.saveDraft();
													}}
												>
													Discard
												</button>
											</li>`,
									)}
								</ul>
							</div>`
						: nothing
				}
				${
					banner
						? html`<div class="banner">
								<span>${banner}</span>
								<button
									type="button"
									aria-label="Cancel"
									@click=${() => this.fire('office-chat-cancel', {})}
								>
									${icon('close')}
								</button>
							</div>`
						: nothing
				}
				<textarea
					rows="1"
					aria-label="Message"
					.value=${live(this.value)}
					placeholder=${this.placeholder}
					?disabled=${this.disabled}
					@input=${this.onInput}
					@paste=${(event: ClipboardEvent) => {
						if (event.clipboardData?.files.length) {
							event.preventDefault();
							this.addFiles([...event.clipboardData.files]);
						}
					}}
					@keydown=${this.onKeydown}
				></textarea>
				${
					this.files.length
						? html`<ul class="pending">
								${this.files.map(
									(f, i) =>
										html`<li>
											<button
												type="button"
												aria-label=${`Remove ${f.name}`}
												@click=${() => {
													this.files = this.files.filter((_, j) => j !== i);
													this.focusMessage();
													this.saveDraft();
												}}
											>
												<span class="file-label" title=${f.name}>${f.name}</span>${icon('close')}
											</button>
										</li>`,
								)}
							</ul>`
						: nothing
				}
				<div class="bar">
					<button
						type="button"
						title="Attach files"
						aria-label="Attach files"
						?disabled=${this.disabled}
						@click=${() => this.renderRoot.querySelector<HTMLInputElement>('input[type=file]')?.click()}
					>
						${icon('paperclip')}
					</button>
					<div class="emoji">
						<button
							type="button"
							title="Emoji"
							aria-label="Emoji"
							aria-expanded=${String(this.emojiOpen)}
							?disabled=${this.disabled}
							@click=${() => (this.emojiOpen = !this.emojiOpen)}
						>
							${icon('smile')}
						</button>
						${
							this.emojiOpen
								? html`<div class="picker" role="menu">
										${EMOJI.map(
											(e) =>
												html`<button
													type="button"
													role="menuitem"
													@click=${() => {
														const area = this.renderRoot.querySelector('textarea');
														const start = area?.selectionStart ?? this.value.length,
															end = area?.selectionEnd ?? start;
														this.value = this.value.slice(0, start) + e + this.value.slice(end);
														void this.updateComplete.then(() => {
															area?.focus({ preventScroll: true });
															area?.setSelectionRange(start + e.length, start + e.length);
														});
														this.saveDraft();
														this.emojiOpen = false;
														this.renderRoot.querySelector('textarea')?.focus();
													}}
												>
													${e}
												</button>`,
										)}
									</div>`
								: nothing
						}
					</div>
					<span class="spacer"></span>
					<button
						type="button"
						class="send"
						title="Send"
						aria-label="Send message"
						?disabled=${!this.canSend}
						@click=${this.submit}
					>
						${icon('send')}
					</button>
				</div>
				<input type="file" multiple hidden @change=${this.pick} />
			</div>
		`;
	}
}

export const defineChatComposer = definer('office-ui-chat-composer', () => OfficeUiChatComposer);
