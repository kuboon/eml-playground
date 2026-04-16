import './style.css';
import type { Expr } from './lib/ast.ts';
import { parse, parseRpn } from './lib/parser.ts';
import { toRpn } from './lib/printer.ts';
import { mountGalleryPanel } from './ui/gallery-panel.ts';
import { mountPlotPanel } from './ui/plot-panel.ts';
import { mountTreePanel } from './ui/tree-panel.ts';
import { ExpressionBus } from './ui/pubsub.ts';

const bus = new ExpressionBus();

const galleryRoot = document.getElementById('gallery');
const plotRoot = document.getElementById('plot');
const treeRoot = document.getElementById('tree');

if (!galleryRoot || !plotRoot || !treeRoot) {
  throw new Error('panel roots not found in index.html');
}

mountGalleryPanel(galleryRoot, bus);
mountPlotPanel(plotRoot, bus);
mountTreePanel(treeRoot, bus);

const DEFAULT_RPN = '1 1 f';

// Space-free URL form: tokens joined with `_` instead of `%20`.
const encodeRpnForHash = (rpn: string): string => rpn.replaceAll(' ', '_');
const decodeRpnFromHash = (hash: string): string => hash.replaceAll('_', ' ');

type HashPayload =
  | { kind: 'rpn'; value: string }
  | { kind: 'func'; value: string };

function readHashPayload(): HashPayload | null {
  const hash = window.location.hash;
  if (!hash) return null;
  const body = hash.startsWith('#') ? hash.slice(1) : hash;
  let rpn: string | null = null;
  let func: string | null = null;
  for (const part of body.split('&')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq);
    const raw = part.slice(eq + 1);
    try {
      if (key === 'rpn' && rpn === null) {
        rpn = decodeRpnFromHash(decodeURIComponent(raw));
      } else if (key === 'func' && func === null) {
        func = decodeURIComponent(raw);
      }
    } catch {
      return null;
    }
  }
  if (rpn !== null) return { kind: 'rpn', value: rpn };
  if (func !== null) return { kind: 'func', value: func };
  return null;
}

function parseHashPayload(payload: HashPayload): Expr | null {
  const result =
    payload.kind === 'rpn' ? parseRpn(payload.value) : parse(payload.value);
  return result.ok ? result.expr : null;
}

function writeHashFromExpr(expr: Expr): void {
  const next = '#rpn=' + encodeRpnForHash(toRpn(expr));
  if (window.location.hash === next) return;
  // replaceState avoids polluting browser history and does NOT fire
  // hashchange, so our own writes don't feed back through the listener.
  history.replaceState(null, '', next);
}

// Keep the URL hash in sync with the current expression.
bus.subscribe((expr) => {
  writeHashFromExpr(expr);
});

// Seed from the URL if possible, otherwise fall back to the default.
function seedFromHash(): void {
  const payload = readHashPayload();
  if (payload) {
    const expr = parseHashPayload(payload);
    if (expr) {
      bus.publish(expr);
      return;
    }
  }
  const fallback = parseRpn(DEFAULT_RPN);
  if (fallback.ok) bus.publish(fallback.expr);
}

seedFromHash();

// Respond to user-driven hash changes (e.g. back button).
window.addEventListener('hashchange', () => {
  const payload = readHashPayload();
  if (payload === null) return;
  const expr = parseHashPayload(payload);
  if (expr === null) return;
  const currentRpn = bus.value ? toRpn(bus.value) : null;
  if (currentRpn === toRpn(expr)) return;
  bus.publish(expr);
});
