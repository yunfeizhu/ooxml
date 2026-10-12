/**
 * ribbon-add-ins.service.ts: the host's ribbon tabs (the `ribbonAddIns` input), shared with the
 * ribbon through DI so the input is not threaded through every chrome component.
 *
 * `PowerPointViewerComponent` binds its input signal once; the ribbon reads `visible` and keeps
 * which host tab is showing here too. Showing one is ribbon state, like a contextual tab: any
 * other tab clears it. `active` is derived, so a tab the host removes simply stops being
 * active and the ribbon shows its fixed tab again (the ribbon moves that to Home when a host
 * tab is chosen, so this is the same fallback the other bindings make). No effect is involved.
 *
 * Provided per viewer (see `POWER_POINT_VIEWER_PROVIDERS`).
 */
import { computed, Injectable, signal } from '@angular/core';
import type { Signal } from '@angular/core';
import { visibleRibbonAddIns } from 'ooxml-ui/pptx';
import type { RibbonAddInTab } from 'ooxml-ui/pptx';

@Injectable()
export class RibbonAddInsService {
	private readonly source = signal<Signal<readonly RibbonAddInTab[] | undefined> | null>(null);
	private readonly chosen = signal<string | null>(null);

	/** The host tabs the ribbon shows, in order (never one that takes a built-in tab id). */
	readonly visible = computed(() => visibleRibbonAddIns(this.source()?.()));
	/** The host tab being shown, or null when a fixed or contextual tab is. */
	readonly active = computed<RibbonAddInTab | null>(() => {
		const id = this.chosen();
		return (id !== null && this.visible().find((tab) => tab.id === id)) || null;
	});

	/** Follow the viewer's `ribbonAddIns` input. Returns the service, for a field initialiser. */
	bind(tabs: Signal<readonly RibbonAddInTab[] | undefined>): this {
		this.source.set(tabs);
		return this;
	}

	select(id: string | null): void {
		this.chosen.set(id);
	}
}
