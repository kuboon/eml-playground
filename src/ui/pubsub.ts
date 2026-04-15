// Tiny pub/sub bus shared by the UI panels.

import type { Expr } from '../lib/ast.ts';

type Listener = (expr: Expr) => void;

export class ExpressionBus {
  private listeners: Listener[] = [];
  private current: Expr | null = null;

  get value(): Expr | null {
    return this.current;
  }

  publish(expr: Expr): void {
    this.current = expr;
    for (const listener of this.listeners) {
      listener(expr);
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    if (this.current !== null) {
      listener(this.current);
    }
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
}
