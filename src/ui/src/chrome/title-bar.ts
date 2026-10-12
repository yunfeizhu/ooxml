import { html, type PropertyValues, type TemplateResult } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';
import { repeat } from 'lit/directives/repeat.js';
import { html as staticHtml, unsafeStatic } from 'lit/static-html.js';
import { OfficeElement, controlStyles } from '../base';
import { glyph } from '../glyph';
import { defineSearchField } from '../form/search-field';
import { defineSwitch } from '../form/switch';
import { definer } from '../registry';
import {
	matchTitleBarCommands,
	OFFICE_TITLE_BAR_SEARCH_LIMIT,
	type OfficeQuickAccessItem,
	type OfficeTitleBarCommand,
	type OfficeTitleBarPlacement,
	type OfficeTitleBarState,
} from './title-bar-types';
import css from './title-bar.css?raw';

export * from './title-bar-types';

const EMPTY: OfficeTitleBarState = { fileName: '' };
type Statics = {
	autosaveEvent: string;
	commandEvent: string;
	searchEvent: string;
	switchTag: string;
	searchTag: string;
};
type SearchField = HTMLElement & { value: string };

/**
 * `<office-ui-title-bar>`: Office's title bar above the ribbon (app mark, AutoSave, Quick
 * Access Toolbar, file name and status, centred command search, `actions`, `collaboration` and
 * `account` slots). Controlled: set `state` (`OfficeTitleBarState`, every string translated); the bar
 * owns no effects. The `centered` attribute puts the file name in the middle of the bar.
 * `placement="belowRibbon"` renders only the Quick Access row and hides
 * itself (`data-empty`) while that row is empty. Events (bubbling, composed; static names let a
 * product subclass keep its published ones): `office-autosave-toggle`, `office-command`
 * `{ command }` from a Quick Access button and `office-command-search` `{ query, command? }`.
 * Override `activate(id)` to route Quick Access buttons differently and `rendered()` to mirror
 * state onto the host. Tokens: `--office-title-bar-*`. The search query stays local to the bar,
 * so hosts never round-trip keystrokes; they receive one request per commit.
 */
export class OfficeUiTitleBar extends OfficeElement {
	static autosaveEvent = 'office-autosave-toggle';
	static commandEvent = 'office-command';
	static searchEvent = 'office-command-search';
	/** Inner controls; a product subclass may use its own aliased tags. */
	static switchTag = 'office-ui-switch';
	static searchTag = 'office-ui-search';
	static override styles = controlStyles(css);
	static override properties = {
		placement: { type: String, noAccessor: true },
		stop: { state: true },
		found: { state: true },
		active: { state: true },
		resultsOpen: { state: true },
		live: { state: true },
	};
	declare stop: string;
	declare found: readonly OfficeTitleBarCommand[];
	declare active: number;
	declare resultsOpen: boolean;
	declare live: string;
	private model: OfficeTitleBarState = EMPTY;

	constructor() {
		super();
		this.stop = '';
		this.found = [];
		this.active = 0;
		this.resultsOpen = false;
		this.live = '';
	}

	get state(): OfficeTitleBarState {
		return this.model;
	}
	set state(value: OfficeTitleBarState | null | undefined) {
		this.model = value ?? EMPTY;
		this.requestUpdate('state');
	}

	/** Read from the attribute, so a subclass that intercepts attribute changes still sees it. */
	get placement(): OfficeTitleBarPlacement {
		return this.getAttribute('placement') === 'belowRibbon' ? 'belowRibbon' : 'titleBar';
	}
	set placement(value: OfficeTitleBarPlacement) {
		if (this.getAttribute('placement') !== value) this.setAttribute('placement', value);
		this.requestUpdate('placement');
	}

	/** The search field inside the bar, for hosts that move focus to it (Alt+Q). */
	get searchField(): HTMLElement {
		// A subclass reads this in its constructor: the first render queues its host writes.
		this.ensureRendered();
		return this.renderRoot.querySelector<HTMLElement>('[part="search"]') as HTMLElement;
	}

	/** A Quick Access button was pressed; subclasses may route by id. */
	activate(id: string): void {
		this.fire((this.constructor as unknown as Statics).commandEvent, { command: id });
	}

	/** Called after every render; subclasses mirror state onto the host here. */
	rendered(): void {}

	// ---- Quick Access Toolbar -------------------------------------------------------------

	private enabledButtons(): HTMLButtonElement[] {
		return [...this.renderRoot.querySelectorAll<HTMLButtonElement>('.qat button:not(:disabled)')];
	}

