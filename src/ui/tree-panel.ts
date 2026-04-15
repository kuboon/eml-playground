// Merged evaluator + visual tree builder panel.
// - S-expression textarea edits the expression directly.
// - Click a node (or press Enter) to open a popover and pick a replacement.
// - Arrow keys navigate the tree, 1/x/f keys apply directly.
// - Ctrl/Cmd+Z / Shift+Z for undo/redo.

import type { Expr } from '../lib/ast.ts';
import { containsVar, f, one, varX } from '../lib/ast.ts';
import { tryEvaluate } from '../lib/evaluator.ts';
import { parse } from '../lib/parser.ts';
import { toSource } from '../lib/printer.ts';
import type { ExpressionBus } from './pubsub.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const NODE_W = 56;
const NODE_H = 28;
const GAP_X = 12;
const GAP_Y = 48;
const HISTORY_LIMIT = 100;

type Step = 'L' | 'R';
type Path = readonly Step[];
type NodeKind = 'one' | 'var' | 'f' | 'e' | 'exp' | 'ln' | 'id';

type Layout = {
  expr: Expr;
  path: Path;
  pathKey: string;
  x: number;
  y: number;
  width: number;
  children?: Layout[];
};

// Build the expansion tree for a popover "shortcut" button.
function expansionFor(kind: NodeKind): Expr {
  switch (kind) {
    case 'one':
      return one;
    case 'var':
      return varX;
    case 'f':
      return f(one, one);
    case 'e':
      return f(one, one);
    case 'exp':
      return f(varX, one);
    case 'ln':
      return f(one, f(f(one, varX), one));
    case 'id':
      return f(one, f(f(one, f(varX, one)), one));
  }
}

