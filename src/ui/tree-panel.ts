// Visual tree builder. SVG-based, drag-free: click to mutate.

import type { Expr } from '../lib/ast.ts';
import { containsVar, f, one, varX } from '../lib/ast.ts';
import { tryEvaluate } from '../lib/evaluator.ts';
import type { ExpressionBus } from './pubsub.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const NODE_W = 56;
const NODE_H = 28;
const GAP_X = 12;
const GAP_Y = 48;

type Layout = {
  expr: Expr;
  path: Path;
  x: number;
  y: number;
  width: number;
  children?: Layout[];
};

type Step = 'L' | 'R';
type Path = readonly Step[];

export function mountTreePanel(root: HTMLElement, bus: ExpressionBus): void {
  root.innerHTML = `
    <h2>ツリー</h2>
    <p class="hint">
      葉 (<code>1</code> / <code>x</code>) をクリックするとその場で 3 つから選択、
      <code>f</code> ノードをクリックすると葉 <code>1</code> に折り畳みます。
    </p>
    <label class="field">
      <span>x = </span>
      <input id="tree-x" type="number" step="0.1" value="1" />
    </label>
    <div class="tree-svg-holder"></div>
  `;

  const holder = root.querySelector<HTMLDivElement>('.tree-svg-holder')!;
  const xInput = root.querySelector<HTMLInputElement>('#tree-x')!;

  let current: Expr = one;

  const setExpr = (expr: Expr, publish: boolean): void => {
    current = expr;
    render();
    if (publish) {
      bus.publish(expr);
    }
  };

  const render = (): void => {
    holder.innerHTML = '';
    const xVal = Number(xInput.value);
    const layout = layoutTree(current, []);
    const svg = renderSvg(layout, Number.isFinite(xVal) ? xVal : undefined, (path) => {
      setExpr(mutateAt(current, path), true);
    });
    holder.appendChild(svg);
  };

  xInput.addEventListener('input', render);

  bus.subscribe((expr) => {
    if (expr !== current) {
      current = expr;
      render();
    }
  });

  render();
}

function layoutTree(expr: Expr, path: Path): Layout {
  if (expr.type !== 'f') {
    return {
      expr,
      path,
      x: 0,
      y: 0,
      width: NODE_W,
    };
  }
  const left = layoutTree(expr.left, [...path, 'L']);
  const right = layoutTree(expr.right, [...path, 'R']);
  const width = left.width + right.width + GAP_X;
  left.x = 0;
  right.x = left.width + GAP_X;
  shift(left, 0, GAP_Y);
  shift(right, 0, GAP_Y);
  return {
    expr,
    path,
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
  onNodeClick: (path: Path) => void,
): SVGSVGElement {
  const padding = 16;
  const width = layout.width + padding * 2;
  const height = measureHeight(layout) + padding * 2;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'tree-svg');

  drawNode(svg, layout, padding, padding, xVal, onNodeClick);
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
  onNodeClick: (path: Path) => void,
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
  g.setAttribute('class', `tree-node tree-node-${layout.expr.type}`);
  g.setAttribute('transform', `translate(${layout.x + offsetX}, ${layout.y + offsetY})`);
  g.style.cursor = 'pointer';
  g.addEventListener('click', (e) => {
    e.stopPropagation();
    onNodeClick(layout.path);
  });

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

  // Per-node evaluated value (small text below).
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
      drawNode(svg, child, offsetX, offsetY, xVal, onNodeClick);
    }
  }
}

function formatShort(v: number): string {
  if (Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-3 && v !== 0)) {
    return v.toExponential(2);
  }
  return Number(v.toFixed(3)).toString();
}

/** Replace the subtree at `path` with a mutation:
 *  - `1` → `x`
 *  - `x` → `(f 1 1)`
 *  - `(f _ _)` → `1`
 */
function mutateAt(root: Expr, path: Path): Expr {
  const replace = (node: Expr): Expr => {
    if (node.type === 'one') return varX;
    if (node.type === 'var') return f(one, one);
    return one;
  };
  return replaceAt(root, path, replace);
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
