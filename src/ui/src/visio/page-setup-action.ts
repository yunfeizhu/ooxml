import type { VisioBackgroundStyle, VisioBorderStyle } from 'ooxml-core/visio';

/** The Page Setup dialog's tabs, as Visio orders them. */
export type VisioPageSetupTab = 'print' | 'size' | 'scale' | 'properties';
/** Design > Page Setup, Backgrounds and Borders & Titles, and View > Page Breaks. */
export type VisioPageSetupCommand =
	| { op: 'orientation'; value: 'portrait' | 'landscape' }
	| { op: 'size'; id: string }
	| { op: 'fit' }
	| { op: 'auto-size' }
	| { op: 'dialog'; tab?: VisioPageSetupTab }
	| { op: 'background'; style: VisioBackgroundStyle | null }
	| { op: 'background-color'; color: string }
	| { op: 'border'; style: VisioBorderStyle | null }
	| { op: 'page-breaks' }
	/** Design > Connectors > Show Line Jumps: the page's LineJumpCode on (1) or off (0). */
	| { op: 'line-jumps' };
