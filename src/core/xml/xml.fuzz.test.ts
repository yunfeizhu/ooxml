import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildXml, parseXml } from './xml';

const name = fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/);
const text = fc.stringMatching(/^[A-Za-z0-9 .,;:!?()-]{0,24}$/);

type Tree = { tag: string; attrs: Record<string, string>; text: string; children: Tree[] };
const leaf: fc.Arbitrary<Tree> = fc.record({
	tag: name,
	attrs: fc.dictionary(name, text, { maxKeys: 3 }),
	text,
	children: fc.constant([]),
});
const branch = (child: fc.Arbitrary<Tree>): fc.Arbitrary<Tree> =>
	fc.record({
		tag: name,
		attrs: fc.dictionary(name, text, { maxKeys: 3 }),
		text,
		children: fc.array(child, { maxLength: 3 }),
	});
const tree = branch(branch(leaf));

function render(node: Tree): string {
	const attrs = Object.entries(node.attrs)
		.map(([key, value]) => ` ${key}="${value}"`)
		.join('');
	return `<${node.tag}${attrs}>${node.text}${node.children.map(render).join('')}</${node.tag}>`;
}

describe('parseXml properties', () => {
	it('only ever returns a document or throws an Error, whatever the input', () => {
		fc.assert(
			fc.property(fc.string({ maxLength: 200 }), (input) => {
				try {
					expect(parseXml(input).documentElement).toBeTruthy();
				} catch (error) {
					expect(error).toBeInstanceOf(Error);
				}
			}),
			{ numRuns: 500 },
		);
	});

	it('rejects every document that declares a DOCTYPE or an entity', () => {
		fc.assert(
			fc.property(fc.string({ maxLength: 60 }), name, (payload, root) => {
				const xml = `<!DOCTYPE ${root} [<!ENTITY x "${payload}">]><${root}>&x;</${root}>`;
				expect(() => parseXml(xml)).toThrow(/DTD or entity/);
			}),
		);
	});

	it('serialises a parsed tree back to a document that parses to the same tree', () => {
		fc.assert(
			fc.property(tree, (generated) => {
				const once = buildXml(parseXml(render(generated)));
				expect(buildXml(parseXml(once))).toBe(once);
			}),
			{ numRuns: 200 },
		);
	});
});
