import { vi } from 'vitest';

// Lit's development build is what the tests should run (it adds checks), so mark its two
// expected warnings as already issued. `no-override-create-property` only applies to standard
// decorators; OfficeElement declares properties statically, so its override does run.
(globalThis as { litIssuedWarnings?: Set<string> }).litIssuedWarnings = new Set([
	'dev-mode',
	'no-override-create-property',
]);

// jsdom has no canvas: getContext() logs "Not implemented" and returns null. Return the same null
// without the noise; every caller falls back when there is no 2D context.
if (typeof HTMLCanvasElement !== 'undefined')
	HTMLCanvasElement.prototype.getContext = (() =>
		null) as typeof HTMLCanvasElement.prototype.getContext;

// `vi.waitFor` polls for 1s by default. Mounting a viewer in jsdom costs about a second per ribbon
// render, so under a parallel run a source-backed edit can settle after that and the wait fails
// although the behaviour is right. Give it the same headroom as `testTimeout`, keeping any explicit
// timeout a test passes.
const waitFor = vi.waitFor.bind(vi);
vi.waitFor = ((callback, options) =>
	waitFor(
		callback,
		typeof options === 'number' ? options : { timeout: 10_000, ...options },
	)) as typeof vi.waitFor;
