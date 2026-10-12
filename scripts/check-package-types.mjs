/**
 * Checks that a package's types resolve the way consumers load it, with Are the Types Wrong
 * (https://arethetypeswrong.github.io) on the packed tarball.
 * Usage: node scripts/check-package-types.mjs <package dir> [--esm-only]
 *
 * attw's own `--profile` ignores a resolution mode only for some problem kinds, so this runs it
 * once, reads the JSON and filters by resolution mode itself:
 * - `node10` never sees `exports`, which every subpath here relies on;
 * - `--esm-only` packages (ooxml-ui) do not support `require`, so `node16-cjs` is ignored too;
 * - FalseESM (a CJS file typed by an ESM `.d.ts`) is known: both packages ship one declaration
 *   tree for `import` and `require`. It is reported as a warning until they ship `.d.cts` files.
 * Everything else, such as a declaration import that NodeNext cannot resolve, fails.
 */
import { execFileSync } from 'node:child_process';
import { closeSync, fstatSync, mkdtempSync, openSync, readSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ATTW = '@arethetypeswrong/cli@0.18.5';
const KNOWN = new Set(['FalseESM']);

/** Splits attw's problems into the ones that fail the check and known, tolerated ones. */
export function classify(problems, { esmOnly = false } = {}) {
	const ignored = new Set(['node10', ...(esmOnly ? ['node16-cjs'] : [])]);
	// A problem names its mode as `resolutionKind`, or (for internal resolution errors) as
	// `resolutionOption`, where `node16` covers both node16 modes.
	const mode = (problem) => problem.resolutionKind ?? problem.resolutionOption;
	const relevant = problems.filter((problem) => !ignored.has(mode(problem)));
	return {
		errors: relevant.filter((problem) => !KNOWN.has(problem.kind)),
		warnings: relevant.filter((problem) => KNOWN.has(problem.kind)),
	};
}

/** One line per problem, naming the entry point or the declaration import that broke. */
export function describe(problem) {
	const where = problem.entrypoint
		? `"${problem.entrypoint}"`
		: problem.typesFileName
			? problem.typesFileName.replace(/^\/node_modules\//, '')
			: problem.fileName
				? `${problem.fileName.replace(/^\/node_modules\//, '')} imports "${problem.moduleSpecifier}"`
				: '';
	const mode = problem.resolutionKind ?? problem.resolutionOption;
	return `${problem.kind}${mode ? ` (${mode})` : ''}${where ? `: ${where}` : ''}`;
}

function main(argv) {
	const directory = argv.find((argument) => !argument.startsWith('--'));
	if (!directory) {
		console.error('Usage: node scripts/check-package-types.mjs <package dir> [--esm-only]');
		return 2;
	}
	// attw's report goes to a file: through a pipe, a report of a few megabytes was cut short when
	// attw exited before the pipe drained.
	const scratch = mkdtempSync(join(tmpdir(), 'ooxml-attw-'));
	const report = join(scratch, 'attw.json');
	let output;
	try {
		const fd = openSync(report, 'w+');
		try {
			execFileSync('bunx', [ATTW, '--pack', resolve(directory), '--format', 'json'], {
				stdio: ['ignore', fd, 'inherit'],
				shell: process.platform === 'win32',
			});
		} catch (error) {
			// attw exits non-zero when it finds any problem; the report is written all the same.
			if (error.status === null) throw error;
		} finally {
			// Read the report back through the descriptor it was written to, not by name again.
			const size = fstatSync(fd).size;
			const buffer = Buffer.alloc(size);
			readSync(fd, buffer, 0, size, 0);
			output = buffer.toString('utf8');
			closeSync(fd);
		}
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
	const { analysis } = JSON.parse(output);
	const { errors, warnings } = classify(analysis.problems, {
		esmOnly: argv.includes('--esm-only'),
	});
	// The known problem repeats on every subpath, so it is one annotation, not one per entry point.
	if (warnings.length) {
		console.log(
			`::warning::${analysis.packageName}: ${warnings.length} entry point(s) type their CommonJS build with ESM declarations (FalseESM); \`require\` consumers need .d.cts files.`,
		);
	}
	for (const problem of errors)
		console.log(`::error::${analysis.packageName}: ${describe(problem)}`);
	console.log(
		`${analysis.packageName}: ${errors.length} type resolution error(s), ${warnings.length} known warning(s).`,
	);
	return errors.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	process.exitCode = main(process.argv.slice(2));
}
