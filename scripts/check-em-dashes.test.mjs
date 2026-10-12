import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addedEmDashes } from './check-em-dashes.mjs';

const dash = '\u2014';

test('reports added lines with an em-dash at their new line numbers', () => {
	const diff = [
		'diff --git a/docs/a.md b/docs/a.md',
		'--- a/docs/a.md',
		'+++ b/docs/a.md',
		'@@ -3,0 +4,2 @@',
		`+First ${dash} added`,
		'+Second, clean',
		'@@ -10 +12 @@',
		`-Old ${dash} line`,
		`+New ${dash} line`,
	].join('\n');
	assert.deepEqual(addedEmDashes(diff), [
		{ file: 'docs/a.md', line: 4, text: `First ${dash} added` },
		{ file: 'docs/a.md', line: 12, text: `New ${dash} line` },
	]);
});

test('removed lines, deleted files, fixtures, snapshots and marked lines are exempt', () => {
	const diff = [
		'--- a/src/old.ts',
		'+++ /dev/null',
		'@@ -1 +0,0 @@',
		`-gone ${dash}`,
		'--- a/src/core/xlsx/__fixtures__/x.xml',
		'+++ b/src/core/xlsx/__fixtures__/x.xml',
		'@@ -0,0 +1 @@',
		`+<t>${dash}</t>`,
		'--- a/src/x.test.ts.snap',
		'+++ b/src/x.test.ts.snap',
		'@@ -0,0 +1 @@',
		`+"${dash}"`,
		'--- a/src/render.ts',
		'+++ b/src/render.ts',
		'@@ -0,0 +1,2 @@',
		`+const glyph = '${dash}'; // em-dash: intended`,
		"+const escaped = '\\u2014';",
	].join('\n');
	assert.deepEqual(addedEmDashes(diff), []);
});
