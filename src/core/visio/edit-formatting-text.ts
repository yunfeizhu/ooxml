import { visioThemeColorFormula } from './theme-color-ref';
import { attribute } from './sheet';
import { fail } from './package-common';
import { visioFormulaCachedValue } from './formula';
import { formattingFont } from './edit-formatting-font';
import { assertFormattingText } from './edit-formatting-rows';
import {
	effectiveShapeCell,
	formattingRowContext,
	type FormattingRowContext,
} from './edit-style-admission';
import type { VisioTextFormatEdit } from './edit-formatting-commands';
import type { FormattingWrite } from './edit-formatting';
import {
	characterExtraWrites,
	hasCharacterExtras,
	hasParagraphExtras,
	paragraphExtraWrites,
	textBlockWrites,
} from './edit-formatting-text-extra';

export function textFormattingWrites(
	shape: Element,
	document: Element,
	edit: VisioTextFormatEdit,
	check: () => void,
): { writes: FormattingWrite[]; rows: Map<string, FormattingRowContext> } {
	const rows = new Map<string, FormattingRowContext>();
	if (
		['fontSize', 'fontFamily', 'fontColor', 'bold', 'italic', 'underline', 'strikethrough'].some(
			(key) => edit[key as keyof VisioTextFormatEdit] !== undefined,
		) ||
		hasCharacterExtras(edit)
	)
		rows.set('Character', formattingRowContext(shape, document, 'Character'));
	if (
		edit.bullets !== undefined ||
		edit.indentLeft !== undefined ||
		edit.horizontalAlign !== undefined ||
		hasParagraphExtras(edit)
	)
		rows.set('Paragraph', formattingRowContext(shape, document, 'Paragraph'));
	const characters = rows.get('Character')?.source;
	const paragraphs = rows.get('Paragraph')?.source;
	if (rows.size) assertFormattingText(shape, characters, paragraphs);
	const writes: FormattingWrite[] = [];
	const add = (
		name: string,
		value: string | number,
		unit?: string,
		formula?: string,
		dropUnit?: boolean,
	) =>
		writes.push({
			name,
			value: String(value),
			category: 'TextStyle',
			...(unit ? { unit } : {}),
			...(formula ? { formula } : {}),
			...(dropUnit ? { dropUnit } : {}),
		});
	const scalar = (name: string, max: number, description: string): number => {
		const cell = effectiveShapeCell(
			shape,
			document,
			name,
			'TextStyle',
			rows.get(name.split('.')[0]!),
		);
		// A themed style or bullet has no cached number; readers take it as none, and so does this.
		const cached =
			cell && attribute(cell, 'V') !== 'Themed'
				? visioFormulaCachedValue(attribute(cell, 'V') ?? '', attribute(cell, 'U'))
				: { value: 0, unit: 'scalar' };
		if (
			cached.unit !== 'scalar' ||
			!Number.isSafeInteger(cached.value) ||
			cached.value < 0 ||
			cached.value > max
		)
			fail('UNSUPPORTED_FORMAT_EDIT', `${description} requires a supported scalar value.`);
		return cached.value;
	};
	const font =
		edit.fontFamily === undefined ? undefined : formattingFont(document, edit.fontFamily);
	for (const index of characters ? new Set(['0', ...characters.keys()]) : []) {
		check();
		const name = (cell: string) => `Character.${index}.${cell}`;
		if (edit.fontSize !== undefined) add(name('Size'), edit.fontSize / 72, 'PT');
		if (font) add(name('Font'), font.value, undefined, font.formula);
		if (edit.fontColor !== undefined) {
			add(
				name('Color'),
				edit.fontColor,
				undefined,
				edit.fontColorTheme
					? visioThemeColorFormula(edit.fontColorTheme)
					: `RGB(${[1, 3, 5].map((i) => parseInt(edit.fontColor!.slice(i, i + 2), 16)).join(',')})`,
			);
			add(name('ColorTrans'), 0);
		}
		if (edit.strikethrough !== undefined) add(name('Strikethru'), edit.strikethrough ? 1 : 0);
		if ([edit.bold, edit.italic, edit.underline].some((value) => value !== undefined)) {
			let bits = scalar(name('Style'), 255, 'Character style');
			for (const [value, bit] of [
				[edit.bold, 1],
				[edit.italic, 2],
				[edit.underline, 4],
			] as const)
				if (value !== undefined) bits = value ? bits | bit : bits & ~bit;
			add(name('Style'), bits);
		}
		characterExtraWrites(edit, name, add);
	}
	for (const index of paragraphs ? new Set(['0', ...paragraphs.keys()]) : []) {
		check();
		const name = (cell: string) => `Paragraph.${index}.${cell}`;
		if (edit.indentLeft !== undefined) add(name('IndLeft'), edit.indentLeft / 72, 'PT');
		if (edit.bullets !== undefined) {
			const bullet = scalar(name('Bullet'), 7, 'Paragraph bullet style');
			add(name('Bullet'), edit.bullets ? bullet || 1 : 0);
		}
		if (edit.horizontalAlign !== undefined)
			add(name('HorzAlign'), ['left', 'center', 'right', 'justify'].indexOf(edit.horizontalAlign));
		paragraphExtraWrites(edit, name, add);
	}
	if (edit.verticalAlign !== undefined)
		add('VerticalAlign', ['top', 'middle', 'bottom'].indexOf(edit.verticalAlign));
	textBlockWrites(shape, edit, add);
	return { writes, rows };
}
