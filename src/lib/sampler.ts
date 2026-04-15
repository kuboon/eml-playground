// Sampling helpers for plotting. Pure module.

import type { Expr } from './ast.ts';
import { evaluate } from './evaluator.ts';

export type Sample = { readonly x: number; readonly y: number };

/**
 * Sample an expression over `[lo, hi]` with `steps` equally spaced points.
 * NaN / ±Infinity samples are still included so the caller can decide how
 * to break the polyline.
 */
export function sample(expr: Expr, lo: number, hi: number, steps: number): Sample[] {
  if (steps < 2) {
    throw new Error('steps は 2 以上である必要があります');
  }
  const out: Sample[] = new Array(steps);
  const dx = (hi - lo) / (steps - 1);
  for (let i = 0; i < steps; i++) {
    const x = lo + dx * i;
    let y: number;
    try {
      y = evaluate(expr, x);
    } catch {
      y = NaN;
    }
    out[i] = { x, y };
  }
  return out;
}

/** Sample a plain JS function over the same range for comparison overlays. */
export function sampleFn(
  fn: (x: number) => number,
  lo: number,
  hi: number,
  steps: number,
): Sample[] {
  if (steps < 2) {
    throw new Error('steps は 2 以上である必要があります');
  }
  const out: Sample[] = new Array(steps);
  const dx = (hi - lo) / (steps - 1);
  for (let i = 0; i < steps; i++) {
    const x = lo + dx * i;
    out[i] = { x, y: fn(x) };
  }
  return out;
}
