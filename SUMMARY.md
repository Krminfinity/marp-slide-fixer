## Marp Slide Fixer サマリ

このドキュメントはリポジトリ全体の現状概要・利用方法・内部構成・制約・今後の改善候補を簡潔にまとめたものです。

### 1. 目的
Marp 用 Markdown スライドで発生する表示 overflow を、自動分割と段階的縮小（まず局所、必要時のみ全体）によって最小限の視認性劣化で解消する CLI ツール。Marp front‑matter を持たないプレーン Markdown は対象外。

### 2. 現行利用方法（抜粋）
```bash
# 単発実行
npx marp-slide-fixer --in slides.md --out slides.fixed.md
# あるいはエイリアス
npx slide-fixer --in slides.md --out slides.fixed.md

# devDependency 利用
npm install --save-dev marp-slide-fixer
npx slide-fixer --in deck.md --out deck.fixed.md
```

設定ファイル: ルートの `slide-fixer.config.{json,js,mjs,cjs}` を自動読み込み。CLI 引数が最優先。

### 3. 主な処理フロー
1. remark で AST 化
2. Marp CLI + Puppeteer（必要時）で overflow 検出
3. 分割ヒューリスティクス適用（段落長 / リスト項目数 / セクション複雑度）
4. 再検出 → 分割不能要素（表/コード/画像）の局所縮小 CSS 付与
5. なお溢れる場合、次イテレーションでグローバル縮小（font-size）を検討
6. 重複 CSS 行防止しつつ front‑matter `style:` へ追記

### 4. 分割/縮小ヒューリスティクス
| 対象 | 条件 | 動作 |
|------|------|------|
| 段落 | 文字数 > `paragraphMaxChars` | 句読点近傍で二分割を試行 |
| リスト | 項目数 > `listMaxItems` | 中央付近で二分割 |
| 見出しセクション | 後続複雑度 > しきい指標 | スライド境界挿入 |
| コード/表/画像 | 分割困難 | 局所縮小 CSS を一度だけ挿入 |
| 依然 overflow | 局所縮小適用後の次反復 | グローバル縮小（下限 `fontMin`） |

### 5. 現状の得意/不得意
得意: 日本語 / 英語混在の長段落、項目が多いリスト、単一大きめコード or 表。
不得意: 文境界が乏しい長文、巨大ブロック複数混在、リスト深いネスト、表・コード内部の論理再分割。

### 6. 内部モジュール概要
| ファイル | 役割 |
|----------|------|
| `src/markdown.js` | AST 解析/分割・front-matter 更新 |
| `src/pipeline.js` | 反復制御・分割/縮小適用シーケンス |
| `src/detector.js` | Puppeteer + Marp による overflow 判定（モック可能） |
| `src/config.js` | デフォルト設定値・定数 |
| `src/configLoader.js` | 設定ファイル探索 & CLI オプションマージ |
| `bin/slide-fixer.js` | CLI エントリ（commander） |

### 7. CLI 主なオプション
| オプション | 意味 | 既定 |
|------------|------|------|
| `--in` | 入力 Markdown | (必須) |
| `--out` | 出力 Markdown | (必須) |
| `--max-iter` | 最大反復数 | 3 |
| `--list-max-items` | リスト分割しきい値 | 10 |
| `--paragraph-max-chars` | 段落分割しきい値 | 600 |
| `--font-step` | 縮小ステップ | 0.95 |
| `--font-min` | 全体縮小下限 | 0.7 |
| `--log-level` | ログ出力レベル | info |
| `--config` | 設定ファイルパス | 自動検出 |

### 8. GitHub Action 利用例
```yaml
jobs:
  fix:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: <owner>/<repo>/.github/actions/slide-fixer@v1
        with:
          path: slides/deck.md
          install-marp-cli: true
```

### 9. pre-commit サンプル
`hooks/pre-commit.slide-fixer.sample` を `.git/hooks/pre-commit` へコピーし実行権限付与。

### 10. テスト戦略
速い層: ヒューリスティクス & AST 操作（Vitest） / 実行コスト高層: 条件付き E2E (`VITEST_E2E=1`).
overflow 判定はモックで再現しつつ、必要に応じ実ブラウザで検証可能。

### 11. 制約 / 既知の非対応
| 項目 | 説明 |
|------|------|
| 文意味解析 | 形態素/構文解析なし（句読点中心） |
| コード/表細分割 | 行・セル単位の再配分なし |
| ネストリスト最適化 | 親子構造維持した再配分なし |
| 多言語細粒度句読点 | 中華圏/その他記号の網羅なし |
| ルビ考慮 | 現状は直接シミュレーション未実装（将来拡張余地） |

### 12. 改善ロードマップ（候補）
1. 文字クラス重み付け / CJK 比率による動的しきい値
2. 文末候補スコアリングによる分割点最適化
3. Ruby 仮注入シミュレーションオプション
4. リスト再配分アルゴリズム強化（グルーピング）
5. JSON レポート出力 (`--report-json`) と CI メトリクス
6. 行数予測 + 発表時間推定モデル
7. 表/コードの論理的チャンク分割（関数・行塊 / 行グループ）

### 13. 品質指標（将来計測予定）
- 分割後 overflow 残存率
- スライド間文字数標準偏差
- グローバル縮小適用率
- 平均処理時間 / ファイル

### 14. 初期導入推奨フロー
1. 既存スライドを Git 管理下でバックアップ
2. npx で単発実行し diff 確認
3. pre-commit or CI Action を導入し自動化
4. 必要なら `paragraphMaxChars` / `listMaxItems` を調整
5. 将来のルビ対応を見越し、やや余裕あるしきい値設定にする

### 15. ライセンス
MIT

---
最終更新: 現行公開バージョン 1.0.0 時点