	private onQatFocus(event: Event): void {
		const target = (event.target as Element).closest('button');
		if (target?.dataset.command) this.stop = target.dataset.command;
	}

	private onQatKey(event: KeyboardEvent): void {
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		const list = this.enabledButtons();
		const index = list.findIndex((b) => b === (event.target as Element).closest('button'));
		const last = list.length - 1;
		const moves: Record<string, number> = {
			ArrowRight: (index + 1) % list.length,
			ArrowLeft: (index + last) % list.length,
			Home: 0,
			End: last,
		};
		const next = moves[event.key] ?? -1;
		if (next >= 0 && index >= 0) {
			event.preventDefault();
			list[next]?.focus();
		}
		// Keep arrows and native activation out of the host document's shortcuts.
		if (next >= 0 || event.key === ' ' || event.key === 'Enter') event.stopPropagation();
	}

	private quickAccess(): TemplateResult {
		const qa = this.model.quickAccess;
		const items: readonly OfficeQuickAccessItem[] = qa?.items ?? [];
		const enabled = items.filter((item) => item.disabled !== true);
		const current = enabled.find((item) => item.id === this.stop) ?? enabled[0];
		return html`<div
			class="qat"
			role="toolbar"
			part="quick-access"
			aria-label=${qa?.label ?? ''}
			?hidden=${items.length === 0}
			@focusin=${this.onQatFocus}
			@keydown=${this.onQatKey}
		>
			${repeat(
				items,
				(item) => item.id,
				(item) =>
					html`<button
						type="button"
						data-command=${item.id}
						aria-label=${item.label}
						title=${ifDefined(item.title)}
						tabindex=${item === current ? 0 : -1}
						?disabled=${item.disabled === true}
						@click=${() => this.activate(item.id)}
						>${glyph(item.icon, 'icon')}${qa?.showLabels === true ? html`<small>${item.label}</small>` : ''}</button
					>`,
			)}
		</div>`;
	}

	// ---- Command search -------------------------------------------------------------------

	private get query(): string {
		return (this.searchField as SearchField | null)?.value ?? '';
	}

	private openResults(): void {
		const search = this.model.search;
		const query = this.query;
		if (!search || !query.trim()) return this.closeResults();
		this.found = [...matchTitleBarCommands(search, query)].slice(0, OFFICE_TITLE_BAR_SEARCH_LIMIT);
		this.active = Math.min(this.active, Math.max(this.found.length - 1, 0));
		this.resultsOpen = true;
		this.live = this.found.length > 0 ? search.heading : search.empty;
	}

	private closeResults(): void {
		this.resultsOpen = false;
		this.live = '';
		this.found = [];
	}

	private commit(entry?: OfficeTitleBarCommand): void {
		const query = this.query;
		(this.searchField as SearchField).value = '';
		this.closeResults();
		this.fire(
			(this.constructor as unknown as Statics).searchEvent,
			entry ? { query, command: entry.id } : { query },
		);
	}

	private onSearchKey(event: KeyboardEvent): void {
		const { key, ctrlKey, metaKey } = event;
		const field = this.searchField as SearchField;
		if (key === 'Enter' && field.value.trim()) this.commit(this.found[this.active]);
		else if (key === 'Escape' && field.value) {
			field.value = '';
			this.closeResults();
		} else if ((key === 'ArrowDown' || key === 'ArrowUp') && this.found.length > 0) {
			event.preventDefault();
			this.active =
				(this.active + (key === 'ArrowDown' ? 1 : this.found.length - 1)) % this.found.length;
		}
		// Typing must not reach the host document's shortcuts.
		if (!ctrlKey && !metaKey) event.stopPropagation();
	}

	private onSearchBlur(event: FocusEvent): void {
		const next = event.relatedTarget as Node | null;
		const box = this.renderRoot.querySelector('.box');
		if (!next || !box?.contains(next)) this.closeResults();
	}

