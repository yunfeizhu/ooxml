import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { VisioText } from './model';
import { visioTextExtents } from './text-extent';

/**
 * Optional: point VISIO_NATIVE_TEXT_EXTENT at the directory written by
 * `scripts/record-visio-text-extent.ps1` to compare every recorded TEXTWIDTH and TEXTHEIGHT
 * with this layout. The recording stays out of git.
 */
const directory = process.env.VISIO_NATIVE_TEXT_EXTENT;
const file = directory ? join(directory, 'text-extent.json') : undefined;

interface Row {
	text: string;
	font: string;
	size: number;
	bold: number;
	margin: number;
	width: number;
	heights: Record<string, number>;
}

function model(row: Row): VisioText {
	const margin = row.margin / 72;
	const run = {
		text: row.text,
		fontFamily: row.font,
		fontSize: row.size / 72,
		color: '#000000',
		bold: !!row.bold,
		italic: false,
		underline: false,
	};
	return {
		plainText: row.text,
		runs: [run],
		fontFamily: row.font,
		fontSize: row.size / 72,
		bold: !!row.bold,
		color: '#000000',
		horizontalAlign: 'center',
		verticalAlign: 'middle',
		transform: [1, 0, 0, 1, 0, 0],
		width: 2,
		height: 1,
		margins: { left: margin, right: margin, top: margin, bottom: margin },
	};
}

describe.skipIf(!file || !existsSync(file))('TEXTWIDTH and TEXTHEIGHT against Visio', () => {
	it('agrees with every recorded value it decides', () => {
		const rows = JSON.parse(readFileSync(file!, 'utf8').replace(/^﻿/, '')) as Row[];
		let heights = 0,
			undecided = 0,
			worstWidth = 0;
		const wrong: string[] = [];
		for (const row of rows) {
			const extents = visioTextExtents(model(row));
			const width = extents.width();
			expect(width).toBeDefined();
			worstWidth = Math.max(worstWidth, Math.abs(width! - row.width) * 72);
			for (const [wrap, expected] of Object.entries(row.heights)) {
				const height = extents.height(Number(wrap));
				++heights;
				if (height === undefined) ++undecided;
				else if (Math.abs(height - expected) * 72 > 0.05)
					wrong.push(
						`${row.font} ${row.size}pt${row.bold ? ' bold' : ''} margin ${row.margin} at ${wrap}in ` +
							`"${row.text}": ${(height * 72).toFixed(2)} pt, Visio ${(expected * 72).toFixed(2)} pt`,
					);
			}
		}
		console.info(
			`${rows.length} widths, worst error ${worstWidth.toFixed(4)} pt; ${heights} heights, ` +
				`${undecided} undecided, ${wrong.length} different`,
		);
		expect(worstWidth).toBeLessThan(0.02);
		expect(wrong).toEqual([]);
	});
});
