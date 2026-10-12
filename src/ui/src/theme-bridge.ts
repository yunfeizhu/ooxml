import { OFFICE_TOKENS, type OfficeToken } from './tokens';

/**
 * Feeds the `--office-*` tokens from a product's own theme, so the shared elements follow it.
 * Products (docx, xlsx, pptx, visio) already name their theme after shadcn/ui
 * (`--<prefix>foreground`, `--<prefix>muted-foreground`, ...); `shadcnBridge('--dve-')` is the
 * whole bridge for such a product. `themeBridge` takes any mapping for the rest.
 *
 * The CSS is declared on the selector you give (usually `:host` inside a shadow root, or the
 * product's root element), not on `:root`: a product's colours often resolve where they are read,
 * so a nested theme, a dark scheme or a host override keeps working. Pure strings, no DOM.
 */
export type ThemeBridgeMap = Partial<Record<OfficeToken, string>>;

/** The shadcn token names each `--office-*` colour reads, without the product prefix. */
const SHADCN_NAMES: ReadonlyArray<readonly [OfficeToken, string, string?]> = [
	['--office-foreground', 'foreground'],
	['--office-muted-foreground', 'muted-foreground'],
	['--office-background', 'background'],
	['--office-surface', 'card'],
	['--office-selected', 'accent'],
	['--office-border', 'border'],
	['--office-accent', 'primary'],
	['--office-accent-foreground', 'primary-foreground'],
	['--office-ring', 'ring'],
	['--office-popover', 'popover'],
	// Popover text falls back to the plain foreground, as it does in the shadcn themes.
	['--office-popover-foreground', 'popover-foreground', 'foreground'],
	['--office-danger', 'destructive'],
	['--office-danger-foreground', 'destructive-foreground'],
];

/** The `--office-*` tokens a token's default reads, such as `--office-background` for selects. */
const reads = (value: string) => [...value.matchAll(/var\((--office-[\w-]+)/g)].map((m) => m[1]!);

/**
 * The tokens whose defaults read (directly or through another default) one of `bridged`. The
 * theme declares those defaults on `:root`, and a `var()` resolves where it is declared, so a
 * bridge that only re-points `--office-background` would leave `--office-select-background`
 * holding the page's colour (black selects on a light viewer when the system is dark).
 */
function derivedTokens(bridged: ReadonlySet<string>): [string, string][] {
	const derived = new Map<string, string>();
	let grew = true;
	while (grew) {
		grew = false;
		for (const [name, value] of Object.entries(OFFICE_TOKENS)) {
			if (bridged.has(name) || derived.has(name)) continue;
			if (reads(value).some((token) => bridged.has(token) || derived.has(token))) {
				derived.set(name, value);
				grew = true;
			}
		}
	}
	return [...derived];
}

/**
 * `selector { --office-x: value; ... }` for a mapping; entries without a value are skipped. The
 * tokens derived from a mapped one are declared again on the selector with their defaults, so they
 * follow the product's colours instead of the page's.
 */
export function themeBridge(selector: string, map: ThemeBridgeMap): string {
	const mapped = Object.entries(map).filter((entry): entry is [string, string] => !!entry[1]);
	const lines = [...mapped, ...derivedTokens(new Set(mapped.map(([name]) => name)))].map(
		([name, value]) => `\t${name}: ${value};`,
	);
	return `${selector} {\n${lines.join('\n')}\n}\n`;
}

export interface ShadcnBridgeOptions {
	/** Extra or overriding `--office-*` values, for example `{ '--office-font': '...' }`. */
	extra?: ThemeBridgeMap;
	/** A literal each theme variable falls back to when the product does not define it. */
	fallbacks?: Partial<Record<string, string>>;
}

/**
 * The bridge for a product whose theme variables are `<prefix><shadcn-name>`
 * (`prefix` includes the dashes, for example `'--dve-'` or `'--pptx-'`).
 */
export function shadcnBridge(
	selector: string,
	prefix: string,
	options: ShadcnBridgeOptions = {},
): string {
	const map: ThemeBridgeMap = {};
	for (const [token, name, fallbackName] of SHADCN_NAMES) {
		const fallback = options.fallbacks?.[name];
		const inner = fallbackName ? `var(${prefix}${fallbackName})` : fallback;
		map[token] = `var(${prefix}${name}${inner ? `, ${inner}` : ''})`;
	}
	return themeBridge(selector, { ...map, ...options.extra });
}
