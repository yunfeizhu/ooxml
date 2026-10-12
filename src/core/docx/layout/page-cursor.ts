import type { LayoutColumns, LayoutPageGeometry } from './input';
import { expectDefined } from '../expect-defined';
import type { LayoutBlockBox, LayoutColumnBox, LayoutFootnoteBox, LayoutPageBox } from './result';

/** Space for the short rule above a page's footnotes. */
export const FOOTNOTE_SEPARATOR_PX = 12;

/**
 * Mutable fill-position bookkeeping for one section: which page/column is
 * currently being filled and how much vertical space remains in it. A new
 * `PageCursor` is created per section. Compatible continuous sections reuse
 * the last physical page, with their own column band and future page geometry.
 */
export class PageCursor {
	readonly pages: LayoutPageBox[];
	private readonly equalColumnWidthPx: number;
	private activeColumns: LayoutColumnBox[] = [];
	private columnTopPx = 0;
	private geometry: LayoutPageGeometry;
	private columns: LayoutColumns;
	private columnIndex = 0;
	private yPx = 0;
	private readonly sectionIndex: number;
	private pageInSection = 0;
	/** Height taken by footnotes (and their separator) at the bottom of the current page. */
	private reservedPx = 0;
	/** Footnotes of the paragraph about to be placed; they join the page its first box lands on. */
	private pending: { blockId: string; notes: LayoutFootnoteBox[]; heightPx: number } | undefined;

	constructor(
		pages: LayoutPageBox[],
		geometry: LayoutPageGeometry,
		columns: LayoutColumns,
		sectionIndex = 0,
		continueAt?: number,
		private balance?: { pageIndex: number; heightPx: number },
	) {
		this.sectionIndex = sectionIndex;
		this.pages = pages;
		this.geometry = geometry;
		this.columns = columns;
		const contentWidth = geometry.widthPx - geometry.marginLeftPx - geometry.marginRightPx;
		this.equalColumnWidthPx = Math.max(
			1,
			(contentWidth - columns.gapPx * (columns.count - 1)) / columns.count,
		);
		if (continueAt === undefined) this.pushPage();
		else {
			this.columnTopPx = continueAt;
			this.yPx = continueAt;
			this.activeColumns = this.columnBoxes(geometry.marginLeftPx - this.page.marginLeftPx);
			for (const column of this.activeColumns) {
				column.sectionIndex = sectionIndex;
				column.startYPx = continueAt;
				column.separator = columns.separator ?? false;
			}
			this.page.columns.push(...this.activeColumns);
		}
	}

	private columnBoxes(offsetPx = 0): LayoutColumnBox[] {
		const columnBoxes: LayoutColumnBox[] = [];
		let xPx = offsetPx;
		for (let i = 0; i < this.columns.count; i++) {
			const explicit = this.columns.widths?.[i];
			const widthPx = Math.max(1, explicit?.widthPx ?? this.equalColumnWidthPx);
			columnBoxes.push({
				xPx,
				widthPx,
				blocks: [],
			});
			xPx += widthPx + (explicit?.gapPx ?? this.columns.gapPx);
		}
		return columnBoxes;
	}

	private pushPage() {
		const columnBoxes = this.columnBoxes();
		this.activeColumns = columnBoxes;
		this.pages.push({
			index: this.pages.length,
			sectionIndex: this.sectionIndex,
			pageInSection: this.pageInSection++,
			widthPx: this.geometry.widthPx,
			heightPx: this.geometry.heightPx,
			marginTopPx: this.geometry.marginTopPx,
			marginRightPx: this.geometry.marginRightPx,
			marginBottomPx: this.geometry.marginBottomPx,
			marginLeftPx: this.geometry.marginLeftPx,
			columns: columnBoxes,
			...(this.columns.separator ? { columnSeparator: true } : {}),
		});
		this.columnIndex = 0;
		this.columnTopPx = 0;
		this.yPx = 0;
		this.reservedPx = 0;
	}

