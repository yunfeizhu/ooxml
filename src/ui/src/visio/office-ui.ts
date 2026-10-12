import { registerControls } from '../controls';
import { getIcon, registerIcon } from '../icons';
import { definePresence } from '../presence';

/**
 * Visio-only glyphs (20x20 path data). Neutral Office glyphs come from ooxml-ui; add a glyph
 * there instead when another Office product could use it.
 */
const VISIO_ICONS: Readonly<Record<string, string>> = {
	visioLayers: 'm2.5 7 7.5-4 7.5 4-7.5 4ZM2.5 10.5l7.5 4 7.5-4M2.5 14l7.5 4 7.5-4',
	visioShapeData: 'M3 3.5h14v13H3ZM3 7.5h14M8 7.5v9M10.5 11h4M10.5 14h4',
	visioPagesPane: 'M2.5 3h15v14h-15ZM7 3v14M3.8 6h1.9M3.8 9h1.9M3.8 12h1.9',
	visioInspectorPane: 'M2.5 3h15v14h-15ZM13 3v14M14.5 6h1.5M14.5 9h1.5M14.5 12h1.5',
	visioConnectionPoint: 'M6 6l8 8M14 6l-8 8',
	visioTextBlock: 'M3 6.5h14v7H3ZM6 10h8M10 2.5v4',
	visioChangeShape:
		'M2.5 12.5a4.5 4.5 0 1 0 9 0 4.5 4.5 0 1 0-9 0M10 3h7.5v7.5H10ZM6 5.5 8 3.5M6 5.5 4 3.5',
	visioPresentation: 'M2.5 3.5h15v10h-15ZM10 13.5V17M7 17h6M8.5 6.5l3.5 2-3.5 2Z',
	visioRotateText:
		'M3 16.5 6.5 7l3.5 9.5M4.3 13.5h4.4M12 4.5h1.5a3.5 3.5 0 0 1 3.5 3.5v5M14.5 10.5 17 13l2.5-2.5',
	visioInk: 'M3 16.5c2-5 3-9 5-9s1 6 3 6 2-4 6-8M3 16.5h3',
	visioMacros: 'M5 4.5 2 10l3 5.5M15 4.5l3 5.5-3 5.5M11.5 3.5l-3 13',
	visioPicture: 'M2.5 4h15v12h-15ZM2.5 13l4-4 3 3 2-2 6 5M12.5 7.5h.1',
	visioChart: 'M3 16.5h14M5 16.5v-5M9 16.5V5M13 16.5v-8M17 16.5v-3',
	visioCad: 'M3 17 17 3M3 3h6v6H3ZM11 11h6v6h-6Z',
	visioLink:
		'M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.8.8M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.8-.8',
	visioSymbol: 'M5 16h3.5v-2A5.5 5.5 0 1 1 11.5 14v2H15',
	visioData: 'M3 3.5h14v13H3ZM3 7.5h14M3 11.5h14M8 3.5v13',
};

/** Define the shared Office controls the viewer chrome uses. Idempotent; browser only. */
export function registerViewerControls(registry?: CustomElementRegistry): void {
	for (const [name, path] of Object.entries(VISIO_ICONS))
		if (!getIcon(name)) registerIcon(name, path);
	registerControls(registry);
	definePresence(registry);
}
