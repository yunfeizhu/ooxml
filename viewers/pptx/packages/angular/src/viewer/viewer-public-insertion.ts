import { prepareElementForInsertion } from 'ooxml-ui/pptx';
import type { ElementInsertionTarget } from 'ooxml-ui/pptx';
import type { PptxElement } from 'pptx-viewer-core';

import type { EditorStateService } from './editor-state.service';

/** Public insertion uses the same synchronous commit and editor transaction as the canvas. */
export function insertPublicElement(
	element: PptxElement,
	target: ElementInsertionTarget,
	editor: Pick<EditorStateService, 'addElement'>,
	slideIndex: number,
	commitPendingText: () => void,
): string | undefined {
	const prepared = prepareElementForInsertion(element, target);
	if (!prepared) {
		return undefined;
	}
	commitPendingText();
	editor.addElement(slideIndex, prepared);
	return prepared.id;
}
