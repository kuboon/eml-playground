// Pure AST types for the eml playground.
// This module must not import anything DOM-related.

export type Expr =
  | { readonly type: 'one' }
  | { readonly type: 'var'; readonly name: 'x' }
  | { readonly type: 'f'; readonly left: Expr; readonly right: Expr };

export const one: Expr = { type: 'one' };
export const varX: Expr = { type: 'var', name: 'x' };

export function f(left: Expr, right: Expr): Expr {
  return { type: 'f', left, right };
}

/** Returns true if the expression contains the variable `x`. */
export function containsVar(expr: Expr): boolean {
  switch (expr.type) {
    case 'one':
      return false;
    case 'var':
      return true;
    case 'f':
      return containsVar(expr.left) || containsVar(expr.right);
  }
}

/** Number of nodes in the tree (K-complexity from the paper). */
export function nodeCount(expr: Expr): number {
  switch (expr.type) {
    case 'one':
    case 'var':
      return 1;
    case 'f':
      return 1 + nodeCount(expr.left) + nodeCount(expr.right);
  }
}
