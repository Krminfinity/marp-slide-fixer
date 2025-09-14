# Marp Slide Fixer

Marp の Markdown ファイル専用で、はみ出し（overflow）を自動検知し「スライドの自然な分割」を最優先として修正した Markdown を出力する CLI ツールです。プレーン Markdown（Marp front‑matter を持たないもの）は処理対象外です。

## 主な特徴 (Current Capabilities)
- **設定ファイル対応（追加予定 / 一部実装）**: `slide-fixer.config.json` をルートに置くと CLI オプション省略が可能（`--config` で明示指定も可）
## 他リポジトリでの利用ガイド (Integration Quick Start)

### 1. npx で単発実行
```bash
npx marp-slide-fixer --in slides.md --out slides.fixed.md
```

### 2. 開発依存として導入
```bash
npm install --save-dev marp-slide-fixer @marp-team/marp-cli
```
`package.json` にスクリプト:
```jsonc
{
  "scripts": {
    "slides:fix": "slide-fixer --in slides/deck.md --out slides/deck.fixed.md"
  }
}
```

### 3. 設定ファイル (オプション)
プロジェクトルートに `slide-fixer.config.json` を追加:
```json
{
  "maxIter": 3,
  "paragraphMaxChars": 600,
  "listMaxItems": 10,
  "fontStep": 0.95,
  "fontMin": 0.7,
  "logLevel": "info"
}
```
CLI でさらに一時的に上書き可能:
```bash
slide-fixer --in slides/deck.md --out slides/deck.fixed.md --max-iter 5
```

### 4. 複数ファイルをまとめて（簡易スクリプト例）
```bash
node scripts/fix-all-slides.mjs
```
`scripts/fix-all-slides.mjs` 例:
```javascript
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
function walk(dir, acc=[]) { for (const n of readdirSync(dir)) { const p=join(dir,n); const s=statSync(p); if (s.isDirectory()) walk(p,acc); else if (p.endsWith('.md')) acc.push(p);} return acc; }
for (const f of walk('slides')) {
  const src = readFileSync(f,'utf-8');
  if (!/^---[\s\S]*?(marp:\s*true|theme:)/.test(src)) continue;
  const out = f + '.tmp';
  execFileSync('npx',['slide-fixer','--in',f,'--out',out],{stdio:'inherit'});
  const fixed = readFileSync(out,'utf-8');
  if (fixed !== src) { writeFileSync(f,fixed); }
}
```

### 5. pre-commit（最小例）
`.husky/pre-commit`:
```bash
#!/bin/sh
CHANGED=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\\.md$' || true)
[ -z "$CHANGED" ] && exit 0
for f in $CHANGED; do
  if grep -qE '^---' "$f" && grep -qE '^---[\s\S]*?(marp:\s*true|theme:)' "$f"; then
    slide-fixer --in "$f" --out "$f.tmp" --max-iter 1 >/dev/null 2>&1 || continue
    if ! diff -q "$f" "$f.tmp" >/dev/null; then mv "$f.tmp" "$f"; git add "$f"; else rm "$f.tmp"; fi
  fi
done
```

### 6. GitHub Actions（シンプル版）
```yaml
name: Fix Slides
on: { push: { paths: ['slides/**/*.md'] } }
jobs:
  fix:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm install --save-dev marp-slide-fixer @marp-team/marp-cli
      - run: |
          npx slide-fixer --in slides/deck.md --out slides/deck.fixed.md || exit 1
          if ! diff -q slides/deck.md slides/deck.fixed.md; then mv slides/deck.fixed.md slides/deck.md; git config user.name 'slide-bot'; git config user.email 'actions@github.com'; git commit -am 'chore: auto fix'; git push; fi
```

---

- **Marp専用**: 最初の front-matter に `marp: true` もしくは `theme:` が無い場合はエラーで終了
- **分割優先**: はみ出したスライドはまず意味的境界（段落／リスト／ヘッディング）で分割
- **段階的縮小**: 分割不能（表・画像・コード塊等）の場合のみ “局所縮小” を適用し、その次の反復でなお overflow が残るときに初めて “全体縮小” を検討
- **局所縮小対象**: コード / 表 / 画像（テーブル・イメージへのテスト追加済）
- **重複スタイル防止**: 同一 CSS 行を front-matter の `style: |` に二重追加しない
- **自動検知**: Puppeteer + Marp CLI による実寸オーバーフロー解析（E2E はオプション実行）

## インストール

```bash
npm install -g marp-slide-fixer
```

または

```bash
npx marp-slide-fixer --in slides.md --out slides.fixed.md
```

## 使用方法

### 基本使用

```bash
npx slide-fixer --in slides.md --out slides.fixed.md
```

### オプション付き実行

```bash
npx slide-fixer --in slides.md --out slides.fixed.md --max-iter 3 \
  --list-max-items 10 --paragraph-max-chars 600 --font-step 0.95 --font-min 0.7
```

## CLI オプション

| オプション | デフォルト値 | 説明 |
|-----------|-------------|------|
| `--in` | 必須 | 入力Markdownファイルパス |
| `--out` | 必須 | 出力Markdownファイルパス |
| `--max-iter` | 3 | 最大反復回数 |
| `--list-max-items` | 10 | リスト項目の分割しきい値 |
| `--paragraph-max-chars` | 600 | 段落文字数の分割しきい値 |
| `--font-step` | 0.95 | フォント縮小ステップ (95%) |
| `--font-min` | 0.7 | フォント最小サイズ (70%) |

## 処理フロー (Revised Pipeline)

