// 1-variable plot panel. Uses plain SVG, no external chart library.

import type { Expr } from '../lib/ast.ts';
import { containsVar } from '../lib/ast.ts';
import { presets } from '../lib/presets.ts';
import { toSource } from '../lib/printer.ts';
import type { Sample } from '../lib/sampler.ts';
import { sample, sampleFn } from '../lib/sampler.ts';
import type { ExpressionBus } from './pubsub.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const WIDTH = 480;
const HEIGHT = 320;
const MARGIN = { top: 16, right: 16, bottom: 32, left: 44 };
const INNER_W = WIDTH - MARGIN.left - MARGIN.right;
const INNER_H = HEIGHT - MARGIN.top - MARGIN.bottom;
const STEPS = 240;

export function mountPlotPanel(root: HTMLElement, bus: ExpressionBus): void {
  root.innerHTML = `
    <h2>プロット</h2>
    <div class="plot-controls">
      <label>x<sub>min</sub>: <input id="plot-lo" type="number" step="0.1" value="0.1" /></label>
      <label>x<sub>max</sub>: <input id="plot-hi" type="number" step="0.1" value="5" /></label>
      <label class="chk"><input id="plot-ref" type="checkbox" checked /> 参照関数を重ねる</label>
    </div>
    <div class="plot-message" id="plot-message"></div>
    <div class="plot-svg-holder"></div>
    <p class="hint">式に <code>x</code> を含むときに描画されます。</p>
  `;

  const loInput = root.querySelector<HTMLInputElement>('#plot-lo')!;
  const hiInput = root.querySelector<HTMLInputElement>('#plot-hi')!;
  const refInput = root.querySelector<HTMLInputElement>('#plot-ref')!;
  const messageEl = root.querySelector<HTMLDivElement>('#plot-message')!;
  const holder = root.querySelector<HTMLDivElement>('.plot-svg-holder')!;

  let currentExpr: Expr | null = null;

  const rerender = (): void => {
    holder.innerHTML = '';
    if (!currentExpr) {
      messageEl.textContent = '式が未設定です';
      return;
    }
    if (!containsVar(currentExpr)) {
      messageEl.textContent = '定数式です（x を含みません）';
      return;
    }

    const lo = Number(loInput.value);
    const hi = Number(hiInput.value);
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo >= hi) {
      messageEl.textContent = '範囲が不正です';
      return;
    }

    const samples = sample(currentExpr, lo, hi, STEPS);

    let reference: Sample[] | null = null;
    if (refInput.checked) {
      const src = toSource(currentExpr);
      const preset = presets.find((p) => p.source === src && p.reference);
      if (preset?.reference) {
        reference = sampleFn(preset.reference, lo, hi, STEPS);
      }
    }

    const bounds = computeYBounds([samples, reference].filter(nonNull));
    if (!bounds) {
      messageEl.textContent = '有限値のサンプルがありません';
      return;
    }

    messageEl.textContent = reference
      ? '青: eml 式  /  灰の破線: 参照関数'
      : '青: eml 式';

    const svg = renderSvg(lo, hi, bounds, samples, reference);
    holder.appendChild(svg);
  };

  loInput.addEventListener('input', rerender);
  hiInput.addEventListener('input', rerender);
  refInput.addEventListener('change', rerender);

  bus.subscribe((expr) => {
    currentExpr = expr;
    // Auto-adjust domain if a matching preset has one.
    const src = toSource(expr);
    const preset = presets.find((p) => p.source === src && p.domain);
    if (preset?.domain) {
      loInput.value = String(preset.domain[0]);
      hiInput.value = String(preset.domain[1]);
    }
    rerender();
  });
}

function nonNull<T>(v: T | null): v is T {
  return v !== null;
}

type Bounds = { lo: number; hi: number };

function computeYBounds(series: Sample[][]): Bounds | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of series) {
    for (const { y } of s) {
      if (Number.isFinite(y)) {
        if (y < lo) lo = y;
        if (y > hi) hi = y;
      }
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  } else {
    const pad = (hi - lo) * 0.08;
    lo -= pad;
    hi += pad;
  }
  return { lo, hi };
}

