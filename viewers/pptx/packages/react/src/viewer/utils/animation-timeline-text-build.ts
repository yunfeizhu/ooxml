/**
 * Thin re-export shim: text-build expansion now lives in `pptx-viewer-shared`
 * (`render/animation-timeline-text-build`).
 */
export type { TextBuildSegmentCounts } from 'ooxml-ui/pptx';
export { countTextSegments, TEXT_BUILD_ID_SEP, expandTextBuildAnimations } from 'ooxml-ui/pptx';
