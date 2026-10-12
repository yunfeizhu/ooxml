import { describe, expect, it } from 'vitest';

import * as angularCopy from '../../../../../demos/pptx/demo-angular/src/demo-locales';
import { LANGUAGES as angularLanguages } from '../../../../../demos/pptx/demo-angular/src/languages';
import * as reactCopy from '../../../../../demos/pptx/demo-react/demo-locales';
import { languages as reactLanguages } from '../../../../../demos/pptx/demo-react/languages';
import * as svelteCopy from '../../../../../demos/pptx/demo-svelte/src/demo-locales';
import { languages as svelteLanguages } from '../../../../../demos/pptx/demo-svelte/src/languages';
import * as vanillaCopy from '../../../../../demos/pptx/demo-vanilla/src/demo-locales';
import { languages as vanillaLanguages } from '../../../../../demos/pptx/demo-vanilla/src/languages';
import * as vueCopy from '../../../../../demos/pptx/demo-vue/src/demo-locales';
import { languages as vueLanguages } from '../../../../../demos/pptx/demo-vue/src/languages';
import { LOCALE_CATALOG, translationsEn } from '../../../../../src/ui/src/pptx/i18n';
import { localeSectionNameForKey } from '../../../scripts/locale-sections';
import { translationsZhCN } from './zh-CN';

describe('simplified Chinese reference locale', () => {
	it('has a native label in the language catalog', () => {
		expect(LOCALE_CATALOG.find(({ code }) => code === 'zh-CN')?.nativeLabel).toBe('简体中文');
	});

	it('assigns every canonical key to a section for future regeneration', () => {
		for (const key of Object.keys(translationsEn)) {
			expect(localeSectionNameForKey(key)).toBeTruthy();
		}
	});

	it('uses editor terminology and keeps file formats and addresses intact', () => {
		const expected = {
			'pptx.statusBar.language': '中文（简体）',
			'pptx.common.ok': '确定',
			'pptx.ribbon.tab.home': '开始',
			'pptx.image.cropBottom': '底部裁剪',
		};
		for (const [key, value] of Object.entries(expected)) {
			expect(translationsZhCN[key]).toBe(value);
		}
		for (const [key, english] of Object.entries(translationsEn)) {
			if (/^(?:https?:\/\/|wss?:\/\/)/u.test(english) && !english.includes(' ')) {
				expect(translationsZhCN[key]).toBe(english);
			}
			expect(translationsZhCN[key]).not.toMatch(/[\u200b-\u200d\ufeff]/u);
		}
	});

	for (const { binding, languages, copy } of [
		{ binding: 'React', languages: reactLanguages, copy: reactCopy },
		{ binding: 'Vue', languages: vueLanguages, copy: vueCopy },
		{ binding: 'Angular', languages: angularLanguages, copy: angularCopy },
		{ binding: 'Svelte', languages: svelteLanguages, copy: svelteCopy },
		{ binding: 'Vanilla', languages: vanillaLanguages, copy: vanillaCopy },
	]) {
		it(`${binding} offers Chinese and translates the complete demo shell`, () => {
			expect(languages.find(({ code }) => code === 'zh-CN')?.label).toBe('简体中文');
			expect(Object.keys(copy.demoStringsZhCN).sort()).toStrictEqual(
				Object.keys(copy.demoStringsEn).sort(),
			);
			for (const value of Object.values(copy.demoStringsZhCN)) {
				expect(value).toMatch(/\p{Script=Han}/u);
			}
		});
	}
});
