import { themeBridge } from '../../theme-bridge';

/**
 * The viewer's colours follow the shared `--office-*` theme (light/dark, the launcher's choice).
 * The `--vv-*` custom properties stay as optional host overrides and appear only in this block.
 * `inch` is not a colour: it is the canvas scale set by `viewer-canvas.ts`.
 */
export const visioThemeAliases = `:host {
  --_vv-bg:var(--vv-background,var(--office-surface,#eceae8));
  --_vv-surface:var(--vv-surface,var(--office-background,#fff));
  --_vv-secondary:var(--vv-secondary,var(--office-surface,#f3f2f1));
  --_vv-ink:var(--vv-ink,var(--office-foreground,#1f1f1f));
  --_vv-muted:var(--vv-muted,var(--office-muted-foreground,#605e5c));
  --_vv-border:var(--vv-border,var(--office-border,#e1dfdd));
  --_vv-accent:var(--vv-accent,var(--office-accent,#3955a3));
  --_vv-accent-soft:var(--vv-accent-soft,color-mix(in srgb,var(--_vv-accent) 10%,transparent));
  --_vv-accent-ink:var(--vv-accent-ink,var(--office-accent-foreground,#fff));
  --_vv-focus:var(--vv-focus,var(--office-ring,var(--_vv-accent)));
  --_vv-danger:var(--vv-danger,var(--office-danger,#b42318));
  --_vv-shadow:var(--vv-shadow,var(--office-shadow,0 2px 8px rgb(0 0 0 / 14%)));
  --_vv-status-bg:var(--vv-status-background,var(--_vv-surface));
  --_vv-status-ink:var(--vv-status-ink,var(--_vv-ink));
}
:host([status-bar='colorful']) {
  --_vv-status-bg:var(--vv-status-background,var(--_vv-accent));
  --_vv-status-ink:var(--vv-status-ink,var(--_vv-accent-ink));
}
`;

/**
 * Feeds the shared controls (ribbon, dialogs) from the aliases above. It sits on the shadow
 * root's children, not on `:host`, because a custom property cannot read the value it replaces.
 */
export const visioThemeBridge = themeBridge(':host > *', {
	'--office-foreground': 'var(--_vv-ink)',
	'--office-muted-foreground': 'var(--_vv-muted)',
	'--office-background': 'var(--_vv-surface)',
	'--office-surface': 'var(--_vv-accent-soft)',
	'--office-border': 'var(--_vv-border)',
	'--office-accent': 'var(--_vv-accent)',
	'--office-accent-foreground': 'var(--_vv-accent-ink)',
	'--office-ring': 'var(--_vv-focus)',
	'--office-font': "'Segoe UI', Arial, sans-serif",
});