export function mountTreePanel(root: HTMLElement, bus: ExpressionBus): void {
  root.innerHTML = `
    <h2>評価器・ツリー</h2>
    <label class="field">
      <span>S 式</span>
      <textarea id="eval-input" spellcheck="false" autocapitalize="off" autocomplete="off" rows="2">(f 1 1)</textarea>
    </label>
    <div class="status" id="eval-status"></div>
    <p class="hint">
      ノードをクリック (または <kbd>Enter</kbd>) で <code>1</code> / <code>x</code> / <code>f</code> /
      <code>e</code> / <code>exp</code> / <code>ln</code> / <code>id</code> を選択。
      矢印キーで移動、<code>1</code>/<code>x</code>/<code>f</code> キーで直接変更、
      <kbd>Ctrl</kbd>+<kbd>Z</kbd> で取り消し。
    </p>
    <div class="tree-controls">
      <label class="field">
        <span>x = </span>
        <input id="tree-x" type="number" step="0.1" value="1" />
      </label>
      <button type="button" class="tree-btn" data-action="undo" disabled>Undo</button>
      <button type="button" class="tree-btn" data-action="redo" disabled>Redo</button>
    </div>
    <div class="tree-svg-holder"></div>
  `;

  const input = root.querySelector<HTMLTextAreaElement>('#eval-input')!;
  const status = root.querySelector<HTMLDivElement>('#eval-status')!;
  const holder = root.querySelector<HTMLDivElement>('.tree-svg-holder')!;
  const xInput = root.querySelector<HTMLInputElement>('#tree-x')!;
  const undoBtn = root.querySelector<HTMLButtonElement>('[data-action="undo"]')!;
  const redoBtn = root.querySelector<HTMLButtonElement>('[data-action="redo"]')!;

  let current: Expr = one;
  let selectedKey = '';
  let currentLayout: Layout = layoutTree(current, [], '');
  let currentSvg: SVGSVGElement | null = null;
  let popover: HTMLDivElement | null = null;

  const history: Expr[] = [];
  const future: Expr[] = [];

  const setStatusOk = (): void => {
    status.textContent = 'OK';
    status.className = 'status ok';
  };
  const setStatusError = (msg: string): void => {
    status.textContent = msg;
    status.className = 'status error';
  };

  const syncTextarea = (expr: Expr): void => {
    const next = toSource(expr);
    if (input.value.trim() !== next) {
      input.value = next;
    }
    setStatusOk();
  };

  const setExpr = (
    expr: Expr,
    opts: { publish: boolean; pushHistory: boolean; syncText: boolean },
  ): void => {
    if (expr === current) return;
    if (opts.pushHistory) {
      history.push(current);
      if (history.length > HISTORY_LIMIT) history.shift();
      future.length = 0;
    }
    current = expr;
    if (opts.syncText) syncTextarea(expr);
    renderTree();
    updateHistoryButtons();
    if (opts.publish) {
      bus.publish(expr);
    }
  };

  const undo = (): void => {
    const prev = history.pop();
    if (prev === undefined) return;
    future.push(current);
    current = prev;
    syncTextarea(current);
    renderTree();
    updateHistoryButtons();
    bus.publish(current);
  };

  const redo = (): void => {
    const next = future.pop();
    if (next === undefined) return;
    history.push(current);
    current = next;
    syncTextarea(current);
    renderTree();
    updateHistoryButtons();
    bus.publish(current);
  };

  const updateHistoryButtons = (): void => {
    undoBtn.disabled = history.length === 0;
    redoBtn.disabled = future.length === 0;
  };

  const renderTree = (): void => {
    closePopover();
    holder.innerHTML = '';
    const xVal = Number(xInput.value);
    currentLayout = layoutTree(current, [], '');

    // Re-anchor selection to a still-valid path; fallback to ancestors.
    selectedKey = clampSelection(currentLayout, selectedKey);

    currentSvg = renderSvg(
      currentLayout,
      Number.isFinite(xVal) ? xVal : undefined,
      selectedKey,
    );
    holder.appendChild(currentSvg);
  };

  // ---- textarea handling ----

  input.addEventListener('input', () => {
    const result = parse(input.value);
    if (!result.ok) {
      setStatusError(`エラー (位置 ${result.position}): ${result.message}`);
      return;
    }
    setStatusOk();
    if (result.expr === current) return;
    // Don't sync text back to avoid clobbering user's in-progress typing
    // (e.g. macros like `(exp x)` which would normalize to `(f x 1)`).
    setExpr(result.expr, { publish: true, pushHistory: true, syncText: false });
  });

  xInput.addEventListener('input', renderTree);

  // Delegated SVG click → select + open popover.
  holder.addEventListener('click', (e) => {
    const target = e.target as Element | null;
    const g = target?.closest('g.tree-node') as SVGGElement | null;
    if (!g || !holder.contains(g)) return;
    const key = g.getAttribute('data-path') ?? '';
    e.stopPropagation();
    selectedKey = key;
    updateSelectionClass();
    currentSvg?.focus();
    openPopoverAt(key);
  });

  // Click outside closes popover.
  document.addEventListener('mousedown', (e) => {
    if (!popover) return;
    const t = e.target as Node;
    if (popover.contains(t)) return;
    if (holder.contains(t)) return;
    closePopover();
  });

  holder.addEventListener('keydown', (e) => {
    if (!currentSvg) return;
    const key = e.key;

    if ((e.ctrlKey || e.metaKey) && (key === 'z' || key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (key === 'y' || key === 'Y')) {
      e.preventDefault();
      redo();
      return;
    }

    if (key === 'Escape') {
      if (popover) closePopover();
      else {
        selectedKey = '';
        updateSelectionClass();
      }
      e.preventDefault();
      return;
    }

    if (key === 'Enter' || key === ' ') {
      e.preventDefault();
      openPopoverAt(selectedKey);
      return;
    }

    if (key === '1') {
      e.preventDefault();
      applyKind(selectedKey, 'one');
      return;
    }
    if (key === 'x' || key === 'X') {
      e.preventDefault();
      applyKind(selectedKey, 'var');
      return;
    }
    if (key === 'f' || key === 'F') {
      e.preventDefault();
      applyKind(selectedKey, 'f');
      return;
    }

    if (key === 'ArrowUp') {
      e.preventDefault();
      if (selectedKey.length > 0) {
        selectedKey = selectedKey.slice(0, -1);
        updateSelectionClass();
      }
      return;
    }
    if (key === 'ArrowDown') {
      e.preventDefault();
      const node = findLayout(currentLayout, selectedKey);
      if (node?.children) {
        selectedKey = selectedKey + 'L';
        updateSelectionClass();
      }
      return;
    }
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      e.preventDefault();
      if (selectedKey.length === 0) return;
      const want: Step = key === 'ArrowLeft' ? 'L' : 'R';
      selectedKey = selectedKey.slice(0, -1) + want;
      updateSelectionClass();
      return;
    }
  });

  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);

  const applyKind = (pathKey: string, kind: NodeKind): void => {
    const node = findLayout(currentLayout, pathKey);
    if (!node) return;
    const replacement = expansionFor(kind);
    const next = replaceAt(current, keyToPath(pathKey), () => replacement);
    closePopover();
    setExpr(next, { publish: true, pushHistory: true, syncText: true });
  };

  const updateSelectionClass = (): void => {
    if (!currentSvg) return;
    const prev = currentSvg.querySelectorAll('g.tree-node.is-selected');
    prev.forEach((el) => el.classList.remove('is-selected'));
    const sel = currentSvg.querySelector(
      `g.tree-node[data-path="${cssEscapeKey(selectedKey)}"]`,
    );
    if (sel) sel.classList.add('is-selected');
  };

  const openPopoverAt = (pathKey: string): void => {
    closePopover();
    if (!currentSvg) return;
    const node = findLayout(currentLayout, pathKey);
    if (!node) return;
    const g = currentSvg.querySelector<SVGGElement>(
      `g.tree-node[data-path="${cssEscapeKey(pathKey)}"]`,
    );
    if (!g) return;

    const pop = document.createElement('div');
    pop.className = 'tree-popover';
    pop.setAttribute('role', 'menu');
    const currentKind: NodeKind =
      node.expr.type === 'one' ? 'one' : node.expr.type === 'var' ? 'var' : 'f';
    const make = (kind: NodeKind, label: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tree-popover-btn';
      b.textContent = label;
      b.dataset.kind = kind;
      // Only the primitive kinds (one/var/f) have a direct "pressed" state.
      if (kind === currentKind) {
        b.setAttribute('aria-pressed', 'true');
        b.disabled = true;
      }
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        applyKind(pathKey, kind);
      });
      return b;
    };
    pop.appendChild(make('one', '1'));
    pop.appendChild(make('var', 'x'));
    pop.appendChild(make('f', 'f'));
    pop.appendChild(make('e', 'e'));
    pop.appendChild(make('exp', 'exp'));
    pop.appendChild(make('ln', 'ln'));
    pop.appendChild(make('id', 'id'));

    // Position relative to the holder.
    holder.appendChild(pop);
    const gRect = g.getBoundingClientRect();
    const hRect = holder.getBoundingClientRect();
    const pRect = pop.getBoundingClientRect();
    const left = gRect.left - hRect.left + gRect.width / 2 - pRect.width / 2;
    const top = gRect.bottom - hRect.top + 6;
    pop.style.left = `${Math.max(4, left)}px`;
    pop.style.top = `${top}px`;
    popover = pop;
  };

  const closePopover = (): void => {
    if (popover && popover.parentNode) {
      popover.parentNode.removeChild(popover);
    }
    popover = null;
  };

  bus.subscribe((expr) => {
    if (expr !== current) {
      current = expr;
      syncTextarea(expr);
      // External changes don't participate in undo/redo history.
      renderTree();
      updateHistoryButtons();
    }
  });

  syncTextarea(current);
  renderTree();
}

