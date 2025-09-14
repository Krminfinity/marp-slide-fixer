# Marp Slide Fixer

MarpのMarkdownファイルから、はみ出し（overflow）を自動検知し、スライドの自動分割を最優先として修正済みのMarpファイルを出力するCLIツールです。

## 主な特徴

- **分割優先**: はみ出しを検知した場合、まずスライド分割で対応
- **局所的な縮小**: 分割が困難な場合のみ、局所的なスタイル縮小を適用
- **Marp互換**: front-matterやMarp記法を完全に保持
- **自動検知**: Puppeteerを使用してブラウザ上でOverflowを正確に検知

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

## 処理フロー

1. **AST化**: remarkを使用してMarkdownをAST（抽象構文木）に変換
2. **一次ビルド & 検知**: marpでHTML化し、Puppeteerでoverflow検知
3. **自動分割（最優先）**: リスト・段落・見出しを意味的な境界で分割
4. **再ビルド & 再検知**: 分割後の結果を再度検証
5. **局所縮小（分割不能のみ）**: 表・コード・画像等で分割困難な場合の局所的縮小
6. **最終出力**: 修正済みMarkdownファイルの出力

## 分割アルゴリズム

### ヒューリスティクス

- **リスト**: 項目数が10超の場合、中央付近で2分割
- **段落**: 文字数が600超の場合、句読点（。/.）直後の自然な境界で分割
- **見出し**: 直下にブロックが多い場合、セクションを複数スライドに再配分

### 意味単位の保持

- 1つのコードブロック/表/画像は基本的に分割しない
- 数式ブロックは分割せず、前後の段落で分割
- 文の途中での分割は避ける

## 局所縮小戦略

分割が不可能な場合のみ適用：

### 対象別縮小
- **コード**: `pre code{ font-size:.85em; white-space:pre-wrap; }`
- **表**: `table{ table-layout:fixed; width:100%; } th,td{ overflow:hidden; text-overflow:ellipsis; }`
- **画像**: `img{ max-width:100%; height:auto; }`

### 最終手段
- スライド全体のfont-sizeを5%刻みで縮小（下限70%）
- front-matterのstyle:セクションにクラス定義を追加

## 受け入れ基準

- ✅ テキスト中心のスライドは分割のみで80%以上解消
- ✅ 表・コード・画像起因のものは局所縮小で収まる
- ✅ 既存front-matterおよびMarp記法を完全保持
- ✅ 分割箇所・縮小適用の詳細ログ出力

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
