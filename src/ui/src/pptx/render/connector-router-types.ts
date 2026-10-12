/**
 * Types of the orthogonal connector router, which lives in `ooxml-core/geometry`. `Point` and
 * `Rect` are the Angular binding's names for the same shapes.
 */
import type { RouterPoint, RouterRect } from 'ooxml-core/geometry';

export {
	PADDING_DEFAULT,
	ROUTING_PADDING_DEFAULT,
	CANVAS_SENTINEL,
	type RouterPoint,
	type RouterRect,
	type ConnectorRouterOptions,
	type OrthogonalRouterOptions,
} from 'ooxml-core/geometry';

/** Alias of {@link RouterPoint} (Angular naming). */
export type Point = RouterPoint;

/** Alias of {@link RouterRect} (Angular naming). */
export type Rect = RouterRect;
