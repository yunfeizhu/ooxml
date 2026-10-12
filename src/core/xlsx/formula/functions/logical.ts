import { normalizeLocalName } from '../ast';
import { compareScalars, toBool } from '../coerce';
import type { CallContext, LazyArg } from '../context';
import { broadcastShape, pick } from '../operators';
import {
	ERR,
	ErrorSignal,
	fail,
	isError,
	LambdaValue,
	Matrix,
	RefValue,
	type Scalar,
	type Value,
} from '../values';
import { LAMBDA_HELPERS } from './lambda';
import type { FunctionSpec } from './types';

const C = 'Logical';

/** A single cell reference becomes its value, larger references a matrix. */
export function deref(ctx: CallContext, value: Value): Value {
	if (value instanceof RefValue) {
		if (value.isCell()) {
			const area = value.areas[0];
			return area ? ctx.readCell(area.sheet, area.range.start.row, area.range.start.col) : null;
		}
		return ctx.toMatrix(value);
	}
	return value;
}

const asMatrix = (v: Value): Matrix => (v instanceof Matrix ? v : new Matrix([[v as Scalar]]));

const toElement = (v: Value): Scalar => (v instanceof Matrix ? v.get(0, 0) : (v as Scalar));

function elementwise(cond: Matrix, branch: (truthy: boolean) => Value, ctx: CallContext): Matrix {
	let thenM: Matrix | undefined;
	let elseM: Matrix | undefined;
	const branchMatrix = (truthy: boolean): Matrix => {
		if (truthy) return (thenM ??= asMatrix(deref(ctx, branch(true))));
		return (elseM ??= asMatrix(deref(ctx, branch(false))));
	};
	// Both branches set the result's shape; a whole-column condition stays padded.
	return broadcastShape([cond, branchMatrix(true), branchMatrix(false)], (r, c) => {
		const v = pick(cond, r, c);
		if (isError(v)) return v;
		try {
			return pick(branchMatrix(toBool(v)), r, c);
		} catch (e) {
			if (e instanceof ErrorSignal) return e.value;
			throw e;
		}
	});
}

function ifFn(args: LazyArg[], ctx: CallContext): Value {
	const cond = deref(ctx, (args[0] as LazyArg).get());
	const branch = (truthy: boolean): Value => {
		const arg = args[truthy ? 1 : 2];
		if (arg) return arg.get();
		return truthy;
	};
	if (cond instanceof Matrix) return elementwise(cond, branch, ctx);
	if (isError(cond)) return cond;
	if (cond instanceof LambdaValue) return ERR.VALUE;
	return branch(toBool(ctx.toScalar(cond)));
}

function ifError(args: LazyArg[], ctx: CallContext, onlyNa: boolean): Value {
	const value = deref(ctx, (args[0] as LazyArg).get());
	const matches = (v: Value): boolean => isError(v) && (!onlyNa || v.error === '#N/A');
	const fallback = (): Value => {
		const v = deref(ctx, (args[1] as LazyArg).get());
		return v === null ? 0 : v;
	};
	if (value instanceof Matrix) {
		let alt: Value | undefined;
		return value.map((v) => (matches(v) ? toElement((alt ??= fallback())) : v));
	}
	return matches(value) ? fallback() : value;
}

function logicalValues(ctx: CallContext, args: LazyArg[]): boolean[] {
	const out: boolean[] = [];
	for (const arg of args) {
		ctx.forEach(arg.get(), (v, kind) => {
			if (isError(v)) throw new ErrorSignal(v);
			if (typeof v === 'boolean') out.push(v);
			else if (typeof v === 'number') out.push(v !== 0);
			else if (kind === 'direct' && typeof v === 'string') out.push(toBool(v));
			else if (kind === 'direct' && v === null) out.push(false);
		});
	}
	if (out.length === 0) fail(ERR.VALUE);
	return out;
}

const lazySpec = (
	name: string,
	syntax: string,
	description: string,
	minArgs: number,
	maxArgs: number,
	lazy: (args: LazyArg[], ctx: CallContext) => Value,
	category = C,
): FunctionSpec => ({ name, category, syntax, description, minArgs, maxArgs, lazy });

function localName(arg: LazyArg | undefined): string {
	const node = arg?.node;
	if (!node || node.type !== 'name' || node.prefix) fail(ERR.VALUE);
	return normalizeLocalName(node.name);
}