// ---------- layout / render ----------

function layoutTree(expr: Expr, path: Path, pathKey: string): Layout {
  if (expr.type !== 'f') {
    return {
      expr,
      path,
      pathKey,
      x: 0,
      y: 0,
      width: NODE_W,
    };
  }
  const left = layoutTree(expr.left, [...path, 'L'], pathKey + 'L');
  const right = layoutTree(expr.right, [...path, 'R'], pathKey + 'R');
  const width = left.width + right.width + GAP_X;
  // Shift the whole subtree (root + descendants). Previously only the subtree
  // root's x was overwritten, which left descendants at their local-origin x
  // and caused overlaps starting from depth 4.
  shift(left, 0, GAP_Y);
  shift(right, left.width + GAP_X, GAP_Y);
  return {
    expr,
    path,
    pathKey,
    x: (width - NODE_W) / 2,
    y: 0,
    width,
    children: [left, right],
  };
}

function shift(layout: Layout, dx: number, dy: number): void {
  layout.x += dx;
  layout.y += dy;
  if (layout.children) {
    for (const c of layout.children) shift(c, dx, dy);
  }
}

function renderSvg(
  layout: Layout,
  xVal: number | undefined,
  selectedKey: string,
): SVGSVGElement {
  const padding = 16;
  const width = layout.width + padding * 2;
  const height = measureHeight(layout) + padding * 2 + 14; // room for value label below
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'tree-svg');
  svg.setAttribute('tabindex', '0');
  drawNode(svg, layout, padding, padding, xVal, selectedKey);
  return svg;
}

