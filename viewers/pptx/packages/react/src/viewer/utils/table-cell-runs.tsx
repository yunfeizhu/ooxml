import type { CellTextRun } from 'ooxml-ui/pptx';
import { cellParagraphBlocks, cellRunStyle } from 'ooxml-ui/pptx';
import type { PptxTableCell } from 'pptx-viewer-core';
import React from 'react';

/**
 * Rich per-run table-cell content.
 *
 * A cell's `text` is a flat `\n`-joined string, so a cell mixing bold, colour,
 * size or typeface across runs rendered entirely in the first run's style.
 * `PptxTableCell.textRuns` (parsed by core) carries the real sequence; the
 * other four bindings already had this branch and nothing populated it.
 *
 * Paragraph boundaries become zero-height block `<div>`s (so the following
 * runs start on a new line without adding vertical space of their own) and
 * `a:br` soft breaks become `<br>`, matching the vanilla / svelte renderers.
 * A cell whose paragraphs set their own layout gets one block per paragraph.
 *
 * @param cell - The cell, or `undefined` for the raw-XML path when no parsed
 *   cell is available at this position.
 * @param fallbackText - Plain text rendered when the cell has no runs.
 */
export function renderTableCellContent(
	cell: PptxTableCell | undefined,
	fallbackText: string,
): React.ReactNode {
	const blocks = cell ? cellParagraphBlocks(cell) : undefined;
	if (blocks) {
		return blocks.map((block, index) => (
			<div key={`p-${index}`} style={{ display: 'block', ...(block.css as React.CSSProperties) }}>
				{block.runs.map(renderRun)}
			</div>
		));
	}
	const runs = cell?.textRuns;
	if (!runs || runs.length === 0) {
		return fallbackText || ' ';
	}
	return runs.map((run, index) =>
		run.isParagraphBreak ? (
			<div key={`p-${index}`} style={{ display: 'block', height: 0 }} />
		) : (
			renderRun(run, index)
		),
	);
}

/** A run as a styled `<span>`, or a soft break as `<br>`. */
function renderRun(run: CellTextRun, index: number): React.ReactNode {
	if (run.isLineBreak) {
		return <br key={`br-${index}`} />;
	}
	return (
		<span
			key={`r-${index}`}
			style={{ position: 'relative', ...(cellRunStyle(run) as React.CSSProperties) }}
		>
			{run.text}
		</span>
	);
}
