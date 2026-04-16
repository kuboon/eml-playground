// Gallery of preset expressions.

import {
  listUserMacros,
  removeUserMacro,
  subscribeUserMacros,
  type UserMacro,
} from '../lib/macros.ts';
import { parse } from '../lib/parser.ts';
import { presets, type Preset } from '../lib/presets.ts';
import { toSource } from '../lib/printer.ts';
import type { ExpressionBus } from './pubsub.ts';

type GalleryEntry = {
  readonly name: string;
  readonly source: string;
  readonly description: string;
  readonly removable: boolean;
};

function presetToEntry(p: Preset): GalleryEntry {
  return {
    name: p.name,
    source: p.source,
    description: p.description,
    removable: false,
  };
}

function macroToEntry(m: UserMacro): GalleryEntry {
  const body = toSource(m.body);
  const usage = m.arity === 0 ? m.name : `(${m.name} <expr>)`;
  const description =
    m.arity === 0
      ? `ユーザー定義の定数。'${m.name}' と書くと展開される`
      : `ユーザー定義の 1 引数関数。'${usage}' と書くと展開される`;
  return {
    name: m.name,
    source: body,
    description,
    removable: true,
  };
}

export function mountGalleryPanel(root: HTMLElement, bus: ExpressionBus): void {
  root.innerHTML = `
    <h2>ギャラリー</h2>
    <p class="hint">クリックすると式が全パネルに反映されます。</p>
    <ul class="preset-list"></ul>
  `;

  const list = root.querySelector<HTMLUListElement>('.preset-list')!;

  const render = (): void => {
    list.innerHTML = '';
    const entries: GalleryEntry[] = [
      ...presets.map(presetToEntry),
      ...listUserMacros().map(macroToEntry),
    ];

    for (const entry of entries) {
      const li = document.createElement('li');
      li.className = 'preset-item';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'preset-button';
      button.innerHTML = `
        <span class="preset-name"></span>
        <code class="preset-source"></code>
        <span class="preset-desc"></span>
      `;
      button.querySelector<HTMLElement>('.preset-name')!.textContent = entry.name;
      button.querySelector<HTMLElement>('.preset-source')!.textContent = entry.source;
      button.querySelector<HTMLElement>('.preset-desc')!.textContent = entry.description;

      button.addEventListener('click', () => {
        const parsed = parse(entry.source);
        if (parsed.ok) {
          bus.publish(parsed.expr);
        }
      });

      li.appendChild(button);

      if (entry.removable) {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'preset-delete';
        del.textContent = '×';
        del.title = `'${entry.name}' を削除`;
        del.setAttribute('aria-label', `'${entry.name}' を削除`);
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          const ok = globalThis.confirm(`'${entry.name}' を削除しますか?`);
          if (!ok) return;
          removeUserMacro(entry.name);
        });
        li.appendChild(del);
      }

      list.appendChild(li);
    }
  };

  render();
  subscribeUserMacros(render);
}
