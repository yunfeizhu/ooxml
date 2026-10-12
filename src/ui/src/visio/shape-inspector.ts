import type { VisioDocument, VisioShape } from 'ooxml-core/visio';
import type { ViewerState } from './controller';
export function selectedShape(
	document: VisioDocument | null,
	selection: ViewerState['selectedShape'],
	pageIndex: number,
): VisioShape | undefined {
	if (!document || !selection) return undefined;
	const page = selection.pageId
		? document.pages.find((page) => page.id === selection.pageId)
		: document.pages[pageIndex];
	const stack = [...(page?.shapes ?? [])];
	while (stack.length) {
		const shape = stack.pop()!;
		if (shape.id === selection.id) return shape;
		for (const child of shape.children) stack.push(child);
	}
	return undefined;
}
export function safeExternalHref(value: string): string | undefined {
	if (
		value.length > 4096 ||
		/[\u0000-\u0020\u007f-\u009f\\]/u.test(value) ||
		/%(?![0-9a-f]{2})/iu.test(value) ||
		/%(?:0[0-9a-f]|1[0-9a-f]|7f|8[0-9a-f]|9[0-9a-f])/iu.test(value)
	)
		return undefined;
	try {
		const url = new URL(value);
		if (!['http:', 'https:', 'mailto:'].includes(url.protocol) || url.username || url.password)
			return undefined;
		if (
			url.protocol !== 'mailto:' &&
			(!/^https?:\/\/[^/]/iu.test(value) || /^https?:\/\/[^/?#]*@/iu.test(value))
		)
			return undefined;
		return url.href;
	} catch {
		return undefined;
	}
}
export function shapeDetails(shape: VisioShape): DocumentFragment {
	const fragment = document.createDocumentFragment();
	let characters = 100_000,
		rows = 200,
		truncated = false;
	const preview = (value: string, limit = 2048) => {
		const length = Math.max(0, Math.min(limit, characters));
		characters -= Math.min(length, value.length);
		if (value.length <= length) return value;
		truncated = true;
		return value.slice(0, length) + '…';
	};
	const title = document.createElement('p');
	title.textContent = preview(`${shape.name || 'Shape'} · ID ${shape.id}`);
	fragment.append(title);
	if (shape.screenTip) {
		const tip = document.createElement('p');
		tip.dataset.screenTip = '';
		tip.textContent = preview(`ScreenTip: ${shape.screenTip}`);
		fragment.append(tip);
	}
	const fields = (shape.shapeData ?? []).filter((field) => !field.invisible);
	if (fields.length) {
		const heading = document.createElement('h3');
		heading.textContent = 'Shape data';
		fragment.append(heading);
		const list = document.createElement('dl');
		for (const field of fields) {
			if (--rows < 0 || characters <= 0) {
				truncated = true;
				break;
			}
			const label = document.createElement('dt'),
				value = document.createElement('dd');
			label.textContent = preview(field.label || field.name || field.id);
			const cached =
				field.value === undefined ? (field.rawValue ?? 'No cached value') : String(field.value);
			value.textContent =
				preview(cached) +
				(field.valueKind === 'date'
					? ' (serial days)'
					: field.valueKind === 'duration'
						? ' (days)'
						: '');
			if (field.prompt) label.title = preview(field.prompt, 512);
			if (field.error)
				value.append(document.createTextNode(preview(` (saved error: ${field.error})`)));
			list.append(label, value);
		}
		fragment.append(list);
	} else {
		const empty = document.createElement('p');
		empty.textContent = 'No Shape Data';
		fragment.append(empty);
	}
	const define = document.createElement('button');
	define.type = 'button';
	define.dataset.defineShapeData = '';
	define.textContent = 'Define Shape Data...';
	fragment.append(define);
	const links = (shape.hyperlinks ?? []).filter((link) => !link.invisible);
	if (links.length) {
		const heading = document.createElement('h3');
		heading.textContent = 'Links';
		fragment.append(heading);
		const list = document.createElement('ul');
		for (const link of links) {
			if (--rows < 0 || characters <= 0) {
				truncated = true;
				break;
			}
			const item = document.createElement('li'),
				label = preview(link.description || link.name || link.address || link.subAddress || 'Link');
			const href = link.target.kind === 'external' ? safeExternalHref(link.target.href) : undefined;
			if (href) {
				const anchor = document.createElement('a');
				anchor.textContent = label;
				anchor.href = href;
				anchor.target = '_blank';
				anchor.rel = 'noopener noreferrer';
				item.append(anchor);
			} else {
				item.textContent =
					link.target.kind === 'internal'
						? `${label} (internal target: ${preview(link.target.subAddress)})`
						: `${label} (unavailable)`;
				if (link.target.kind === 'unresolved') item.title = preview(link.target.reason, 512);
			}
			list.append(item);
		}
		fragment.append(list);
	}
	if (truncated) {
		const note = document.createElement('p');
		note.textContent =
			'Some fields or values are shortened in this preview. Full cached metadata remains in the document model.';
		fragment.append(note);
	}
	return fragment;
}
