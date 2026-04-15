// Pretty-printers for Expr. Pure module.

import type { Expr } from './ast.ts';

/** Normalized S-expression source with single-space separators. */
export function toSource(expr: Expr): string {
  switch (expr.type) {
    case 'one':
      return '1';
    case 'var':
      return 'x';
    case 'f':
      return '(f ' + toSource(expr.left) + ' ' + toSource(expr.right) + ')';
  }
}

/** Reverse Polish Notation: operands before the `f` operator. */
export function toRpn(expr: Expr): string {
  switch (expr.type) {
    case 'one':
      return '1';
    case 'var':
      return 'x';
    case 'f':
      return toRpn(expr.left) + ' ' + toRpn(expr.right) + ' f';
  }
}

/** Multi-line indented form, handy for debugging/tree view. */
export function toIndented(expr: Expr, indent = 0): string {
  const pad = '  '.repeat(indent);
  switch (expr.type) {
    case 'one':
      return pad + '1';
    case 'var':
      return pad + 'x';
    case 'f':
      return (
        pad +
        '(f\n' +
        toIndented(expr.left, indent + 1) +
        '\n' +
        toIndented(expr.right, indent + 1) +
        ')'
      );
  }
}

/**
 * LaTeX-like rendering. Uses the paper's shorthand
 * `f(x, y) = e^x - \ln y` and pretty-prints accordingly.
 */
export function toLatex(expr: Expr): string {
  switch (expr.type) {
    case 'one':
      return '1';
    case 'var':
      return 'x';
    case 'f':
      return (
        'f\\!\\left(' + toLatex(expr.left) + ',\\,' + toLatex(expr.right) + '\\right)'
      );
  }
}