	private results(search: OfficeTitleBarState['search']): TemplateResult {
		if (!search || !this.resultsOpen)
			return html`<div class="results" role="listbox" hidden></div>
				<div class="sr" role="status"></div>`;
		const query = this.query;
		// mousedown (not click) so the choice lands before the field blurs.
		const pick = (event: Event, run: () => void) => {
			event.preventDefault();
			run();
		};
		return html`
			<div class="results" role="listbox" ?hidden=${!this.resultsOpen}>
				${
					this.found.length > 0
						? html`<div class="heading">${search.heading}</div> ${this.found.map(
									(entry, index) =>
										html`<button
											type="button"
											role="option"
											tabindex="-1"
											aria-selected=${String(index === this.active)}
											@mousedown=${(event: Event) => pick(event, () => this.commit(entry))}
											@mouseenter=${() => (this.active = index)}
											><span>${entry.label}</span
											><span class="cat">${entry.category ?? ''}</span></button
										>`,
								)}`
						: html`<div class="empty">${search.empty}</div>`
				}
				${
					search.content
						? html`<button
								type="button"
								class="content"
								tabindex="-1"
								@mousedown=${(event: Event) => pick(event, () => this.commit())}
								>${glyph(search.contentIcon ?? 'search', 'icon')}<span
									>${search.content(query)}</span
								></button
							>`
						: ''
				}
			</div>
			<div class="sr" role="status">${this.live}</div>
		`;
	}

	private searchBox(): TemplateResult {
		const search = this.model.search;
		const tag = unsafeStatic((this.constructor as unknown as Statics).searchTag);
		return html`<span class="search" ?hidden=${!search}>
			<div class="box" ?hidden=${!search} @focusout=${this.onSearchBlur}>
				${staticHtml`<${tag}
					variant="titlebar"
					part="search"
					placeholder=${ifDefined(search?.placeholder)}
					aria-label=${ifDefined(search?.label)}
					@input=${() => {
						this.active = 0;
						this.openResults();
					}}
					@focusin=${this.openResults}
					@keydown=${this.onSearchKey}
				></${tag}>`}
				${this.results(search)}
			</div>
		</span>`;
	}

	// ---- AutoSave, mark and file name -----------------------------------------------------

	private autosave(): TemplateResult {
		const autosave = this.model.autosave;
		const tag = unsafeStatic((this.constructor as unknown as Statics).switchTag);
		return html`<span class="autosave" ?hidden=${!autosave}>
				<span class="label">${autosave?.label ?? ''}</span>
				${staticHtml`<${tag}
					class="switch"
					part="autosave-switch"
					aria-label=${autosave?.toggleLabel ?? ''}
					title=${autosave ? (autosave.title ?? autosave.toggleLabel) : ''}
					.checked=${autosave?.enabled === true}
					?disabled=${autosave?.available === false}
					@change=${(event: Event) => {
						this.fire((this.constructor as unknown as Statics).autosaveEvent, null);
						// Stay controlled: show the host's state, not the switch's optimistic flip.
						(event.target as HTMLElement & { checked: boolean }).checked =
							this.model.autosave?.enabled === true;
					}}
				></${tag}>`}
				<span class="label">${autosave?.stateLabel ?? ''}</span>
			</span>
			<i class="sep" aria-hidden="true" ?hidden=${!autosave}></i>`;
	}

	protected override willUpdate(changed: PropertyValues<this>): void {
		const items = this.model.quickAccess?.items ?? [];
		this.toggleAttribute('data-empty', this.placement === 'belowRibbon' && items.length === 0);
		// A refreshed search model redraws an open result list.
		if (changed.has('state' as never) && this.resultsOpen) this.openResults();
	}

	protected override updated(): void {
		this.rendered();
	}

	protected override render() {
		const state = this.model;
		const below = this.placement === 'belowRibbon';
		const items = state.quickAccess?.items ?? [];
		// The below-ribbon row carries only the strip: the rest leaves the DOM, so one page
		// never holds a second (hidden) search field or AutoSave switch.
		if (below) return html`<div class="bar" part="bar">${this.quickAccess()}</div>`;
		return html`
			<div class="bar" part="bar">
				<span class="mark" aria-hidden="true" ?hidden=${!state.appMark}
					>${state.appMark ?? ''}</span
				>
				${this.autosave()} ${this.quickAccess()}
				<i class="sep" aria-hidden="true" ?hidden=${items.length === 0}></i>
				<span class="file">
					<span class="name" part="file-name">${state.fileName}</span>
					<span class="dot" aria-hidden="true" ?hidden=${!state.status}>•</span>
					<span
						class="status${state.tone === 'saving' ? ' saving' : ''}${state.tone === 'error' ? ' error' : ''}"
						?hidden=${!state.status}
						>${state.status ?? ''}</span
					>
				</span>
				${this.searchBox()}
				<div class="end">
					<slot name="actions"></slot>
					<slot name="collaboration"></slot>
					<slot name="account"></slot>
				</div>
			</div>
		`;
	}
}

export const defineTitleBar = definer('office-ui-title-bar', () => OfficeUiTitleBar, [
	defineSearchField,
	defineSwitch,
]);
