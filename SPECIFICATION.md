# Marp Slide Fixer - 技術仕様書

## 1. 概要

### 1.1 目的
MarpのMarkdownファイル（slides.md）から、はみ出し（overflow）を自動検知し、スライドの自動分割を最優先、分割が難しい場合のみ局所的な縮小を適用して、**修正済みのMarpファイル（slides.fixed.md）**を出力するCLIツール。

### 1.2 要件
- **入力**: `--in slides.md`（Marp互換のMarkdown）
- **出力**: `--out slides.fixed.md`（Marp互換のMarkdown、front-matter・スライド区切り---維持）
- **方針**: 分割優先 → 分割不能のみ縮小（局所・最小限）
- **保持**: 既存のfront-matter（theme, size, paginate, style など）

## 2. 処理フロー

### 2.1 AST化（remark）
- `slides.md` を `remark-parse` でASTに変換
- スライド区切りは `thematicBreak`（---）
- スライド単位（ASTノード列）で処理

### 2.2 一次ビルド & 検知（Puppeteer）
- 一時的にHTML化（`marp --html` で `tmp.html` 生成）
- Puppeteerで各 `<section>` をレンダリング
- `scrollHeight>clientHeight` または `scrollWidth>clientWidth` をはみ出しと判定

### 2.3 自動分割（最優先）

#### 分割単位
- リスト（li）
- 段落（paragraph）  
- 見出し（heading）

#### ヒューリスティクス（デフォルト値、CLI/設定で上書き可）
- **リスト項目数** が 10超 → 中央付近で2分割
- **段落文字数** が 600超 → 。 or . 直後など自然な境界で分割
- **見出し直下** にブロックが多い場合 → セクションを複数スライドに再配分

#### 制約
- 意味単位は壊さない（1つのコードブロック/表/画像は基本分割しない）
- 分割後、AST→Markdown に戻し、`---` を適切に挿入

### 2.4 再ビルド & 再検知
- 分割後Markdownを再度 `marp --html` → 検知
- 修正されたスライドは確定
- まだ溢れるスライドのみ次工程へ

### 2.5 局所縮小（分割不能のみ）

#### 適用条件
原因が表・コード・単一大画像などで分割不可のケースに限定

#### 局所スタイル適用
front-matterの`style:`へクラス定義 or 対象ノードに `_class` で適用：

```css
/* コード */
pre code{ font-size:.85em; white-space:pre-wrap; }

/* 表 */
table{ table-layout:fixed; width:100%; } 
th,td{ overflow:hidden; text-overflow:ellipsis; }

/* 画像 */
img{ max-width:100%; height:auto; }
```

#### 最終手段
- それでも溢れる場合のみ、該当スライドに限り `font-size` を5%刻みで縮小（下限70%）
- 縮小適用後に再ビルド→再検知
- 最大反復回数 `--max-iter`（例：3）

### 2.6 最終出力
- 完了したMarkdownを `slides.fixed.md` に保存
- front-matter・既存設定は維持
- PDFやPNGの出力は不要（本ツールはMarkdownの修正出力のみ）

## 3. CLI仕様

### 3.1 基本形式
```bash
npx slide-fixer --in slides.md --out slides.fixed.md --max-iter 3 \
  --list-max-items 10 --paragraph-max-chars 600 --font-step 0.95 --font-min 0.7
```

### 3.2 オプション一覧

| オプション | 型 | デフォルト | 説明 |
|-----------|---|----------|------|
| `--in` | string | 必須 | 入力Markdownファイルパス |
| `--out` | string | 必須 | 出力Markdownファイルパス |
| `--max-iter` | number | 3 | 最大反復回数 |
| `--list-max-items` | number | 10 | リスト項目分割しきい値 |
| `--paragraph-max-chars` | number | 600 | 段落文字数分割しきい値 |
| `--font-step` | number | 0.95 | フォント縮小ステップ |
| `--font-min` | number | 0.7 | フォント最小サイズ |

## 4. 実装詳細

### 4.1 言語・ライブラリ
- **言語**: Node.js（ESM）
- **主要ライブラリ**: 
  - `remark-parse`, `remark-stringify`
  - `puppeteer`
  - `child_process`（marp CLI実行）

### 4.2 モジュール構成

```
bin/
  slide-fixer.js      # CLIエントリ
src/
  markdown.js         # AST入出力・分割ロジック
  detector.js         # Puppeteerではみ出し検知
  pipeline.js         # 全体制御・反復
  config.js          # デフォルト設定
package.json          # type:"module"、bin登録
```

### 4.3 分割アルゴリズム

#### `estimateComplexity(slideAst)`
テキスト長、li個数、表/コード比率などでスコア化

#### `splitSlide(slideAst, config)`
上記ヒューリスティクス順で自然な境界を探索し分割

#### 句読点ベース分割
文末記号（。/./!/?）直後を優先

#### 縮小適用
当該スライドのみに限定（ASTに `_class: tight` などを付与 → front-matterの`style:`でクラスにスコープ）

## 5. 受け入れ基準

- ✅ 入力`slides.md`に対し手動編集なしで`slides.fixed.md`を生成
- ✅ テキスト中心のスライドは分割のみで80%以上解消
- ✅ 表・コード・画像起因のものは局所縮小のみで収まる（全体縮小は行わない）
- ✅ 既存front-matterおよびMarp記法は保持
- ✅ ログに、分割箇所・縮小適用の有無/率・反復回数を記録

## 6. 想定外ケースの扱い

### 6.1 数式ブロック
- 数式ブロックは分割しない（前後で段落分割）

### 6.2 単一巨大要素
- 単一巨大要素のみのスライドは、要素を物理分割できる場合のみ分割
  - 表なら列分割
  - コードなら関数単位など
- 不可能なら局所縮小→最終的に70%でも収まらない場合はスライド追加＋要素の論理分割を試みる

## 7. ログ出力仕様

### 7.1 分割ログ
```
[INFO] Slide 3: Split paragraph at sentence boundary (600 chars → 350+250 chars)
[INFO] Slide 5: Split list (12 items → 6+6 items)
```

### 7.2 縮小ログ
```
[WARN] Slide 7: Applied local scaling to code block (font-size: 0.85em)
[WARN] Slide 9: Applied slide-wide scaling (font-size: 0.90em)
```

### 7.3 完了ログ
```
[INFO] Processing completed:
  - Total slides processed: 12
  - Slides split: 3
  - Slides with local scaling: 2
  - Slides with global scaling: 1
  - Iterations: 2/3
```

## 8. パフォーマンス考慮

### 8.1 最適化
- ASTの部分的な変更のみ適用
- Puppeteerインスタンスの再利用
- 不要な中間ファイルの削除

### 8.2 制限
- 最大ファイルサイズ: 10MB
- 最大スライド数: 500
- 最大反復回数の制限でハングアップ防止

---

**最終更新**: 2025年9月14日