export const LOGICAL_FUNCTIONS: FunctionSpec[] = [
	...LAMBDA_HELPERS,
	lazySpec(
		'IF',
		'IF(logical_test, [value_if_true], [value_if_false])',
		'Returns one value if a condition is TRUE and another if FALSE.',
		1,
		3,
		ifFn,
	),
	lazySpec(
		'IFERROR',
		'IFERROR(value, value_if_error)',
		'A fallback value when an expression is an error.',
		2,
		2,
		(a, ctx) => ifError(a, ctx, false),
	),
	lazySpec(
		'IFNA',
		'IFNA(value, value_if_na)',
		'A fallback value when an expression is #N/A.',
		2,
		2,
		(a, ctx) => ifError(a, ctx, true),
	),
	lazySpec(
		'IFS',
		'IFS(logical_test1, value_if_true1, ...)',
		'The value for the first TRUE condition.',
		2,
		254,
		(args, ctx) => {
			if (args.length % 2 !== 0) fail(ERR.VALUE);
			for (let i = 0; i < args.length; i += 2) {
				const cond = ctx.toScalar(deref(ctx, (args[i] as LazyArg).get()));
				if (isError(cond)) return cond;
				if (toBool(cond)) return (args[i + 1] as LazyArg).get();
			}
			return ERR.NA;
		},
	),
	lazySpec(
		'SWITCH',
		'SWITCH(expression, value1, result1, ..., [default])',
		'The result for the first value matching an expression.',
		3,
		254,
		(args, ctx) => {
			const target = ctx.toScalar(deref(ctx, (args[0] as LazyArg).get()));
			if (isError(target)) return target;
			let i = 1;
			for (; i + 1 < args.length; i += 2) {
				const candidate = ctx.toScalar(deref(ctx, (args[i] as LazyArg).get()));
				if (isError(candidate)) return candidate;
				if (typeof candidate === typeof target && compareScalars(candidate, target) === 0) {
					return (args[i + 1] as LazyArg).get();
				}
			}
			return i < args.length ? (args[i] as LazyArg).get() : ERR.NA;
		},
	),
	lazySpec(
		'AND',
		'AND(logical1, [logical2], ...)',
		'TRUE when every argument is TRUE.',
		1,
		255,
		(args, ctx) => logicalValues(ctx, args).every(Boolean),
	),
	lazySpec(
		'OR',
		'OR(logical1, [logical2], ...)',
		'TRUE when any argument is TRUE.',
		1,
		255,
		(args, ctx) => logicalValues(ctx, args).some(Boolean),
	),
	lazySpec(
		'XOR',
		'XOR(logical1, [logical2], ...)',
		'TRUE when an odd number of arguments are TRUE.',
		1,
		255,
		(args, ctx) => logicalValues(ctx, args).filter(Boolean).length % 2 === 1,
	),
	{
		name: 'NOT',
		category: C,
		syntax: 'NOT(logical)',
		description: 'Reverses a logical value.',
		minArgs: 1,
		maxArgs: 1,
		fn: (args) => !toBool((args[0] ?? null) as Scalar),
	},
	{
		name: 'TRUE',
		category: C,
		syntax: 'TRUE()',
		description: 'The logical value TRUE.',
		minArgs: 0,
		maxArgs: 0,
		fn: () => true,
	},
	{
		name: 'FALSE',
		category: C,
		syntax: 'FALSE()',
		description: 'The logical value FALSE.',
		minArgs: 0,
		maxArgs: 0,
		fn: () => false,
	},
	lazySpec(
		'LET',
		'LET(name1, value1, [name2, value2, ...], calculation)',
		'Assigns names to values for use in a calculation.',
		3,
		253,
		(args, ctx) => {
			if (args.length % 2 === 0) fail(ERR.VALUE);
			let scope = new Map(ctx.frame.scope ?? []);
			for (let i = 0; i + 1 < args.length; i += 2) {
				const name = localName(args[i]);
				const value = ctx.evaluate((args[i + 1] as LazyArg).node, scope);
				scope = new Map(scope);
				scope.set(name, value);
			}
			return ctx.evaluate((args[args.length - 1] as LazyArg).node, scope);
		},
	),
	lazySpec(
		'LAMBDA',
		'LAMBDA([parameter1, ...], calculation)',
		'Creates a reusable function.',
		1,
		254,
		(args, ctx) => {
			const params = args.slice(0, -1).map((a) => localName(a));
			return new LambdaValue(params, (args[args.length - 1] as LazyArg).node, ctx.frame.scope);
		},
	),
];
