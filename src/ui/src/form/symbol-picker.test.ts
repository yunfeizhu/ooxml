import { registerOfficeUi } from '../index';
import { OFFICE_SYMBOLS, parseOfficeSymbolCode } from './symbol-picker';

beforeAll(() => registerOfficeUi());
afterEach(() => document.body.replaceChildren());

describe('office-ui-symbol-picker', () => {
	it('parses printable code points and rejects controls, surrogates and noncharacters', () => {
		expect(parseOfficeSymbolCode('00A9')).toBe('©');
		expect(parseOfficeSymbolCode('U+1F600')).toBe('\u{1f600}');
		expect(parseOfficeSymbolCode(' 0x2122 ')).toBe('™');
		for (const bad of ['', '1F', '7F', 'D800', 'FFFE', 'FDD0', '110000', 'zz'])
			expect(parseOfficeSymbolCode(bad)).toBeUndefined();
	});

	it('emits the picked grid symbol and a typed code, and nothing when disabled', () => {
		document.body.innerHTML = '<office-ui-symbol-picker></office-ui-symbol-picker>';
		const picker = document.body.firstElementChild as HTMLElement & { disabled: boolean };
		const picks: { symbol: string; code: string }[] = [];
		picker.addEventListener('office-symbol-pick', (event) =>
			picks.push((event as CustomEvent<{ symbol: string; code: string }>).detail),
		);
		const buttons = picker.shadowRoot!.querySelectorAll<HTMLButtonElement>('.symbol');
		expect(buttons).toHaveLength(OFFICE_SYMBOLS.length);
		expect(picker.getAttribute('aria-label')).toBe('Symbols');
		buttons[0]!.click();
		expect(picks).toEqual([{ symbol: '©', code: 'U+00A9' }]);
		const input = picker.shadowRoot!.querySelector('input')!;
		const insert = picker.shadowRoot!.querySelector<HTMLButtonElement>('.insert')!;
		expect(insert.disabled).toBe(true);
		input.value = '2603';
		input.dispatchEvent(new Event('input'));
		expect(picker.shadowRoot!.querySelector('.preview')!.textContent).toBe('☃');
		insert.click();
		expect(picks.at(-1)).toEqual({ symbol: '☃', code: 'U+2603' });
		picker.disabled = true;
		buttons[1]!.click();
		expect(picks).toHaveLength(2);
	});
});
