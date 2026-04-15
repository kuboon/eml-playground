# eml playground

[`f(x, y) = exp(x) − ln(y)`](https://arxiv.org/abs/2603.21852v2) という単一の二項演算子
（＋定数 `1`）だけで、初等関数（加減乗除、exp、ln、sin、…）をすべて構築できる——という
Odrzywołek 氏の論文 *All elementary functions from a single binary operator* (arXiv:2603.21852v2)
で遊ぶための小さな GitHub Pages アプリです。

## 遊び方

- **評価器**: Lisp 風の S 式 `(f A B)` を入力すると即時に数値を表示します。
- **ギャラリー**: 論文の代表的な導出（`e`, `exp(x)`, `ln(x)`, `id(x)`）をクリックで読み込めます。
- **プロット**: `x` を含む式は自動でグラフが描画され、対応する参照関数（`Math.exp` など）と重ねて比較できます。
- **ツリー**: SVG のツリーをクリックして `1` → `x` → `(f 1 1)` → `1` と循環させながら式を組み立てられます。

構文はとてもシンプルです：

```
expr := '1' | 'x' | '(' 'f' expr expr ')'
```

例:

- `(f 1 1)` = `e`
- `(f x 1)` = `exp(x)`
- `(f 1 (f (f 1 x) 1))` = `ln(x)`

## ローカル開発

```bash
npm install
npm run dev
```

ビルド:

```bash
npm run build
```

## アーキテクチャ

- `src/lib/` — **DOM 非依存** の純粋コア（AST、パーサ、プリンタ、評価器、サンプラ、プリセット）。
  Node.js からもそのまま利用できます。
- `src/ui/` — DOM を触る層。`src/lib/` を呼ぶだけで、ビジネスロジックは持ちません。
- `src/main.ts` — 各パネルを pub/sub で繋ぐエントリ。

## デプロイ

`main` ブランチへ push すると `.github/workflows/deploy.yml` が走り、
GitHub Pages に自動デプロイされます。初回のみ、リポジトリの
**Settings → Pages → Build and deployment → Source** を **GitHub Actions** に
切り替えてください。