1. **AST化**: remarkを使用してMarkdownをAST（抽象構文木）に変換
2. **一次ビルド & 検知**: marpでHTML化し、Puppeteerでoverflow検知
3. **自動分割（最優先）**: リスト・段落・見出しを意味的な境界で分割
4. **再ビルド & 再検知**: 分割後の結果を再度検証
5. **局所縮小（分割不能のみ）**: 表・コード・画像などを対象（当該イテレーションではグローバル縮小は行わない）
6. **再検知**: 次反復で overflow が継続している場合のみ全体縮小を検討
7. **最終出力**: 修正済み Markdown ファイルの出力

## 分割アルゴリズム

### ヒューリスティクス

- **リスト**: 項目数が10超の場合、中央付近で2分割
- **段落**: 文字数が600超の場合、句読点（。/.）直後の自然な境界で分割
- **見出し**: 直下にブロックが多い場合、セクションを複数スライドに再配分

### 意味単位の保持

- 1つのコードブロック/表/画像は基本的に分割しない
- 数式ブロックは分割せず、前後の段落で分割
- 文の途中での分割は避ける

## 縮小戦略（Scaling Strategy）

分割が不可能な場合のみ段階的に適用：

### 対象別縮小
- **コード**: `pre code{ font-size:.85em; white-space:pre-wrap; }`
- **表**: `table{ table-layout:fixed; width:100%; } th,td{ overflow:hidden; text-overflow:ellipsis; }`
- **画像**: `img{ max-width:100%; height:auto; }`

### 全体縮小（グローバル）
- 局所縮小適用“後”の次反復でまだ overflow が残る場合に計算
- ビューポートとスクロールサイズ比から縮小率を決定し `font-size` を（下限 `font-min`）まで自動調整
- クラス（例: `.slide-scaled-85`）を適用し、対応 CSS を front-matter `style:` に追加（重複は抑止）

## 受け入れ基準 (Acceptance Criteria)

- ✅ Marp front-matter (`marp: true` など) が無い場合は即時エラー
- ✅ テキスト中心スライドは分割のみで解決（縮小統計が少数に留まる）
- ✅ 表・コード・画像起因の overflow は局所縮小でまず対処
- ✅ 局所縮小と同一イテレーションでグローバル縮小を行わない
- ✅ 重複 CSS 行を front-matter に挿入しない
- ✅ 分割・縮小適用のログ出力

## 出力例

```markdown
---
theme: default
size: 16:9
paginate: true
style: |
  .tight-code pre code { font-size: 0.85em; white-space: pre-wrap; }
  .tight-table table { table-layout: fixed; width: 100%; }
---

# 修正済みスライド

内容は分割・縮小が適用されて表示に最適化されています
```

## ライセンス

MIT

## 開発者向け (Tests)

本リポジトリでは Vitest を用いたユニットテスト / モック統合テストを追加しています。

### セットアップ

依存関係インストール:

```bash
npm install
```

### テスト実行

一括実行:

```bash
npm test
```

ウォッチモード:

```bash
npm run test:watch
```

### テスト構成と方針

1. `src/markdown.js` の純粋関数 (`parseMarkdown`, `extractSlides`, `splitSlide` など) をユニットテストで検証
2. `src/pipeline.js` のパイプライン挙動は `analyzeSlideOverflow` を `vi.mock` し、overflowシナリオを人工的に注入してスライド分割と統計更新を検証
3. Puppeteer + Marp CLI を伴う実ブラウザ検知はコストが高いため、デフォルトはモックのみ。条件付き E2E を別スクリプトで提供

### 条件付き E2E テスト

実ブラウザ + Marp CLI を利用した最小 E2E テストをオプション実行できます。

PowerShell / Windows:

```powershell
npm run test:e2e
```

実行条件:
- `@marp-team/marp-cli` が `npx` から解決可能
- ネットワーク/Chrome ダウンロードがブロックされていない
- タイムアウト発生時は `test/e2e.test.js` のタイムアウト値を調整してください

### モック統合テスト概要

`test/pipeline.test.js` 内で `vi.mock('../src/detector.js')` を使用し、特定スライドのみ overflow を返すスタブを提供しています。これにより高速・安定したテストが可能です。

### 今後の拡張案 / Roadmap

- E2Eテスト: 実際に Puppeteer を起動しサンプルMarkdownに対する実測 overflow を検証
- しきい値パラメータのプロパティベーステスト（fast-check等）
- 句読点分割の多言語対応テスト

### Marp固有要素に関する現在のテスト網羅状況

| 項目 | ステータス | 補足 |
|------|------------|------|
| front-matter保持 | ✅ | `markdown.test.js` で保持とstyle追記確認 |
| スライド区切り(---)再構成 | ✅ | スライド抽出→再構成で1つの区切り数を検証 |
| 分割ヒューリスティクス(段落/リスト) | ✅ | 長文/長リストケースで `splitSlide` 分割確認 |
| ローカル縮小(code/table/image) | ✅ | code / table / image すべてテスト済み |
| グローバル縮小 | ✅ | イテレーション段階差異反映（局所直後除外）|
| Puppeteer + Marp CLI 実ブラウザ判定 | ⚠️(opt) | `npm run test:e2e` で条件付き実行（CI デフォルト未実施） |
| styleの多重追加重複制御 | ✅ | 重複挿入防止ロジック導入 |

実ブラウザ判定を含む E2E はコストが高いため、デフォルトはモックテストのみを実行し安定性と速度を優先しています。

---

### 最近の更新履歴 (Changelog Snapshot)
- Marp 専用化: 非 Marp ファイルを拒否
- 局所縮小→次反復でのみグローバル縮小するポリシーへ変更
- table / image 用ローカル縮小テスト追加
- 重複 CSS 挿入防止実装 (`updateFrontmatter`)
- 条件付き E2E テスト (`npm run test:e2e`) 追加
- `.tmp-test/` を利用したテスト用一時ファイル隔離と `.gitignore` 整備


