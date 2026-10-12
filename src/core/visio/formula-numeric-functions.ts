import { formulaFailure } from './formula';
import type { VisioFormulaValue } from './formula';
import { compatibleFormulaUnits, finiteFormulaValue } from './formula-arithmetic';

export const numericFormulaFunctions = new Set([
	'AND',
	'OR',
	'NOT',
	'BITAND',
	'BITOR',
	'BITXOR',
	'MODULUS',
	'CEILING',
	'FLOOR',
]);
/** Numeric-only subset of Microsoft ShapeSheet AND/OR/NOT, BITAND/BITOR/BITXOR and MODULUS.
 * https://learn.microsoft.com/en-us/office/client-developer/visio/modulus-function
 * https://learn.microsoft.com/en-us/office/client-developer/visio/bitxor-function
 */
export function evaluateNumericFormulaFunction(
	name: string,
	args: readonly VisioFormulaValue[],
): VisioFormulaValue {
	const arity = (min: number, max = min) => {
		if (args.length < min || args.length > max)
			return formulaFailure('arity', `Invalid ${name} argument count`);
	};
	const scalar = (value: number): VisioFormulaValue => ({ value, unit: 'scalar' });
	if (name === 'CEILING' || name === 'FLOOR') {
		// CEILING rounds away from zero and FLOOR towards it, to a multiple (1 when omitted).
		// https://learn.microsoft.com/en-us/office/client-developer/visio/ceiling-function
		arity(1, 2);
		const value = finiteFormulaValue(args[0]!);
		const step = args[1] ? finiteFormulaValue(args[1]) : { value: 1, unit: 'scalar' as const };
		if (step.unit !== 'scalar' && step.unit !== value.unit && value.unit !== 'scalar')
			return formulaFailure('unit', `Invalid ${name} multiple`);
		if (value.value === 0) return value;
		if (step.value === 0 || Math.sign(step.value) !== Math.sign(value.value))
			return formulaFailure('value', `Invalid ${name} multiple`);
		// A quotient a rounding error away from a whole number is that whole number.
		const quotient = value.value / step.value;
		const whole = Math.round(quotient);
		const count =
			Math.abs(quotient - whole) < 1e-9
				? whole
				: name === 'CEILING'
					? Math.ceil(quotient)
					: Math.floor(quotient);
		return finiteFormulaValue({
			value: count * step.value,
			unit: value.unit === 'scalar' ? step.unit : value.unit,
		});
	}
	if (name === 'AND' || name === 'OR' || name === 'NOT') {
		arity(1, name === 'NOT' ? 1 : 1024);
		// Microsoft defines any nonzero numeric expression as true, irrespective of its dimension.
		const values = args.map((arg) => finiteFormulaValue(arg).value !== 0);
		return scalar(
			Number(
				name === 'AND' ? values.every(Boolean) : name === 'OR' ? values.some(Boolean) : !values[0],
			),
		);
	}
	if (['BITAND', 'BITOR', 'BITXOR'].includes(name)) {
		arity(2);
		const values = args.map((arg) => {
			if (arg.unit !== 'scalar') return formulaFailure('unit', `${name} requires scalar bitmasks`);
			// Docs specify 16 bits but no fractional truncation or negative coercion semantics.
			// Admit only the unambiguous nonnegative integral subset.
			if (!Number.isInteger(arg.value) || arg.value < 0 || arg.value > 65535)
				return formulaFailure('value', `${name} requires an integer from 0 to 65535`);
			return arg.value;
		});
		return scalar(
			name === 'BITAND'
				? values[0]! & values[1]!
				: name === 'BITOR'
					? values[0]! | values[1]!
					: values[0]! ^ values[1]!,
		);
	}
	if (name === 'MODULUS') {
		arity(2);
		const dividend = finiteFormulaValue(args[0]!),
			divisor = finiteFormulaValue(args[1]!);
		const unit = compatibleFormulaUnits(dividend, divisor);
		if (divisor.value === 0) return formulaFailure('value', 'MODULUS division by zero');
		const remainder = dividend.value - Math.floor(dividend.value / divisor.value) * divisor.value;
		return finiteFormulaValue({ value: remainder === 0 ? 0 : remainder, unit });
	}
	return formulaFailure('unsupported', `Unsupported numeric function ${name}`);
}
