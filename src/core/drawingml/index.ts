// Format-neutral DrawingML (ECMA-376 Part 1, 20.1): the colour, fill, line, text-body and geometry
// readers and writers over the shared `xml` DOM, the colour resolver, gradient helpers and the
// theme model. `diagram`, `chart`, `docx` and `xlsx` build on it; nothing here knows about slides,
// documents, sheets or diagrams.
export * from './types';
export {
	attributeReader,
	booleanAttribute,
	descendants,
	integerAttribute,
	stringAttribute,
} from './dom';
export * from './drawing-color';
export * from './drawing-color-css';
export * from './drawing-color-brightness';
export * from './ordered-color-transforms';
export * from './drawing-fill';
export * from './drawing-text';
export * from './drawing-geometry';
export * from './drawing-shadow';
export * from './write-color';
export * from './write-fill';
export * from './write-theme';
export * from './gradient-presets';
export * from './gradient-geometry';
export * from './rect-path-gradient';
export * from './theme-model';
export * from './theme';
export * from './theme-color';
