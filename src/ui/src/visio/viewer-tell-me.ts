import type { OfficeSearchCommand } from '../controls';

type Search = HTMLElement & { commands: OfficeSearchCommand[] };

/** Visio's "Tell me what you want to do" box (the shared `office-ui-command-search`). */
export function createTellMe(doc: Document): HTMLElement {
	const search = doc.createElement('office-ui-command-search');
	search.className = 'tell-me';
	search.setAttribute('placeholder', 'Tell me what you want to do');
	search.setAttribute('aria-keyshortcuts', 'Alt+Q');
	return search;
}

/** Every ribbon command and checkbox, with its tab and group as keywords. */
function ribbonCommands(root: ShadowRoot): OfficeSearchCommand[] {
	const seen = new Set<string>();
	const commands: OfficeSearchCommand[] = [];
	const context = (node: Element) => {
		const group = node.closest('office-ui-ribbon-group')?.getAttribute('label') ?? '';
		const tab = node.closest<HTMLElement>('[data-ribbon-tab]')?.dataset.label ?? '';
		return [tab, group].filter(Boolean).join(' › ');
	};
	for (const node of root.querySelectorAll<HTMLElement>('.toolbar [command]')) {
		const id = node.getAttribute('command')!;
		const label = node.getAttribute('label');
		// Add-in tabs belong to the host: their ids are not this viewer's commands.
		if (!label || seen.has(id) || node.closest('[data-add-in]')) continue;
		seen.add(id);
		const disabled = node.hasAttribute('disabled') || node.hasAttribute('main-disabled');
		commands.push({
			id,
			label,
			keywords: context(node),
			description: context(node),
			disabled,
			...(disabled ? { title: node.getAttribute('title') ?? 'Not available' } : {}),
		});
	}
	for (const box of root.querySelectorAll<HTMLElement>('.toolbar [data-check]')) {
		const disabled = box.hasAttribute('disabled');
		const caption = box.closest('.ribbon-check');
		commands.push({
			id: `check:${box.dataset.check}`,
			label: box.getAttribute('aria-label') ?? '',
			keywords: context(box),
			description: context(box),
			disabled,
			...(disabled ? { title: caption?.getAttribute('title') ?? 'Not available' } : {}),
		});
	}
	return commands;
}

/** Run a command found by Tell me exactly as its ribbon control would. */
function runCommand(root: ShadowRoot, id: string): void {
	if (id.startsWith('check:')) {
		root.querySelector<HTMLElement>(`.toolbar [data-check="${id.slice(6)}"]`)?.click();
		return;
	}
	const control = root.querySelector(`.toolbar [command="${id}"]`);
	// Shared galleries render their dropdown trigger in the light DOM.
	(
		control?.shadowRoot?.querySelector<HTMLButtonElement>('.main, button') ??
		control?.querySelector<HTMLButtonElement>('.trigger')
	)?.click();
}

/** The command list refreshes on focus, so enabled states always match the ribbon. */
export function wireTellMe(root: ShadowRoot): () => void {
	const search = root.querySelector<Search>('.tell-me')!;
	const Abort = root.ownerDocument.defaultView?.AbortController ?? AbortController;
	const events = new Abort();
	const options = { signal: events.signal };
	search.addEventListener('focusin', () => (search.commands = ribbonCommands(root)), options);
	search.addEventListener(
		'office-command',
		(event) => {
			event.stopPropagation();
			runCommand(root, (event as CustomEvent<{ command: string }>).detail.command);
		},
		options,
	);
	root.addEventListener(
		'keydown',
		(event) => {
			const key = event as KeyboardEvent;
			if (!key.altKey || key.ctrlKey || key.metaKey || key.key.toLowerCase() !== 'q') return;
			key.preventDefault();
			search.focus();
		},
		options,
	);
	return () => events.abort();
}
