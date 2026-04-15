// Gallery of preset expressions.

import { parse } from '../lib/parser.ts';
import { presets } from '../lib/presets.ts';
import type { ExpressionBus } from './pubsub.ts';

export function mountGalleryPanel(root: HTMLElement, bus: ExpressionBus): void {
  root.innerHTML = `
    <h2>ギャラリー</h2>
    <p class="hint">クリックすると式が全パネルに反映されます。</p>
    <ul class="preset-list"></ul>
  `;

  const list = root.querySelector<HTMLUListElement>('.preset-list')!;

  for (const preset of presets) {
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
    button.querySelector<HTMLElement>('.preset-name')!.textContent = preset.name;
    button.querySelector<HTMLElement>('.preset-source')!.textContent = preset.source;
    button.querySelector<HTMLElement>('.preset-desc')!.textContent = preset.description;

    button.addEventListener('click', () => {
      const parsed = parse(preset.source);
      if (parsed.ok) {
        bus.publish(parsed.expr);
      }
    });

    li.appendChild(button);
    list.appendChild(li);
  }
}
