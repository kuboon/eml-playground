// Numerical evaluator for Expr. Pure module.

import type { Expr } from './ast.ts';

/**
 * Evaluate an expression under an environment where `x` is optionally bound.
 * May return `NaN`, `Infinity`, or `-Infinity` when the arithmetic is out of
 * domain (e.g. `ln y` for `y <= 0`). Throws only when `x` is referenced but
 * no value is provided.
 */
export function evaluate(expr: Expr, x?: number): number {
  switch (expr.type) {
    case 'one':
      return 1;
    case 'var':
      if (x === undefined) {
        throw new Error('変数 x の値が与えられていません');
      }
      return x;
    case 'f': {
      const a = evaluate(expr.left, x);
      const b = evaluate(expr.right, x);
      return Math.exp(a) - Math.log(b);
    }
  }
}

/**
 * Try to evaluate, returning `undefined` on runtime errors (e.g. unbound x).
 * Out-of-domain results are returned as NaN/Infinity, not wrapped as errors.
 */
export function tryEvaluate(expr: Expr, x?: number): number | undefined {
  try {
    return evaluate(expr, x);
  } catch {
    return undefined;
  }
}
