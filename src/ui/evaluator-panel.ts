// Text-based evaluator panel.

import { containsVar, nodeCount } from '../lib/ast.ts';
import { tryEvaluate } from '../lib/evaluator.ts';
import { parse } from '../lib/parser.ts';
import { toLatex, toSource } from '../lib/printer.ts';
import type { ExpressionBus } from './pubsub.ts';

export function mountEvaluatorPanel(root: HTMLElement, bus: ExpressionBus): void {
  root.innerHTML = `
    <h2>評価器</h2>
    <label class="field">
      <span>S 式</span>
      <textarea id="eval-input" spellcheck="false" autocapitalize="off" autocomplete="off">(f (f 1 1) 1)</textarea>
    </label>
    <div class="status" id="eval-status"></div>
    <dl class="kv">
      <dt>正規形</dt><dd><code id="eval-source">—</code></dd>
      <dt>ノード数 K</dt><dd id="eval-k">—</dd>
      <dt>LaTeX</dt><dd><code id="eval-latex">—</code></dd>
      <dt>x = 1 での値</dt><dd id="eval-value">—</dd>
    </dl>
  `;

  const input = root.querySelector<HTMLTextAreaElement>('#eval-input')!;
  const status = root.querySelector<HTMLDivElement>('#eval-status')!;
  const sourceEl = root.querySelector<HTMLElement>('#eval-source')!;
  const kEl = root.querySelector<HTMLElement>('#eval-k')!;
  const latexEl = root.querySelector<HTMLElement>('#eval-latex')!;
  const valueEl = root.querySelector<HTMLElement>('#eval-value')!;

  let suppressPublish = false;

  const render = (): void => {
    const result = parse(input.value);
    if (!result.ok) {
      status.textContent = `エラー (位置 ${result.position}): ${result.message}`;
      status.className = 'status error';
      sourceEl.textContent = '—';
      kEl.textContent = '—';
      latexEl.textContent = '—';
      valueEl.textContent = '—';
      return;
    }

    status.textContent = 'OK';
    status.className = 'status ok';
    sourceEl.textContent = toSource(result.expr);
    kEl.textContent = String(nodeCount(result.expr));
    latexEl.textContent = toLatex(result.expr);

    const hasVar = containsVar(result.expr);
    const value = tryEvaluate(result.expr, hasVar ? 1 : undefined);
    valueEl.textContent = formatValue(value);

    if (!suppressPublish) {
      bus.publish(result.expr);
    }
  };

  input.addEventListener('input', render);

  bus.subscribe((expr) => {
    const next = toSource(expr);
    if (next !== input.value.trim()) {
      suppressPublish = true;
      input.value = next;
      suppressPublish = false;
      render();
    }
  });

  render();
}

function formatValue(v: number | undefined): string {
  if (v === undefined) return '—';
  if (Number.isNaN(v)) return 'NaN (定義域外)';
  if (v === Infinity) return '+∞';
  if (v === -Infinity) return '−∞';
  return v.toPrecision(10);
}