	get page(): LayoutPageBox {
		return this.pages.at(-1)!;
	}
	get column(): LayoutColumnBox {
		return expectDefined(this.activeColumns[this.columnIndex], 'current page column');
	}
	get columnWidthPx(): number {
		return this.column.widthPx;
	}
	/** Reject trials that overflow an earlier column, including a kept table row. */
	get columnContentFits(): boolean {
		return this.activeColumns.every((column) =>
			column.blocks.every(
				(block) => block.yPx + block.heightPx <= this.columnTopPx + this.columnHeightPx,
			),
		);
	}
	endBalance(): void {
		this.balance = undefined;
	}
	get y(): number {
		return this.yPx;
	}
	get usedColumnHeightPx(): number {
		return this.yPx - this.columnTopPx;
	}
	get atColumnTop(): boolean {
		return this.yPx === this.columnTopPx;
	}
	get hasPageContent(): boolean {
		return this.page.columns.some((column) => column.blocks.length > 0);
	}
	get columnHeightPx(): number {
		const height = this.physicalColumnHeightPx;
		return this.balance?.pageIndex === this.page.index
			? Math.min(height, this.balance.heightPx)
			: height;
	}
	get physicalColumnHeightPx(): number {
		return Math.max(
			1,
			this.page.heightPx - this.page.marginTopPx - this.geometry.marginBottomPx - this.columnTopPx,
		);
	}
	remainingHeightPx(): number {
		return (
			this.columnHeightPx - (this.yPx - this.columnTopPx) - this.reservedPx - this.pendingHeightPx()
		);
	}

	/** Close this section's column band before another section shares its page. */
	finishBand(): number {
		const bottom = Math.max(
			this.yPx,
			...this.activeColumns.flatMap((column) =>
				column.blocks.map((block) => block.yPx + block.heightPx),
			),
		);
		for (const column of this.activeColumns) {
			column.sectionIndex = this.sectionIndex;
			column.startYPx ??= this.columnTopPx;
			column.endYPx = bottom;
			column.separator = this.columns.separator ?? false;
		}
		return bottom;
	}

	private pendingHeightPx(): number {
		if (!this.pending) return 0;
		return this.pending.heightPx + (this.page.footnotes?.length ? 0 : FOOTNOTE_SEPARATOR_PX);
	}

	/**
	 * Reserves room for a paragraph's footnotes on whichever page its first box is placed, so the
	 * notes print on the same page as their reference, as Word does.
	 */
	holdFootnotes(blockId: string, notes: LayoutFootnoteBox[]): void {
		const heightPx = notes.reduce((sum, note) => sum + note.heightPx, 0);
		this.pending = notes.length ? { blockId, notes, heightPx } : undefined;
	}

	newPage(): void {
		this.pushPage();
	}
	/** Advances to the next column, or a new page when the section has no more columns. */
	newColumn(): void {
		if (this.columnIndex + 1 < this.columns.count) {
			this.columnIndex++;
			this.yPx = this.columnTopPx;
		} else {
			this.pushPage();
		}
	}

	/** Places a box at the current fill position (sets its `yPx`) and advances by `advancePx`. */
	place(box: LayoutBlockBox, advancePx: number): void {
		if (
			this.page.sectionIndex !== this.sectionIndex &&
			!this.page.sectionIndices?.includes(this.sectionIndex)
		) {
			(this.page.sectionIndices ??= [this.page.sectionIndex]).push(this.sectionIndex);
			this.pageInSection = 1;
		}
		box.yPx = this.yPx;
		this.column.blocks.push(box);
		this.yPx += advancePx;
		if (this.pending && this.pending.blockId === box.blockId) {
			this.reservedPx += this.pendingHeightPx();
			const page = this.page;
			let top = page.footnotes?.reduce((sum, note) => sum + note.heightPx, 0) ?? 0;
			for (const note of this.pending.notes) {
				(page.footnotes ??= []).push({ ...note, yPx: top });
				top += note.heightPx;
			}
			this.pending = undefined;
		}
	}
}
