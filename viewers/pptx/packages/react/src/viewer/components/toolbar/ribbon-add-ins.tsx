import type { PptxUiRibbonAddInElement, RibbonAddInTab } from 'ooxml-ui/pptx';
import { visibleRibbonAddIns } from 'ooxml-ui/pptx';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

const NO_ADD_INS: readonly RibbonAddInTab[] = [];

/**
 * The host's ribbon tabs (the `ribbonAddIns` prop). `PowerPointViewer` provides them; a toolbar
 * rendered on its own sees none.
 */
export const RibbonAddInsContext = createContext<readonly RibbonAddInTab[]>(NO_ADD_INS);

export interface RibbonAddInTabs {
	/** The host tabs the ribbon shows, in order. */
	visible: RibbonAddInTab[];
	/** The host tab being shown, or null when a fixed or contextual tab is. */
	active: RibbonAddInTab | null;
	/** True for the one render between losing the tab and the fallback landing. */
	fellBack: boolean;
	select: (id: string | null) => void;
}

/**
 * Which host tab the ribbon shows. Choosing one is local ribbon state, like a contextual tab; a
 * click on any other tab clears it. When the host removes the chosen tab, `onFallback` moves the
 * viewer's own section back to Home.
 */
export function useRibbonAddInTabs(onFallback: () => void): RibbonAddInTabs {
	const tabs = useContext(RibbonAddInsContext);
	const visible = useMemo(() => visibleRibbonAddIns(tabs), [tabs]);
	const [chosen, setChosen] = useState<string | null>(null);
	const active = chosen ? (visible.find((tab) => tab.id === chosen) ?? null) : null;
	const fellBack = chosen !== null && active === null;
	useEffect(() => {
		if (fellBack) {
			setChosen(null);
			onFallback();
		}
	}, [fellBack, onFallback]);
	return { visible, active, fellBack, select: setChosen };
}

/** A host tab's ribbon content: the shared element draws it and runs its commands. */
export function RibbonAddInSection({ tab }: { tab: RibbonAddInTab }): React.ReactElement {
	const ref = useRef<PptxUiRibbonAddInElement>(null);
	useEffect(() => {
		if (ref.current) {
			ref.current.tab = tab;
		}
	}, [tab]);
	return <pptx-ui-ribbon-add-in ref={ref} />;
}
