// Curated gallery of expressions from the paper.
// Pure module: no DOM imports.

export type Preset = {
  /** Short identifier / display name. */
  readonly name: string;
  /** Japanese explanation shown in the gallery. */
  readonly description: string;
  /** S-expression source, parseable by `lib/parser.ts`. */
  readonly source: string;
  /** Optional reference implementation for plot comparison. */
  readonly reference?: (x: number) => number;
  /** Default plot range. */
  readonly domain?: readonly [number, number];
};

export const presets: readonly Preset[] = [
  {
    name: 'e',
    description: 'ネイピア数 e = exp(1) − ln(1) = e − 0',
    source: '(f 1 1)',
  },
  {
    name: 'exp(x)',
    description: '指数関数。右辺を 1 にすると ln(1) = 0 が消えて exp(x) だけが残る',
    source: '(f x 1)',
    reference: Math.exp,
    domain: [-2, 3],
  },
  {
    name: 'ln(x)',
    description: '自然対数。exp と ln の入れ子で exp 部分を打ち消すイデア',
    source: '(f 1 (f (f 1 x) 1))',
    reference: Math.log,
    domain: [0.1, 5],
  },
  {
    name: 'id(x)',
    description: '恒等関数 id(x) = exp(ln(x))。exp と ln を合成すると元に戻る',
    source: '(f 1 (f (f 1 (f x 1)) 1))',
    reference: (x) => x,
    domain: [0.1, 5],
  },
  {
    name: 'π (近似)',
    description:
      '円周率 π ≈ 3.1412。論文では ln(−1)/i などの複素数経由で厳密に構成されるが、実数評価器向けに 12 ノードで作った近似式（誤差 ≈ 4×10⁻⁴）',
    source:
      '(f 1 (f (f (f (f 1 (f (f 1 1) 1)) (f (f 1 1) 1)) 1) (f 1 (f 1 1))))',
  },
  {
    name: 'sin(x) (近似)',
    description:
      '正弦関数 sin(x)。論文では Euler の公式 sin x = (eⁱˣ − e⁻ⁱˣ)/(2i) 経由で 100 段超の EML ツリーとなるため、ここでは原点近傍の近似式（sin x ≈ x） を表示',
    source:
      '(f (f x 1) (f (f (f x 1) (f x 1)) (f x (f x 1))))',
    reference: Math.sin,
    domain: [-Math.PI, Math.PI],
  },
];
