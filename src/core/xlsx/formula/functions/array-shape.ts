import type { CallContext } from '../context';
import { ERR, fail, isError, Matrix, MAX_ARRAY_SIDE, type Scalar, type Value } from '../values';
import { num, spec } from './helpers';
import type { FunctionSpec } from './types';

const C = 'Lookup & Reference';

const intAt = (ctx: CallContext, args: Value[], i: number): number | undefined =>
	i < args.length && args[i] !== null ? Math.trunc(num(ctx.toScalar(args[i] ?? null))) : undefined;

function take(m: Matrix, rows: number | undefined, cols: number | undefined, drop: boolean): Value {
	const slice = (length: number, n: number | undefined): [number, number] => {
		if (n === undefined) return [0, length];
		if (drop) return n >= 0 ? [Math.min(n, length), length] : [0, Math.max(0, length + n)];
		return n >= 0 ? [0, Math.min(n, length)] : [Math.max(0, length + n), length];
	};
	if (!drop && (rows === 0 || cols === 0)) return ERR.CALC;
	const [r1, r2] = slice(m.rows, rows);
	const [c1, c2] = slice(m.cols, cols);
	if (r2 <= r1 || c2 <= c1) return ERR.CALC;
	return new Matrix(m.data.slice(r1, r2).map((row) => row.slice(c1, c2)));
}

function choose(indexes: number[], length: number): number[] {
	return indexes.map((i) => {
		const at = i < 0 ? length + i : i - 1;
		if (i === 0 || at < 0 || at >= length) fail(ERR.VALUE);
		return at;
	});
}

function indexList(ctx: CallContext, args: Value[]): number[] {
	return args.slice(1).flatMap((a) =>
		ctx
			.toMatrix(a)
			.flat()
			.map((v) => Math.trunc(num(v))),
	);
}

function stack(ctx: CallContext, args: Value[], vertical: boolean): Matrix {
	const parts = args.map((a) => ctx.toMatrix(a));
	if (vertical) {
		const width = parts.reduce((w, p) => Math.max(w, p.cols), 0);
		return new Matrix(
			parts.flatMap((p) =>
				p.data.map((row) =>
					Array.from({ length: width }, (_, c) => (c < row.length ? (row[c] ?? null) : ERR.NA)),
				),
			),
		);
	}
	const height = parts.reduce((h, p) => Math.max(h, p.rows), 0);
	return Matrix.build(
		height,
		parts.reduce((a, p) => a + p.cols, 0),
		(r, c) => {
			let col = c;
			for (const p of parts) {
				if (col < p.cols) return r < p.rows ? p.get(r, col) : ERR.NA;
				col -= p.cols;
			}
			return ERR.NA;
		},
	);
}

function flatten(ctx: CallContext, args: Value[]): Scalar[] {
	const m = ctx.toMatrix(args[0] ?? null);
	const ignore = intAt(ctx, args, 1) ?? 0;
	const byCol = Boolean(intAt(ctx, args, 2));
	const values: Scalar[] = [];
	const rows = byCol ? m.cols : m.rows;
	const cols = byCol ? m.rows : m.cols;
	for (let a = 0; a < rows; a++) {
		for (let b = 0; b < cols; b++) {
			const v = byCol ? m.get(b, a) : m.get(a, b);
			if ((ignore === 1 || ignore === 3) && v === null) continue;
			if ((ignore === 2 || ignore === 3) && isError(v)) continue;
			values.push(v);
		}
	}
	return values;
}

function wrap(ctx: CallContext, args: Value[], byRows: boolean): Value {
	const values = ctx.toMatrix(args[0] ?? null);
	if (values.rows !== 1 && values.cols !== 1) return ERR.VALUE;
	const flat = values.flat();
	const count = intAt(ctx, args, 1) ?? 0;
	if (count < 1) return ERR.NUM;
	const pad: Scalar = args.length > 2 ? ctx.toScalar(args[2] ?? null) : ERR.NA;
	const other = Math.ceil(flat.length / count);
	return byRows
		? Matrix.build(other, count, (r, c) => flat[r * count + c] ?? pad)
		: Matrix.build(count, other, (r, c) => flat[c * count + r] ?? pad);
}

