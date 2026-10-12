import {
	checkVisioDiagram,
	VISIO_DIAGRAM_RULE_SETS,
	type VisioDiagramIssue,
	type VisioRuleSetId,
} from 'ooxml-core/visio/ui';
import type { ViewerController, ViewerState } from './controller';
import type { RibbonCommand } from './ribbon-parts';

type Box = HTMLElement & { checked: boolean; disabled: boolean };

/**
 * Process > Check Diagram, the Issues window and Ignore This Issue. The rules are the core's
 * generic ones. Ignored issues last for this session only: Visio keeps them in the document's
 * Validation part with its own rule sets, which this viewer does not write.
 */
export class ViewerIssues {
	readonly host: HTMLElement;
	readonly list: HTMLUListElement;
	readonly summary: HTMLParagraphElement;
	readonly showIgnored: HTMLInputElement;
	#issues: VisioDiagramIssue[] = [];
	#ignored = new Set<string>();
	#enabled = new Set<VisioRuleSetId>(VISIO_DIAGRAM_RULE_SETS.map((set) => set.id));
	#selected: string | undefined;
	#checked = false;
	#source = -1;
	#document: unknown;
	constructor(
		private readonly root: ShadowRoot,
		private readonly controller: ViewerController,
		private readonly announce: (message: string) => void,
	) {
		const doc = root.ownerDocument;
		this.host = doc.createElement('aside');
		this.host.className = 'review-pane issues-pane';
		this.host.setAttribute('aria-label', 'Issues');
		this.host.hidden = true;
		const heading = doc.createElement('div');
		heading.className = 'pane-heading';
		const title = doc.createElement('span');
		title.textContent = 'Issues';
		const close = doc.createElement('button');
		close.type = 'button';
		close.className = 'pane-close';
		close.dataset.issuesClose = '';
		close.setAttribute('aria-label', 'Close the Issues window');
		close.textContent = '×';
		heading.append(title, close);
		this.summary = doc.createElement('p');
		this.summary.className = 'issues-summary';
		this.summary.setAttribute('role', 'status');
		this.list = doc.createElement('ul');
		this.list.className = 'issues-list';
		this.list.setAttribute('aria-label', 'Diagram issues');
		const ignored = doc.createElement('label');
		ignored.className = 'issues-ignored';
		this.showIgnored = doc.createElement('input');
		this.showIgnored.type = 'checkbox';
		ignored.append(this.showIgnored, doc.createTextNode(' Show ignored issues'));
		const note = doc.createElement('p');
		note.className = 'issues-note';
		note.textContent =
			'Generic checks only. Ignored issues are remembered until the drawing is closed and are not saved in the file.';
		this.host.append(heading, this.summary, this.list, ignored, note);
		(root.querySelector('.workspace') ?? root).append(this.host);
	}
	get open(): boolean {
		return !this.host.hidden;
	}
	get issues(): readonly VisioDiagramIssue[] {
		return this.#issues;
	}
	get ignored(): ReadonlySet<string> {
		return this.#ignored;
	}
	show(open = true): void {
		this.host.hidden = !open;
		this.render(this.controller.state);
	}
	toggleRuleSet(id: VisioRuleSetId): void {
		if (this.#enabled.has(id)) this.#enabled.delete(id);
		else this.#enabled.add(id);
		if (this.#checked) this.#run();
		this.render(this.controller.state);
	}
	/** Check Diagram: run the enabled rule sets over every foreground page. */
	check(): void {
		if (!this.controller.state.document) return;
		this.#checked = true;
		this.#run();
		const visible = this.#issues.filter((issue) => !this.#ignored.has(issue.id)).length;
		this.announce(
			visible
				? `Check Diagram found ${visible} issue${visible === 1 ? '' : 's'}.`
				: 'Check Diagram found no issues.',
		);
		this.show(true);
	}
	/** Ignore This Issue: hide the selected issue (or the first visible one) for this session. */
	ignore(): void {
		const issue = this.#issues.find(
			(item) => item.id === this.#selected && !this.#ignored.has(item.id),
		);
		if (!issue) return;
		this.#ignored.add(issue.id);
		this.#selected = undefined;
		this.announce(`Ignored: ${issue.message}`);
		this.#renderList();
		this.render(this.controller.state);
	}
	#run(): void {
		const document = this.controller.state.document;
		this.#issues = document ? checkVisioDiagram(document, { ruleSets: this.#enabled }) : [];
		this.#document = document;
		this.#renderList();
	}
	#go(issue: VisioDiagramIssue): void {
		this.#selected = issue.id;
		const document = this.controller.state.document;
		const index = document?.pages.findIndex((page) => page.id === issue.pageId) ?? -1;
		if (index >= 0 && index !== this.controller.state.pageIndex) this.controller.setPage(index);
		this.controller.selectShape({ id: issue.shapeId, name: issue.shapeName });
		this.#renderList();
	}
	wire(): () => void {
		const Abort = this.root.ownerDocument.defaultView?.AbortController ?? AbortController;
		const events = new Abort();
		const options = { signal: events.signal };
		this.host.addEventListener(
			'click',
			(event) => {
				const target = event.target as Element;
				if (target.closest('[data-issues-close]')) return this.show(false);
				const row = target.closest<HTMLButtonElement>('[data-issue-id]');
				const issue = row && this.#issues.find((item) => item.id === row.dataset.issueId);
				if (issue) this.#go(issue);
			},
			options,
		);
		this.showIgnored.addEventListener('change', () => this.#renderList(), options);
		return () => events.abort();
	}
	#renderList(): void {
		const doc = this.root.ownerDocument;
		const pages = new Map(
			this.controller.state.document?.pages.map((page) => [page.id, page.name]),
		);
		const visible = this.#issues.filter(
			(issue) => this.showIgnored.checked || !this.#ignored.has(issue.id),
		);
		this.list.replaceChildren(
			...visible.map((issue) => {
				const item = doc.createElement('li');
				const button = doc.createElement('button');
				button.type = 'button';
				button.dataset.issueId = issue.id;
				button.setAttribute('aria-pressed', String(issue.id === this.#selected));
				const message = doc.createElement('span');
				message.className = 'issue-message';
				message.textContent = issue.message;
				const where = doc.createElement('span');
				where.className = 'issue-where';
				const ruleSet = VISIO_DIAGRAM_RULE_SETS.find((set) => set.id === issue.ruleSet)?.name;
				where.textContent = `${pages.get(issue.pageId) ?? issue.pageId} · ${ruleSet ?? issue.ruleSet}${this.#ignored.has(issue.id) ? ' · Ignored' : ''}`;
				button.append(message, where);
				item.append(button);
				return item;
			}),
		);
		const ignored =
			this.#issues.length - this.#issues.filter((i) => !this.#ignored.has(i.id)).length;
		this.summary.textContent = !this.#checked
			? 'Run Check Diagram to find issues.'
			: `${this.#issues.length - ignored} issue${this.#issues.length - ignored === 1 ? '' : 's'}${ignored ? `, ${ignored} ignored` : ''}.`;
	}
	render(state: ViewerState): void {
		let source: number;
		try {
			source = this.controller.sourceGeneration;
		} catch {
			return; // A destroyed controller renders nothing more.
		}
		if (source !== this.#source) {
			// Another drawing: its issues, ignores and selection start fresh.
			this.#source = source;
			this.#issues = [];
			this.#ignored.clear();
			this.#selected = undefined;
			this.#checked = false;
			this.#document = state.document;
			this.#renderList();
		} else if (this.#checked && state.document !== this.#document) this.#run();
		const button = (name: string) => this.root.querySelector<RibbonCommand>(`[command="${name}"]`);
		const menu = this.root.querySelector<RibbonCommand>('[data-menu="check-diagram"]');
		if (menu) menu.disabled = !state.document || state.loading;
		const now = button('check-diagram-now');
		if (now) now.disabled = !state.document || state.loading;
		for (const set of VISIO_DIAGRAM_RULE_SETS)
			button(`rule-set-${set.id}`)?.setAttribute('checked', String(this.#enabled.has(set.id)));
		const ignore = button('ignore-issue');
		if (ignore) {
			const selectable = this.#issues.some(
				(issue) => issue.id === this.#selected && !this.#ignored.has(issue.id),
			);
			ignore.disabled = !selectable;
			ignore.title = selectable
				? 'Ignore This Issue (for this session; not saved in the file)'
				: 'Ignore This Issue: select an issue in the Issues window first.';
		}
		const box = this.root.querySelector<Box>('[data-check="issues-window"]');
		if (box) {
			box.checked = this.open;
			box.disabled = !state.document;
		}
	}
}
