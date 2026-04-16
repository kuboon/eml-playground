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

/**
 * Parse a Reverse Polish Notation form into an Expr.
 *
 * Tokens are whitespace-separated words, each of which either pushes or
 * reduces operands on a stack:
 *   `1`            push `one`
 *   `x`            push `varX`
 *   `e`            push `(f 1 1)`
 *   `f`            pop two operands, push `(f left right)`
 *   `exp`/`ln`/`id` pop one operand, apply the macro expansion
 *   user macro (arity 0) push its body
 *   user macro (arity 1) pop one operand, substitute into its body
 * A successful parse must leave exactly one expression on the stack.
 */
export function parseRpn(source: string): ParseResult {
  const stack: Expr[] = [];
  let pos = 0;
  const len = source.length;

  const skipWs = (): void => {
    while (pos < len) {
      const c = source.charCodeAt(pos);
      if (c === 32 || c === 9 || c === 10 || c === 13) pos++;
      else break;
    }
  };

  try {
    while (true) {
      skipWs();
      if (pos >= len) break;
      const tokStart = pos;
      const ch = source.charAt(pos);

      let token: string;
      if (ch === '1') {
        token = '1';
        pos++;
      } else if (isAlpha(ch)) {
        let s = '';
        while (pos < len && isAlpha(source.charAt(pos))) {
          s += source.charAt(pos);
          pos++;
        }
        token = s;
      } else {
        throw new ParseError("予期しない文字 '" + ch + "'", tokStart);
      }

      if (token === '1') {
        stack.push(one);
        continue;
      }
      if (token === 'x' || token === 'X') {
        stack.push(varX);
        continue;
      }
      if (token === 'e') {
        stack.push(f(one, one));
        continue;
      }
      if (token === 'f') {
        if (stack.length < 2) {
          throw new ParseError("'f' に対する被演算子が不足しています", tokStart);
        }
        const right = stack.pop()!;
        const left = stack.pop()!;
        stack.push(f(left, right));
        continue;
      }
      if (token === 'exp') {
        if (stack.length < 1) {
          throw new ParseError("'exp' に対する被演算子が不足しています", tokStart);
        }
        const arg = stack.pop()!;
        stack.push(f(arg, one));
        continue;
      }
      if (token === 'ln') {
        if (stack.length < 1) {
          throw new ParseError("'ln' に対する被演算子が不足しています", tokStart);
        }
        const arg = stack.pop()!;
        stack.push(f(one, f(f(one, arg), one)));
        continue;
      }
      if (token === 'id') {
        if (stack.length < 1) {
          throw new ParseError("'id' に対する被演算子が不足しています", tokStart);
        }
        const arg = stack.pop()!;
        stack.push(f(one, f(f(one, f(arg, one)), one)));
        continue;
      }

      const macro = getUserMacro(token);
      if (macro && macro.arity === 0) {
        stack.push(macro.body);
        continue;
      }
      if (macro && macro.arity === 1) {
        if (stack.length < 1) {
          throw new ParseError(
            "'" + token + "' に対する被演算子が不足しています",
            tokStart,
          );
        }
        const arg = stack.pop()!;
        stack.push(substituteVar(macro.body, arg));
        continue;
      }

      throw new ParseError("不明なトークン '" + token + "'", tokStart);
    }

    if (stack.length === 0) {
      return { ok: false, message: '式が空です', position: 0 };
    }
    if (stack.length > 1) {
      return {
        ok: false,
        message: `被演算子が余っています (残り ${stack.length} 個)`,
        position: len,
      };
    }
    return { ok: true, expr: stack[0] };
  } catch (err) {
    if (err instanceof ParseError) {
      return { ok: false, message: err.message, position: err.position };
    }
    throw err;
  }
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