export const ARRAY_SHAPE_FUNCTIONS: FunctionSpec[] = [
	spec(
		'TAKE',
		C,
		'TAKE(array, rows, [columns])',
		'Rows or columns from the start or end of an array.',
		2,
		3,
		(args, ctx) =>
			take(ctx.toMatrix(args[0] ?? null), intAt(ctx, args, 1), intAt(ctx, args, 2), false),
		['any'],
	),
	spec(
		'DROP',
		C,
		'DROP(array, rows, [columns])',
		'An array without rows or columns at the start or end.',
		2,
		3,
		(args, ctx) =>
			take(ctx.toMatrix(args[0] ?? null), intAt(ctx, args, 1), intAt(ctx, args, 2), true),
		['any'],
	),
	spec(
		'CHOOSEROWS',
		C,
		'CHOOSEROWS(array, row_num1, ...)',
		'The given rows of an array.',
		2,
		255,
		(args, ctx) => {
			const m = ctx.toMatrix(args[0] ?? null);
			return new Matrix(choose(indexList(ctx, args), m.rows).map((r) => m.data[r] ?? []));
		},
		['any'],
	),
	spec(
		'CHOOSECOLS',
		C,
		'CHOOSECOLS(array, col_num1, ...)',
		'The given columns of an array.',
		2,
		255,
		(args, ctx) => {
			const m = ctx.toMatrix(args[0] ?? null);
			const cols = choose(indexList(ctx, args), m.cols);
			return new Matrix(m.data.map((row) => cols.map((c) => row[c] ?? null)));
		},
		['any'],
	),
	spec(
		'VSTACK',
		C,
		'VSTACK(array1, [array2], ...)',
		'Stacks arrays vertically.',
		1,
		254,
		(args, ctx) => stack(ctx, args, true),
		['any'],
	),
	spec(
		'HSTACK',
		C,
		'HSTACK(array1, [array2], ...)',
		'Stacks arrays horizontally.',
		1,
		254,
		(args, ctx) => stack(ctx, args, false),
		['any'],
	),
	spec(
		'TOCOL',
		C,
		'TOCOL(array, [ignore], [scan_by_column])',
		'An array as one column.',
		1,
		3,
		(args, ctx) => {
			const values = flatten(ctx, args);
			return values.length ? new Matrix(values.map((v) => [v])) : ERR.CALC;
		},
		['any'],
	),
	spec(
		'TOROW',
		C,
		'TOROW(array, [ignore], [scan_by_column])',
		'An array as one row.',
		1,
		3,
		(args, ctx) => {
			const values = flatten(ctx, args);
			return values.length ? new Matrix([values]) : ERR.CALC;
		},
		['any'],
	),
	spec(
		'WRAPROWS',
		C,
		'WRAPROWS(vector, wrap_count, [pad_with])',
		'Wraps a vector into rows.',
		2,
		3,
		(args, ctx) => wrap(ctx, args, true),
		['any'],
	),
	spec(
		'WRAPCOLS',
		C,
		'WRAPCOLS(vector, wrap_count, [pad_with])',
		'Wraps a vector into columns.',
		2,
		3,
		(args, ctx) => wrap(ctx, args, false),
		['any'],
	),
	spec(
		'EXPAND',
		C,
		'EXPAND(array, rows, [columns], [pad_with])',
		'Expands an array to given dimensions.',
		2,
		4,
		(args, ctx) => {
			const m = ctx.toMatrix(args[0] ?? null);
			const rows = intAt(ctx, args, 1) ?? m.rows;
			const cols = intAt(ctx, args, 2) ?? m.cols;
			if (rows < m.rows || cols < m.cols) return ERR.VALUE;
			if (rows > MAX_ARRAY_SIDE || cols > MAX_ARRAY_SIDE) return ERR.NUM;
			const pad: Scalar = args.length > 3 ? ctx.toScalar(args[3] ?? null) : ERR.NA;
			return Matrix.build(rows, cols, (r, c) => (r < m.rows && c < m.cols ? m.get(r, c) : pad));
		},
		['any'],
	),
];
