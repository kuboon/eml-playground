// User-defined macros, shared between the parser and the gallery UI.
// Pure module apart from optional localStorage persistence.

import type { Expr } from './ast.ts';
import { containsVar } from './ast.ts';

export type UserMacro = {
  /** Identifier (alpha-only) under which the macro is parsed. */
  readonly name: string;
  /** 0 = parsed as a bare word (like `e`); 1 = parsed as `(name arg)`. */
  readonly arity: 0 | 1;
  /** Expansion body. For arity 1, any `x` inside is the bound parameter. */
  readonly body: Expr;
};

// Reserved words that can never be redefined by the user.
export const RESERVED_NAMES: ReadonlySet<string> = new Set([
  'x',
  'X',
  'e',
  'f',
  'exp',
  'ln',
  'id',
]);

const STORAGE_KEY = 'eml-playground:user-macros:v1';

const store = new Map<string, UserMacro>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

function persist(): void {
  try {
    const raw = JSON.stringify([...store.values()]);
    globalThis.localStorage?.setItem(STORAGE_KEY, raw);
  } catch {
    // Ignore storage errors (quota, private mode, non-browser env).
  }
}

function hydrate(): void {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return;
    for (const item of parsed) {
      if (
        item &&
        typeof item === 'object' &&
        'name' in item &&
        'arity' in item &&
        'body' in item &&
        typeof (item as UserMacro).name === 'string'
      ) {
        const m = item as UserMacro;
        if (RESERVED_NAMES.has(m.name)) continue;
        store.set(m.name, m);
      }
    }
  } catch {
    // Ignore corrupted storage.
  }
}

hydrate();

export function getUserMacro(name: string): UserMacro | undefined {
  return store.get(name);
}

export function listUserMacros(): UserMacro[] {
  return [...store.values()];
}

export function hasUserMacro(name: string): boolean {
  return store.has(name);
}

/** Validate that `name` is a legal identifier and not reserved. */
export function validateMacroName(name: string): string | null {
  if (!name) return '名前を入力してください';
  if (!/^[A-Za-z]+$/.test(name)) return '名前は英字のみ使用できます';
  if (RESERVED_NAMES.has(name)) return `'${name}' は予約語のため使えません`;
  return null;
}

/** Add or replace a user macro, given a raw expression body. */
export function addUserMacro(name: string, body: Expr): UserMacro {
  const arity: 0 | 1 = containsVar(body) ? 1 : 0;
  const macro: UserMacro = { name, arity, body };
  store.set(name, macro);
  persist();
  notify();
  return macro;
}

export function removeUserMacro(name: string): void {
  if (store.delete(name)) {
    persist();
    notify();
  }
}

export function subscribeUserMacros(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
