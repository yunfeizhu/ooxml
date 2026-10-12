// The root entry groups the shared building blocks by namespace. The document formats are
// symmetrical: `docx` and `pptx` are each imported through their own subpaths
// (`ooxml-core/docx`, `ooxml-core/pptx`), so importing the root never
// pulls in a format and its dependencies.
export * as color from './color/index';
export * as chart from './chart/index';
export * as text from './text/index';
export * as i18n from './i18n/index';
export * as ribbon from './ribbon/index';
export * as drawingml from './drawingml/index';
export * as diagram from './diagram/index';
export * as digest from './digest/index';
export * as geometry from './geometry/index';
export * as opc from './opc/index';
export * as units from './units/index';
export * as xml from './xml/index';
export * as math from './math/index';
