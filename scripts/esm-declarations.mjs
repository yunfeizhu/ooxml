import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// Specifiers that already name what the consumer loads: a module with its runtime extension, or a
// component file whose declaration sits next to it (`Component.svelte` -> `Component.svelte.d.ts`).
const RESOLVED = /\.(?:[cm]?js|json|svelte|vue)$/;

/** Keep bundled TS source extensionless while making declaration trees usable in NodeNext. */
export function rewriteEsmDeclarationImports(directory) {
	let changed = 0;
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const file = join(directory, entry.name);
		if (entry.isDirectory()) {
			changed += rewriteEsmDeclarationImports(file);
			continue;
		}
		if (!/\.d\.(?:ts|mts|cts)$/.test(entry.name)) continue;
		const source = readFileSync(file, 'utf8');
		// Skip comments and unrelated strings; only imports, exports and augmentations are paths.
		const output = source.replace(
			/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|(?:\bfrom\s+|\bimport\s*(?:\(\s*)?|\bdeclare\s+module\s+)(['"])(\.{1,2}(?:\/[^'"]*)?)\1|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
			(match, quote, specifier) => {
				if (!specifier || RESOLVED.test(specifier)) return match;
				const base = resolve(dirname(file), specifier);
				// A dotted name such as `widths.generated` is still extensionless, unless it is a real file.
				if (existsSync(base) && statSync(base).isFile()) return match;
				// `.`, `..` and `dir/` can only name a directory's index.
				const directoryOnly = /(?:^|\/)\.{1,2}$|\/$/.test(specifier);
				for (const [declaration, extension] of [
					['.d.ts', '.js'],
					['.d.mts', '.mjs'],
					['.d.cts', '.cjs'],
				]) {
					const target =
						!directoryOnly && existsSync(base + declaration)
							? specifier + extension
							: existsSync(join(base, 'index' + declaration))
								? specifier.replace(/\/$/, '') + '/index' + extension
								: undefined;
					if (target) return match.slice(0, -specifier.length - 1) + target + quote;
				}
				return match;
			},
		);
		if (output !== source) {
			writeFileSync(file, output);
			++changed;
		}
	}
	return changed;
}
