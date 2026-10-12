import { describe, expect, it } from 'vitest';
import { shadcnBridge, themeBridge } from './theme-bridge';

describe('themeBridge', () => {
	it('declares each mapped token on the selector and skips empty ones', () => {
		const css = themeBridge(':host', {
			'--office-accent': 'var(--brand)',
			'--office-border': '',
		});
		expect(css.startsWith(':host {\n\t--office-accent: var(--brand);\n')).toBe(true);
		expect(css).not.toContain('--office-border:');
	});

	it('declares the tokens derived from a mapped one again, so they follow the product', () => {
		// The page theme resolves `--office-select-background` on :root; without this a light
		// viewer on a dark system painted its selects with the page's dark background.
		const css = themeBridge(':host > *', { '--office-background': 'var(--surface)' });
		expect(css).toContain('--office-select-background: var(--office-background, #ffffff);');
		expect(css).toContain('--office-field-background: var(--office-background, #ffffff);');
		// Through another derived token too.
		expect(css).toContain('--office-popover: var(--office-background, #ffffff);');
		expect(css).toContain('--office-select-option-active:');
		expect(css).not.toContain('--office-field-border:');
	});
});

describe('shadcnBridge', () => {
	const css = shadcnBridge(':host', '--dve-');

	it('maps the shadcn names a product already has onto the office tokens', () => {
		expect(css).toContain('--office-foreground: var(--dve-foreground);');
		expect(css).toContain('--office-surface: var(--dve-card);');
		expect(css).toContain('--office-selected: var(--dve-accent);');
		expect(css).toContain('--office-accent: var(--dve-primary);');
		expect(css).toContain('--office-danger: var(--dve-destructive);');
	});

	it('falls back from the popover text to the plain foreground', () => {
		expect(css).toContain(
			'--office-popover-foreground: var(--dve-popover-foreground, var(--dve-foreground));',
		);
	});

	it('takes literal fallbacks and extra tokens', () => {
		const withOptions = shadcnBridge('.viewer', '--pptx-', {
			fallbacks: { foreground: '#f3f4f6' },
			extra: { '--office-font': 'system-ui, sans-serif' },
		});
		expect(withOptions.startsWith('.viewer {')).toBe(true);
		expect(withOptions).toContain('--office-foreground: var(--pptx-foreground, #f3f4f6);');
		expect(withOptions).toContain('--office-font: system-ui, sans-serif;');
	});
});
