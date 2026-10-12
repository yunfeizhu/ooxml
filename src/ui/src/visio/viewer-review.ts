import type { ViewerController, ViewerState } from './controller';
import type { VisioRibbonAction } from './ribbon-action';
import { ViewerComments } from './viewer-comments';
import { ViewerIssues } from './viewer-issues';
import { ViewerShapeReport } from './viewer-shape-report';
import { ViewerSubprocess } from './viewer-subprocess';

type Run = (action: () => Promise<void>, success: string) => void;
type ReviewAction = Extract<VisioRibbonAction, { type: 'review' }>;

/** Review and Process tab commands: comments, shape reports, diagram checks and subprocesses. */
export class ViewerReview {
	readonly comments: ViewerComments;
	readonly issues: ViewerIssues;
	readonly report: ViewerShapeReport;
	readonly subprocess: ViewerSubprocess;
	constructor(
		private readonly root: ShadowRoot,
		viewport: HTMLElement,
		controller: ViewerController,
		announce: (message: string) => void,
		run: Run,
	) {
		this.comments = new ViewerComments(root, viewport, controller, announce, run);
		this.issues = new ViewerIssues(root, controller, announce);
		this.report = new ViewerShapeReport(root, controller, announce);
		this.subprocess = new ViewerSubprocess(root, controller, announce, run);
	}
	run(action: ReviewAction): void {
		switch (action.command) {
			case 'new-comment':
			case 'page-comment':
				return this.comments.newComment(action.command === 'page-comment');
			case 'comments-pane':
				return this.comments.show(!this.comments.open);
			case 'shape-reports':
				return this.report.show();
			case 'check-diagram':
				return this.issues.check();
			case 'issues-window':
				return this.issues.show(!this.issues.open);
			case 'ignore-issue':
				return this.issues.ignore();
			case 'rule-set':
				if (action.ruleSet) this.issues.toggleRuleSet(action.ruleSet);
				return;
			case 'subprocess-new':
				return this.subprocess.start('new');
			case 'subprocess-existing':
				return this.subprocess.start('existing');
			case 'subprocess-selection':
				return this.subprocess.start('selection');
		}
	}
	wire(): () => void {
		const Abort = this.root.ownerDocument.defaultView?.AbortController ?? AbortController;
		const events = new Abort();
		// File > Info > Add Comment returns to the drawing with the comments pane open.
		this.root.querySelector('office-ui-backstage')?.addEventListener(
			'click',
			(event) => {
				const action = (event.target as Element).closest?.<HTMLButtonElement>(
					'[data-backstage-action="add-comment"]',
				);
				if (!action || action.disabled) return;
				(event.currentTarget as HTMLElement & { close(): void }).close();
				this.run({ type: 'review', command: 'new-comment' });
			},
			{ signal: events.signal },
		);
		const disposeComments = this.comments.wire();
		const disposeIssues = this.issues.wire();
		return () => {
			events.abort();
			disposeComments();
			disposeIssues();
			this.report.dispose();
			this.subprocess.close();
		};
	}
	render(state: ViewerState): void {
		this.comments.render(state);
		this.issues.render(state);
		this.subprocess.render(state);
		const editable = state.edit.sourceAvailable && !state.loading && !state.edit.busy;
		const reports = this.root.querySelector<HTMLElement & { disabled: boolean }>(
			'[command="shape-reports"]',
		);
		if (reports) reports.disabled = !state.document?.pages[state.pageIndex];
		const info = this.root.querySelector<HTMLButtonElement>(
			'[data-backstage-action="add-comment"]',
		);
		if (info) {
			info.disabled = !editable || !state.document;
			info.title = info.disabled ? 'Add Comment: open an editable .vsdx drawing first.' : '';
		}
	}
}
