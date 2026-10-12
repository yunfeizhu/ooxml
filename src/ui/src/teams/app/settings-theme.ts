import { html } from 'lit';
import type { TeamsTheme } from './teams-settings';

/** Decorative workspace previews accompany the existing theme buttons. */
export function themeChoices(current: TeamsTheme, change: (theme: TeamsTheme) => void) {
	return html`<div class="theme-options" role="group" aria-label="Theme">
		${(['system', 'light', 'dark'] as const).map(
			(theme) =>
				html`<button
					type="button"
					aria-pressed=${String(current === theme)}
					@click=${() => change(theme)}
				>
					<span class="theme-swatch" data-theme=${theme} aria-hidden="true">
						<span class="preview-toolbar"></span>
						<span class="preview-rail"></span>
						<span class="preview-sidebar"><i></i><i></i><i></i></span>
						<span class="preview-conversation"><i></i><i></i><i></i></span>
					</span>
					<span
						>${theme === 'system' ? 'Follow system' : theme === 'light' ? 'Light' : 'Dark'}</span
					>
				</button>`,
		)}
	</div>`;
}
