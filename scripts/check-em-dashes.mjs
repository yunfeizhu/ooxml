/**
 * AGENTS.md bans the em-dash (U+2014) from source, comments, docs and UI copy. This fails on lines
 * a change adds with one, and annotates each line. Lines already on main are left alone.
 * Usage: node scripts/check-em-dashes.mjs <base commit>
 *
 * Exempt, as the rule allows: content that renders or asserts the character on purpose. Write it
 * as an escape (`\u2014`, `&mdash;`), or end the line with `em-dash: intended`; fixtures and
 * snapshots are exempt as files.
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const EM_DASH = '\u2014';
const EXEMPT_FILE =
	/(?:^|\/)(?:__fixtures__|fixtures|__snapshots__)\/|\.snap$|(?:^|\/)CHANGELOG\.md$/;
const EXEMPT_LINE = /em-dash: intended/;

/** `{ file, line, text }` for every added line of a zero-context unified diff with an em-dash. */
export function addedEmDashes(diff) {
	const found = [];
	let file;
	let line = 0;
	for (const row of diff.split('\n')) {
		if (row.startsWith('+++ ')) {
			file = row === '+++ /dev/null' ? undefined : row.slice(4).replace(/^b\//, '');
			continue;
		}
		const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(row);
		if (hunk) {
			line = Number(hunk[1]);
			continue;
		}
		if (row.startsWith('+')) {
			const text = row.slice(1);
			if (file && text.includes(EM_DASH) && !EXEMPT_FILE.test(file) && !EXEMPT_LINE.test(text)) {
				found.push({ file, line, text: text.trim() });
			}
			line += 1;
		}
	}
	return found;
}

function main([base]) {
	if (!base || /^0+$/.test(base)) {
		console.log('No base commit to compare with; nothing to check.');
		return 0;
	}
	const diff = execFileSync(
		'git',
		[
			'-c',
			'core.quotePath=false',
			'diff',
			'--unified=0',
			'--no-color',
			'--no-ext-diff',
			'--text',
			`${base}...HEAD`,
		],
		{ encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 },
	);
	const found = addedEmDashes(diff);
	for (const { file, line } of found) {
		console.log(
			`::error file=${file},line=${line}::Em-dash (U+2014): use a colon, comma, semicolon, parentheses or a spaced hyphen (AGENTS.md, Style).`,
		);
	}
	console.log(`${found.length} added line(s) with an em-dash.`);
	return found.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	process.exitCode = main(process.argv.slice(2));
}
