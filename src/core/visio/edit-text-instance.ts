import { fail } from './package-common';
import { attribute, children } from './sheet';
import { decodeVisioPlainText, encodeVisioPlainText } from './plain-text';

/** Resolves the master shape a stencil instance (or a sub-shape of one) inherits from. */
export type MasterTemplate = (masterId: string, masterShapeId?: string) => Promise<Element>;

const fieldSections = (shape: Element) =>
	children(shape, 'Section').filter((section) => attribute(section, 'N') === 'Field');
const isMarkup = (node: Node) => node.nodeType !== 3 && node.nodeType !== 4;
/** Text with nothing but characters and Visio's run markers (`cp`, `pp`, `tp`, `fld`). */
const knownMarkup = (text: Element) =>
	Array.from(text.childNodes).every(
		(node) => !isMarkup(node) || ['cp', 'pp', 'tp', 'fld'].includes((node as Element).localName),
	);

/** A zero, error-free, formula-free cached lock; anything else is treated as protected. */
function assertUnlocked(shape: Element, template: Element): void {
	// A local lock wins; without one the master's applies.
	const local = children(shape, 'Cell').some((cell) => attribute(cell, 'N') === 'LockTextEdit');
	for (const cell of children(local ? shape : template, 'Cell')) {
		if (attribute(cell, 'N') !== 'LockTextEdit') continue;
		if (cell.hasAttribute('E') || cell.hasAttribute('F') || Number(attribute(cell, 'V')) !== 0)
			fail('EDIT_PROTECTED_CELL', 'The shape is protected against text editing.');
	}
}

function single(shape: Element, what: string): Element | undefined {
	const texts = children(shape, 'Text');
	if (texts.length > 1) fail('UNSUPPORTED_TEXT_EDIT', `${what} has more than one Text element.`);
	return texts[0];
}

/** Schema order: cells and sections, then Text, then data, foreign data and sub-shapes. */
function insertBeforeTail(shape: Element, node: Element, tail: readonly string[]): void {
	const after = Array.from(shape.childNodes).find(
		(child) => child.nodeType === 1 && tail.includes((child as Element).localName),
	);
	shape.insertBefore(node, after ?? null);
}
const AFTER_TEXT = ['Data1', 'Data2', 'Data3', 'ForeignData', 'Shapes'];

/**
 * Replace all text of a stencil (master) instance, as typing in one does. Recorded from Visio 16:
 * the instance gains a plain local `Text` and nothing else, even over formatted master text (the
 * first run's format applies); when the master text holds fields, each inherited Field row is
 * marked deleted locally. Master formulas that size the shape from its text are recalculated by
 * Visio when it opens the file; the saved size is kept until then.
 */
export function replaceInstanceText(shape: Element, template: Element, text: string): boolean {
	const local = single(shape, 'The shape');
	const inherited = single(template, 'The master shape');
	if (local && Array.from(local.childNodes).some(isMarkup))
		fail(
			'UNSUPPORTED_TEXT_EDIT',
			'This stencil shape has its own formatted text; edit part of the text instead.',
		);
	if (!local && inherited && !knownMarkup(inherited))
		fail('UNSUPPORTED_TEXT_EDIT', 'The master text has markup this editor does not know.');
	if (fieldSections(shape).length)
		fail('UNSUPPORTED_TEXT_EDIT', 'This stencil shape has its own text fields; edit around them.');
	assertUnlocked(shape, template);
	const fields = local
		? []
		: fieldSections(template).flatMap((section) => children(section, 'Row'));
	const current = local ?? inherited;
	if (!fields.length && current && !Array.from(current.childNodes).some(isMarkup))
		if (decodeVisioPlainText(current.textContent ?? '') === text) return false;
	const document = shape.ownerDocument!;
	if (fields.length) {
		const section = document.createElementNS(shape.namespaceURI, 'Section');
		section.setAttribute('N', 'Field');
		for (const row of fields) {
			const index = attribute(row, 'IX');
			if (index === undefined)
				fail('UNSUPPORTED_TEXT_EDIT', 'The master text fields cannot be identified.');
			const removed = document.createElementNS(shape.namespaceURI, 'Row');
			removed.setAttribute('IX', index);
			removed.setAttribute('Del', '1');
			section.appendChild(removed);
		}
		insertBeforeTail(shape, section, ['Text', ...AFTER_TEXT]);
	}
	let node = local;
	if (!node) {
		node = document.createElementNS(shape.namespaceURI, 'Text');
		insertBeforeTail(shape, node, AFTER_TEXT);
	}
	while (node.firstChild) node.removeChild(node.firstChild);
	node.appendChild(document.createTextNode(encodeVisioPlainText(text)));
	return true;
}

/**
 * The local `Text` of an instance for a partial (range) edit. Without one, the instance gets a
 * copy of the master's text with its run and field markers, which keep pointing at the inherited
 * rows; that is what Visio saves when text around a field is edited. `discard` removes a copy that
 * turned out to need no change.
 */
export function instanceTextNode(
	shape: Element,
	template: Element,
): { text: Element; discard(): void } {
	const local = single(shape, 'The shape');
	assertUnlocked(shape, template);
	if (local) return { text: local, discard: () => {} };
	const inherited = single(template, 'The master shape');
	if (!inherited) fail('UNSUPPORTED_TEXT_RANGE', 'The stencil shape has no text to edit.');
	if (!knownMarkup(inherited))
		fail('UNSUPPORTED_TEXT_RANGE', 'The master text has markup this editor does not know.');
	if (fieldSections(shape).length)
		fail('UNSUPPORTED_TEXT_RANGE', 'This stencil shape overrides its master text fields.');
	const text = shape.ownerDocument!.importNode(inherited, true) as Element;
	insertBeforeTail(shape, text, AFTER_TEXT);
	return { text, discard: () => void shape.removeChild(text) };
}
