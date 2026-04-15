import './style.css';
import { parse } from './lib/parser.ts';
import { mountEvaluatorPanel } from './ui/evaluator-panel.ts';
import { mountGalleryPanel } from './ui/gallery-panel.ts';
import { mountPlotPanel } from './ui/plot-panel.ts';
import { mountTreePanel } from './ui/tree-panel.ts';
import { ExpressionBus } from './ui/pubsub.ts';

const bus = new ExpressionBus();

const evaluatorRoot = document.getElementById('evaluator');
const galleryRoot = document.getElementById('gallery');
const plotRoot = document.getElementById('plot');
const treeRoot = document.getElementById('tree');

if (!evaluatorRoot || !galleryRoot || !plotRoot || !treeRoot) {
  throw new Error('panel roots not found in index.html');
}

mountEvaluatorPanel(evaluatorRoot, bus);
mountGalleryPanel(galleryRoot, bus);
mountPlotPanel(plotRoot, bus);
mountTreePanel(treeRoot, bus);

// Seed with e = (f 1 1)
const initial = parse('(f 1 1)');
if (initial.ok) {
  bus.publish(initial.expr);
}
