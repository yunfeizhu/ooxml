import { VisioPackage, VisioPackageError } from './package';
import { related, visioXml } from './parts';
import { attribute, children } from './sheet';

/** Stencil windows read from one drawing; Visio rarely docks more than a handful. */
const MAX_STENCIL_WINDOWS = 32;

/** The built-in stencils this package can open in place of Visio's stencil files. */
export const VISIO_STENCIL_FILES = {
	basic: 'BASIC_U.vssx',
	'basic-flowchart': 'BASFLO_U.vssx',
	'arrow-shapes': 'ARROWS_U.vssx',
} as const;
export type VisioBuiltInStencilId = keyof typeof VISIO_STENCIL_FILES;

const FILES: readonly [RegExp, VisioBuiltInStencilId][] = [
	[/^BASIC_[UM]\.vss[xm]?$/i, 'basic'],
	[/^BASFLO_[UM]\.vss[xm]?$/i, 'basic-flowchart'],
	[/^ARROWS_[UM]\.vss[xm]?$/i, 'arrow-shapes'],
];

/**
 * The built-in stencil that stands in for a Visio stencil file (US or metric units, with or
 * without a folder), or nothing when the file has no built-in counterpart.
 */
export function visioBuiltInStencil(file: string): VisioBuiltInStencilId | undefined {
	const name = file.slice(Math.max(file.lastIndexOf('\\'), file.lastIndexOf('/')) + 1);
	return FILES.find(([pattern]) => pattern.test(name))?.[1];
}

/**
 * The stencils docked in the drawing window when the drawing was saved: the file names (no
 * folder) of its Stencil windows in visio/windows.xml, in window order. The stencil files
 * themselves are never opened. A missing or unreadable windows part gives none.
 */
export async function readVisioStencilWindows(
	pkg: VisioPackage,
	documentPart: string,
): Promise<string[]> {
	try {
		const part = await related(pkg, documentPart, 'windows', false);
		if (!part) return [];
		const names: string[] = [];
		for (const window of children(await visioXml(pkg, part, 'Windows'), 'Window')) {
			if (attribute(window, 'WindowType') !== 'Stencil') continue;
			const file = attribute(window, 'Document') ?? '';
			const name = file.slice(Math.max(file.lastIndexOf('\\'), file.lastIndexOf('/')) + 1);
			// Control characters never belong in a file name; the name is shown as inert text.
			if (!name || name.length > 260 || /[\u0000-\u001f\u007f]/.test(name)) continue;
			if (!names.includes(name)) names.push(name);
			if (names.length >= MAX_STENCIL_WINDOWS) break;
		}
		return names;
	} catch (error) {
		if (error instanceof VisioPackageError && error.code === 'LIMIT_RUNTIME') throw error;
		return [];
	}
}
