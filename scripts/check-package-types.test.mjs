import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classify, describe } from './check-package-types.mjs';

const unresolved = {
	kind: 'InternalResolutionError',
	resolutionOption: 'node16',
	fileName: '/node_modules/ooxml-core/dist/diagram/engine/text-measure.d.ts',
	moduleSpecifier: '../../text/font-metrics/font-advance-widths.generated',
};

test('node10 problems never fail, whichever field names the mode', () => {
	const { errors, warnings } = classify([
		{ kind: 'NoResolution', entrypoint: './xml', resolutionKind: 'node10' },
		{ ...unresolved, resolutionOption: 'node10' },
	]);
	assert.deepEqual(errors, []);
	assert.deepEqual(warnings, []);
});

test('a declaration import NodeNext cannot resolve fails the check', () => {
	assert.deepEqual(classify([unresolved]).errors, [unresolved]);
	assert.equal(
		describe(unresolved),
		'InternalResolutionError (node16): ooxml-core/dist/diagram/engine/text-measure.d.ts imports "../../text/font-metrics/font-advance-widths.generated"',
	);
});

test('require problems fail only packages that support require', () => {
	const cjs = { kind: 'CJSResolvesToESM', entrypoint: '.', resolutionKind: 'node16-cjs' };
	assert.deepEqual(classify([cjs]).errors, [cjs]);
	assert.deepEqual(classify([cjs], { esmOnly: true }).errors, []);
});

test('FalseESM is a known warning, not an error', () => {
	const falseEsm = { kind: 'FalseESM', entrypoint: './pptx', resolutionKind: 'node16-cjs' };
	assert.deepEqual(classify([falseEsm]), { errors: [], warnings: [falseEsm] });
	assert.equal(describe(falseEsm), 'FalseESM (node16-cjs): "./pptx"');
});
