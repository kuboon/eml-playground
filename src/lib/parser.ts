// Lisp-style S-expression parser for the eml playground.
// Grammar:
//   expr := '1' | 'x' | '(' 'f' expr expr ')'
// Pure module: no DOM imports.

import type { Expr } from './ast.ts';
import { f, one, varX } from './ast.ts';

export type ParseOk = { readonly ok: true; readonly expr: Expr };
export type ParseErr = {
  readonly ok: false;
  readonly message: string;
  readonly position: number;
};
export type ParseResult = ParseOk | ParseErr;

class Cursor {
  constructor(
    public readonly src: string,
    public pos: number = 0,
  ) {}

  skipWs(): void {
    while (this.pos < this.src.length) {
      const c = this.src.charCodeAt(this.pos);
      // space, tab, newline, carriage return
      if (c === 32 || c === 9 || c === 10 || c === 13) {
        this.pos++;
      } else {
        break;
      }
    }
  }

  peek(): string {
    return this.src.charAt(this.pos);
  }

  eof(): boolean {
    return this.pos >= this.src.length;
  }
}

class ParseError extends Error {
  constructor(
    message: string,
    public readonly position: number,
  ) {
    super(message);
  }
}

function parseExpr(c: Cursor): Expr {
  c.skipWs();
  if (c.eof()) {
    throw new ParseError('式が空です', c.pos);
  }

  const ch = c.peek();

  if (ch === '1') {
    c.pos++;
    return one;
  }

  if (ch === 'x' || ch === 'X') {
    c.pos++;
    return varX;
  }

  if (ch === '(') {
    const openAt = c.pos;
    c.pos++;
    c.skipWs();

    // Must be 'f' next.
    if (c.eof() || c.peek() !== 'f') {
      throw new ParseError("'(' の直後は 'f' が必要です", c.pos);
    }
    c.pos++;

    // Require whitespace after 'f' for readability.
    const afterF = c.pos;
    c.skipWs();
    if (c.pos === afterF && !(c.peek() === '(' || c.peek() === ')')) {
      throw new ParseError("'f' の後に空白が必要です", c.pos);
    }

    const left = parseExpr(c);
    c.skipWs();
    const right = parseExpr(c);
    c.skipWs();

    if (c.eof() || c.peek() !== ')') {
      throw new ParseError("')' が不足しています (対応する '(' は位置 " + openAt + ')', c.pos);
    }
    c.pos++;
    return f(left, right);
  }

  if (ch === ')') {
    throw new ParseError("対応する '(' のない ')' です", c.pos);
  }

  throw new ParseError("予期しない文字 '" + ch + "'", c.pos);
}

export function parse(source: string): ParseResult {
  const cursor = new Cursor(source);
  try {
    const expr = parseExpr(cursor);
    cursor.skipWs();
    if (!cursor.eof()) {
      return {
        ok: false,
        message: '式の末尾に余分な文字があります',
        position: cursor.pos,
      };
    }
    return { ok: true, expr };
  } catch (err) {
    if (err instanceof ParseError) {
      return { ok: false, message: err.message, position: err.position };
    }
    throw err;
  }
}