function renderSvg(
  xLo: number,
  xHi: number,
  yBounds: Bounds,
  samples: Sample[],
  reference: Sample[] | null,
): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
  svg.setAttribute('class', 'plot-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'plot of current expression');

  const mapX = (x: number): number =>
    MARGIN.left + ((x - xLo) / (xHi - xLo)) * INNER_W;
  const mapY = (y: number): number =>
    MARGIN.top + (1 - (y - yBounds.lo) / (yBounds.hi - yBounds.lo)) * INNER_H;

  // Plot area background
  const bg = document.createElementNS(SVG_NS, 'rect');
  bg.setAttribute('x', String(MARGIN.left));
  bg.setAttribute('y', String(MARGIN.top));
  bg.setAttribute('width', String(INNER_W));
  bg.setAttribute('height', String(INNER_H));
  bg.setAttribute('class', 'plot-bg');
  svg.appendChild(bg);

  // Zero-line for y=0 if visible.
  if (yBounds.lo <= 0 && yBounds.hi >= 0) {
    const zero = document.createElementNS(SVG_NS, 'line');
    zero.setAttribute('x1', String(MARGIN.left));
    zero.setAttribute('x2', String(MARGIN.left + INNER_W));
    zero.setAttribute('y1', String(mapY(0)));
    zero.setAttribute('y2', String(mapY(0)));
    zero.setAttribute('class', 'plot-zero');
    svg.appendChild(zero);
  }

  // Axis ticks and labels.
  addAxes(svg, xLo, xHi, yBounds, mapX, mapY);

  if (reference) {
    svg.appendChild(buildPolyline(reference, mapX, mapY, 'plot-line plot-line-ref'));
  }
  svg.appendChild(buildPolyline(samples, mapX, mapY, 'plot-line plot-line-eml'));

  return svg;
}

function buildPolyline(
  samples: Sample[],
  mapX: (x: number) => number,
  mapY: (y: number) => number,
  className: string,
): SVGPathElement {
  let d = '';
  let penUp = true;
  for (const s of samples) {
    if (!Number.isFinite(s.y)) {
      penUp = true;
      continue;
    }
    const px = mapX(s.x).toFixed(2);
    const py = mapY(s.y).toFixed(2);
    d += (penUp ? 'M' : 'L') + px + ',' + py + ' ';
    penUp = false;
  }
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d.trim());
  path.setAttribute('class', className);
  path.setAttribute('fill', 'none');
  return path;
}

function addAxes(
  svg: SVGSVGElement,
  xLo: number,
  xHi: number,
  yBounds: Bounds,
  mapX: (x: number) => number,
  mapY: (y: number) => number,
): void {
  const xTicks = tickValues(xLo, xHi, 5);
  const yTicks = tickValues(yBounds.lo, yBounds.hi, 5);

  for (const t of xTicks) {
    const x = mapX(t);
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', String(x));
    line.setAttribute('x2', String(x));
    line.setAttribute('y1', String(MARGIN.top + INNER_H));
    line.setAttribute('y2', String(MARGIN.top + INNER_H + 4));
    line.setAttribute('class', 'plot-tick');
    svg.appendChild(line);

    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String(x));
    text.setAttribute('y', String(MARGIN.top + INNER_H + 16));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('class', 'plot-label');
    text.textContent = formatTick(t);
    svg.appendChild(text);
  }

  for (const t of yTicks) {
    const y = mapY(t);
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', String(MARGIN.left - 4));
    line.setAttribute('x2', String(MARGIN.left));
    line.setAttribute('y1', String(y));
    line.setAttribute('y2', String(y));
    line.setAttribute('class', 'plot-tick');
    svg.appendChild(line);

    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String(MARGIN.left - 6));
    text.setAttribute('y', String(y + 4));
    text.setAttribute('text-anchor', 'end');
    text.setAttribute('class', 'plot-label');
    text.textContent = formatTick(t);
    svg.appendChild(text);
  }
}

function tickValues(lo: number, hi: number, count: number): number[] {
  const raw = (hi - lo) / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const frac = raw / pow;
  const step =
    frac < 1.5 ? pow : frac < 3 ? 2 * pow : frac < 7 ? 5 * pow : 10 * pow;
  const start = Math.ceil(lo / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= hi + 1e-9; t += step) {
    ticks.push(Number(t.toFixed(10)));
  }
  return ticks;
}

function formatTick(v: number): string {
  if (Math.abs(v) < 1e-10) return '0';
  if (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0)) {
    return v.toExponential(1);
  }
  return String(Number(v.toFixed(4)));
}
