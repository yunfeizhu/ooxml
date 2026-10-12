/**
 * The host's ribbon tabs (the `ribbonAddIns` prop), shared through context so the ribbon reads
 * them without the prop being threaded through every chrome component. `PowerPointViewer`
 * provides a getter (it follows the prop); a ribbon mounted on its own sees none.
 */
import type { RibbonAddInTab } from 'ooxml-ui/pptx';
import { getContext, setContext } from 'svelte';

const RIBBON_ADD_INS_CONTEXT_KEY = Symbol('pptx-ribbon-add-ins');

type RibbonAddInsReader = () => readonly RibbonAddInTab[] | undefined;

export function provideRibbonAddIns(reader: RibbonAddInsReader): void {
	setContext(RIBBON_ADD_INS_CONTEXT_KEY, reader);
}

export function useRibbonAddIns(): RibbonAddInsReader {
	return (
		getContext<RibbonAddInsReader | undefined>(RIBBON_ADD_INS_CONTEXT_KEY) ?? (() => undefined)
	);
}
