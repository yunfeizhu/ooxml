// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { OFFICE_UI_TAGS, registerOfficeUi } from './index';
import { THEME_CSS } from './theme';
import { OFFICE_TOKENS, tok } from './tokens';

beforeAll(() => registerOfficeUi());

/** The CSS a control renders into its shadow root (jsdom uses the `<style>` fallback). */
function shadowCss(tag: string): string {
	const el = document.createElement(tag);
	document.body.append(el);
	const root = el.shadowRoot!;
	const sheets = (root as ShadowRoot & { adoptedStyleSheets?: CSSStyleSheet[] }).adoptedStyleSheets;
	const text = sheets?.length
		? sheets.map((s) => [...s.cssRules].map((r) => r.cssText).join('\n')).join('\n')
		: [...root.querySelectorAll('style')].map((s) => s.textContent).join('\n');
	el.remove();
	return text;
}

/** Strip token references (with their defaults), media queries and keyframe percentages. */
function outsideTokens(css: string): string {
	let text = css.replace(/@media[^{]*\{/g, '{');
	// Remove var(...) including nested parentheses in defaults.
	for (let i = 0; i < 5; i++)
		text = text.replace(/var\(--[\w-]+(?:,(?:[^()]|\([^()]*\))*)?\)/g, 'T');
	return text;
}

describe('design tokens', () => {
	it('declares every token on :root in the theme, with the table default', () => {
		for (const [name, value] of Object.entries(OFFICE_TOKENS))
			expect(THEME_CSS, name).toContain(`${name}: ${value};`);
		expect(tok('--office-accent')).toBe('var(--office-accent, #2563eb)');
	});

	it('gives every control CSS free of raw colours and lengths outside tokens', () => {
		const offenders: string[] = [];
		for (const tag of OFFICE_UI_TAGS) {
			const raw = outsideTokens(shadowCss(tag)).match(
				// Negative lengths count too: a leading minus is part of the raw value.
				/#[0-9a-f]{3,8}\b|(?<![\w.])-?\d*\.?\d+px\b|rgba?\([^)]*\)/gi,
			);
			if (raw) offenders.push(`${tag}: ${[...new Set(raw)].join(', ')}`);
		}
		expect(offenders).toEqual([]);
	});

	it('references only declared tokens (private --_ helpers aside)', () => {
		const declared = new Set(Object.keys(OFFICE_TOKENS));
		const unknown = new Set<string>();
		for (const tag of OFFICE_UI_TAGS)
			for (const [, name] of shadowCss(tag).matchAll(/var\((--office-[\w-]+)/g))
				if (!declared.has(name!) && name !== '--office-switch-knob-travel') unknown.add(name!);
		expect([...unknown]).toEqual([]);
	});

	it('lets a host retheme a control by overriding one token', () => {
		const button = document.createElement('office-ui-button');
		document.body.append(button);
		expect(shadowCss('office-ui-button')).toContain('var(--office-radius, 4px)');
		button.remove();
	});
});
