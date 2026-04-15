// Lisp-style S-expression parser for the eml playground.
// Grammar:
//   expr := '1' | 'x' | 'e' | '(' 'f' expr expr ')'
//         | '(' 'exp' expr ')' | '(' 'ln' expr ')' | '(' 'id' expr ')'
// The `e`, `exp`, `ln`, `id` forms are parse-time macros that expand into
// the canonical `f`-only AST:
//   e         → (f 1 1)
//   (exp E)   → (f E 1)
//   (ln E)    → (f 1 (f (f 1 E) 1))
//   (id E)    → (f 1 (f (f 1 (f E 1)) 1))
// Pure module: no DOM imports.

import type { Expr } from './ast.ts';
import { f, one, substituteVar, varX } from './ast.ts';
import { getUserMacro } from './macros.ts';

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

function isAlpha(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
}

function readWord(c: Cursor): string {
  let s = '';
  while (c.pos < c.src.length && isAlpha(c.src.charAt(c.pos))) {
    s += c.src.charAt(c.pos);
    c.pos++;
  }
  return s;
}

// Macro expansions for shortcut keywords.
function expE(): Expr {
  return f(one, one);
}
function expExp(arg: Expr): Expr {
  return f(arg, one);
}
function expLn(arg: Expr): Expr {
  return f(one, f(f(one, arg), one));
}
function expId(arg: Expr): Expr {
  return f(one, f(f(one, f(arg, one)), one));
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

  if (isAlpha(ch)) {
    const start = c.pos;
    const word = readWord(c);
    if (word === 'x' || word === 'X') return varX;
    if (word === 'e') return expE();
    const userMacro = getUserMacro(word);
    if (userMacro && userMacro.arity === 0) {
      return userMacro.body;
    }
    if (userMacro && userMacro.arity === 1) {
      throw new ParseError(
        "'" + word + "' は 1 引数のマクロです。'(" + word + " <expr>)' として使ってください",
        start,
      );
    }
    throw new ParseError("不明な識別子 '" + word + "'", start);
  }

  if (ch === '(') {
    const openAt = c.pos;
    c.pos++;
    c.skipWs();

    if (c.eof() || !isAlpha(c.peek())) {
      throw new ParseError("'(' の直後は演算子名が必要です", c.pos);
    }
    const headAt = c.pos;
    const head = readWord(c);

    // Require whitespace after the head keyword for readability,
    // unless the next char already ends the list (empty arg → error below).
    const afterHead = c.pos;
    c.skipWs();
    if (c.pos === afterHead && !(c.peek() === '(' || c.peek() === ')')) {
      throw new ParseError("'" + head + "' の後に空白が必要です", c.pos);
    }

    let result: Expr;
    if (head === 'f') {
      const left = parseExpr(c);
      c.skipWs();
      const right = parseExpr(c);
      result = f(left, right);
    } else if (head === 'exp') {
      const arg = parseExpr(c);
      result = expExp(arg);
    } else if (head === 'ln') {
      const arg = parseExpr(c);
      result = expLn(arg);
    } else if (head === 'id') {
      const arg = parseExpr(c);
      result = expId(arg);
    } else {
      const userMacro = getUserMacro(head);
      if (userMacro && userMacro.arity === 1) {
        const arg = parseExpr(c);
        result = substituteVar(userMacro.body, arg);
      } else if (userMacro && userMacro.arity === 0) {
        throw new ParseError(
          "'" + head + "' は定数マクロです。括弧なしで使ってください",
          headAt,
        );
      } else {
        throw new ParseError("不明な演算子 '" + head + "'", headAt);
      }
    }

    c.skipWs();
    if (c.eof() || c.peek() !== ')') {
      throw new ParseError("')' が不足しています (対応する '(' は位置 " + openAt + ')', c.pos);
    }
    c.pos++;
    return result;
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
