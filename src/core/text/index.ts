/** Browser-neutral text primitives shared by Office consumers. */
export {
	detectFontScript,
	segmentByScript,
	resolveFontForScript,
	hasDistinctScriptFonts,
	type FontScriptCategory,
	type ScriptRun,
} from './unicode-script-detection';
export * from './tab-leader';
export * from './decimal-tab';
export * from './wrap-styled-runs';
export * from './change-case';
export * from './font-metrics/advance-width';
