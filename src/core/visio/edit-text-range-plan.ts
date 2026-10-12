import { fail } from './package-common';
import { decodeVisioPlainText } from './plain-text';
import type { VisioTextRangesEdit } from './edit-text-range-commands';

/** Source token surgery preserves marker nodes and stored row identities. */
export function textRangeNodes(
	node: Element,
	edit: VisioTextRangesEdit,
): { changed: boolean; nodes: Node[] } {
	const tokens: { node: Node; start: number; end: number; field?: boolean }[] = [];
	let stored = '';
	for (const part of Array.from(node.childNodes)) {
		const start = stored.length;
		// A field is one atomic token: its cached text counts, but ranges may not enter it.
		const field = part.nodeType === 1 && (part as Element).localName === 'fld';
		if (part.nodeType === 3 || part.nodeType === 4) stored += part.nodeValue ?? '';
		else if (field) stored += part.textContent ?? '';
		tokens.push({ node: part, start, end: stored.length, ...(field ? { field } : {}) });
	}
	if (decodeVisioPlainText(stored) !== edit.expectedText)
		fail('EDIT_STALE_TEXT', 'Original text no longer matches the range command.');
	const changed = edit.ranges.some(
		(range) => edit.expectedText.slice(range.start, range.end) !== range.text,
	);
	if (!changed) return { changed: false, nodes: [] };
	for (const token of tokens)
		if (
			token.field &&
			edit.ranges.some((range) => range.start < token.end && range.end > token.start)
		)
			fail(
				'UNSUPPORTED_TEXT_RANGE',
				'Text fields are atomic: edit the text around a field, not the field itself.',
			);
	const starts: number[] = [],
		deltas: number[] = [];
	let delta = 0;
	for (const range of edit.ranges) {
		starts.push(range.start + delta);
		delta += range.text.length - (range.end - range.start);
		deltas.push(delta);
	}
	const length = edit.expectedText.length + delta;
	if (!length && tokens.some((token) => token.node.nodeType === 1))
		fail(
			'UNSUPPORTED_TEXT_RANGE',
			'Deleting all rich text has unproven native insertion-style behavior.',
		);
	if (tokens.some((token) => token.node.nodeType === 1)) {
		let start = 0,
			index = 0;
		while (start < edit.expectedText.length) {
			const newline = edit.expectedText.indexOf('\n', start),
				end = newline < 0 ? edit.expectedText.length : newline;
			let bodyLength = end - start;
			while (index < edit.ranges.length && edit.ranges[index]!.start < end) {
				const range = edit.ranges[index++]!;
				bodyLength += range.text.length - (range.end - range.start);
			}
			if (end > start && !bodyLength)
				fail(
					'UNSUPPORTED_TEXT_RANGE',
					'Deleting an entire rich paragraph body has unproven native insertion-style behavior.',
				);
			start = end + 1;
		}
	}
	const position = (offset: number): number => {
		let low = 0,
			high = edit.ranges.length;
		while (low < high) {
			const middle = (low + high) >>> 1;
			if (edit.ranges[middle]!.start < offset) low = middle + 1;
			else high = middle;
		}
		const index = low - 1;
		if (index < 0) return offset;
		const range = edit.ranges[index]!;
		return offset <= range.end ? starts[index]! + range.text.length : offset + deltas[index]!;
	};
	const output: { position: number; priority: number; node: Node }[] = [];
	const append = (token: (typeof tokens)[number], start: number, end: number) => {
		if (end <= start) return;
		const part =
			start === token.start && end === token.end ? token.node : token.node.cloneNode(false);
		if (part !== token.node)
			part.nodeValue = (token.node.nodeValue ?? '').slice(start - token.start, end - token.start);
		output.push({ position: position(start), priority: 2, node: part });
	};
	let first = 0;
	for (const token of tokens) {
		if (token.node.nodeType === 1) {
			output.push({
				position: position(token.start),
				priority: token.field ? 2 : 0,
				node: token.node,
			});
			continue;
		}
		const end = length ? token.end : Math.min(token.end, edit.expectedText.length);
		let cursor = token.start;
		while (first < edit.ranges.length && edit.ranges[first]!.end <= cursor) first++;
		for (
			let index = first;
			index < edit.ranges.length && edit.ranges[index]!.start < end;
			index++
		) {
			const range = edit.ranges[index]!;
			append(token, cursor, Math.min(end, range.start));
			cursor = Math.max(cursor, Math.min(end, range.end));
		}
		append(token, cursor, end);
	}
	for (let index = 0; index < edit.ranges.length; index++) {
		const text = edit.ranges[index]!.text;
		if (text)
			output.push({
				position: starts[index]!,
				priority: 1,
				node: node.ownerDocument!.createTextNode(text),
			});
	}
	output.sort((a, b) => a.position - b.position || a.priority - b.priority);
	let characterPosition = -1,
		characterRow: string | null = null;
	for (const item of output) {
		if (item.node.nodeType !== 1 || (item.node as Element).localName !== 'cp') continue;
		const row = (item.node as Element).getAttribute('IX');
		if (item.position === characterPosition && row !== characterRow)
			fail(
				'UNSUPPORTED_TEXT_RANGE',
				'Consuming complete character runs creates ambiguous native marker boundaries.',
			);
		characterPosition = item.position;
		characterRow = row;
	}
	return { changed: true, nodes: output.map((item) => item.node) };
}
