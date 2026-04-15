import './style.css';
import { parse } from './lib/parser.ts';
import { toSource } from './lib/printer.ts';
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

const DEFAULT_SOURCE = '(f 1 1)';

function readHashSource(): string | null {
  const hash = window.location.hash;
  if (!hash) return null;
  // Strip the leading '#'. Accept either `func=...` or `#func=...`.
  const body = hash.startsWith('#') ? hash.slice(1) : hash;
  for (const part of body.split('&')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq) !== 'func') continue;
    try {
      return decodeURIComponent(part.slice(eq + 1));
    } catch {
      return null;
    }
  }
  return null;
}

function writeHashSource(src: string): void {
  const next = '#func=' + encodeURIComponent(src);
  if (window.location.hash === next) return;
  // replaceState avoids polluting browser history and does NOT fire
  // hashchange, so our own writes don't feed back through the listener.
  history.replaceState(null, '', next);
}

// Keep the URL hash in sync with the current expression.
bus.subscribe((expr) => {
  writeHashSource(toSource(expr));
});

// Seed from the URL if possible, otherwise fall back to the default.
function seedFromHash(): void {
  const hashSrc = readHashSource();
  const src = hashSrc ?? DEFAULT_SOURCE;
  const parsed = parse(src);
  if (parsed.ok) {
    bus.publish(parsed.expr);
    return;
  }
  const fallback = parse(DEFAULT_SOURCE);
  if (fallback.ok) bus.publish(fallback.expr);
}

seedFromHash();

// Respond to user-driven hash changes (e.g. back button).
window.addEventListener('hashchange', () => {
  const src = readHashSource();
  if (src === null) return;
  const parsed = parse(src);
  if (!parsed.ok) return;
  const currentSrc = bus.value ? toSource(bus.value) : null;
  if (currentSrc === toSource(parsed.expr)) return;
  bus.publish(parsed.expr);
});