function measureHeight(layout: Layout): number {
  let max = layout.y + NODE_H;
  if (layout.children) {
    for (const c of layout.children) {
      max = Math.max(max, measureHeight(c));
    }
  }
  return max;
}

function drawNode(
  svg: SVGSVGElement,
  layout: Layout,
  offsetX: number,
  offsetY: number,
  xVal: number | undefined,
  selectedKey: string,
): void {
  const cx = layout.x + offsetX + NODE_W / 2;
  const cy = layout.y + offsetY + NODE_H / 2;

  if (layout.children) {
    for (const child of layout.children) {
      const ccx = child.x + offsetX + NODE_W / 2;
      const ccy = child.y + offsetY + NODE_H / 2;
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(cx));
      line.setAttribute('y1', String(cy + NODE_H / 2));
      line.setAttribute('x2', String(ccx));
      line.setAttribute('y2', String(ccy - NODE_H / 2));
      line.setAttribute('class', 'tree-edge');
      svg.appendChild(line);
    }
  }

  const g = document.createElementNS(SVG_NS, 'g');
  const selClass = layout.pathKey === selectedKey ? ' is-selected' : '';
  g.setAttribute('class', `tree-node tree-node-${layout.expr.type}${selClass}`);
  g.setAttribute('transform', `translate(${layout.x + offsetX}, ${layout.y + offsetY})`);
  g.setAttribute('data-path', layout.pathKey);
  g.style.cursor = 'pointer';

  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('width', String(NODE_W));
  rect.setAttribute('height', String(NODE_H));
  rect.setAttribute('rx', '6');
  rect.setAttribute('class', 'tree-node-bg');
  g.appendChild(rect);

  const label = document.createElementNS(SVG_NS, 'text');
  label.setAttribute('x', String(NODE_W / 2));
  label.setAttribute('y', String(NODE_H / 2 + 4));
  label.setAttribute('text-anchor', 'middle');
  label.setAttribute('class', 'tree-node-label');
  label.textContent =
    layout.expr.type === 'one' ? '1' : layout.expr.type === 'var' ? 'x' : 'f';
  g.appendChild(label);

  const needsX = containsVar(layout.expr);
  const v = tryEvaluate(layout.expr, needsX ? xVal : undefined);
  if (v !== undefined && Number.isFinite(v)) {
    const valText = document.createElementNS(SVG_NS, 'text');
    valText.setAttribute('x', String(NODE_W / 2));
    valText.setAttribute('y', String(NODE_H + 12));
    valText.setAttribute('text-anchor', 'middle');
    valText.setAttribute('class', 'tree-node-value');
    valText.textContent = formatShort(v);
    g.appendChild(valText);
  }

  svg.appendChild(g);

  if (layout.children) {
    for (const child of layout.children) {
      drawNode(svg, child, offsetX, offsetY, xVal, selectedKey);
    }
  }
}

function formatShort(v: number): string {
  if (Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-3 && v !== 0)) {
    return v.toExponential(2);
  }
  return Number(v.toFixed(3)).toString();
}

// ---------- path helpers ----------

function keyToPath(key: string): Path {
  const path: Step[] = [];
  for (const ch of key) {
    path.push(ch === 'L' ? 'L' : 'R');
  }
  return path;
}

function findLayout(root: Layout, key: string): Layout | null {
  if (key === root.pathKey) return root;
  if (!root.children) return null;
  for (const c of root.children) {
    if (key === c.pathKey || key.startsWith(c.pathKey)) {
      const hit = findLayout(c, key);
      if (hit) return hit;
    }
  }
  return null;
}

function clampSelection(root: Layout, key: string): string {
  let k = key;
  while (k.length > 0 && !findLayout(root, k)) {
    k = k.slice(0, -1);
  }
  return k;
}

function cssEscapeKey(key: string): string {
  // Keys only contain L and R, safe to embed in attribute selector directly.
  return key;
}

function replaceAt(root: Expr, path: Path, fn: (node: Expr) => Expr): Expr {
  if (path.length === 0) return fn(root);
  if (root.type !== 'f') return root;
  const [head, ...rest] = path;
  if (head === 'L') {
    return f(replaceAt(root.left, rest, fn), root.right);
  }
  return f(root.left, replaceAt(root.right, rest, fn));
}
