# lincoln-playwright-runbook

Lincoln（TL-Lincoln）ブラウザ自動化の**運用手順・儀式を固定する** Skill。

## トリガーフレーズ例

1. 「リンカーンの自動操作を実装して」
2. 「Playwright で Lincoln にログインしたい」
3. 「処理B のコピー手順を確認して」
4. 「セレクタが壊れた、どう対処する？」
5. 「2FA の入力待ちはどう実装する？」
6. 「失敗時の artifacts はどう保存する？」
7. 「処理C の 3ヶ月制約を教えて」

## 入力

- 実行対象のジョブ情報（施設 ID、対象期間、ランクマトリクス）
- `config/selectors.json` のセレクタ定義

## 出力

- Lincoln 上での操作完了（ステップごとの成否）
- artifacts（スクショ / HTML / ネットワークログ）— `data/artifacts/` に保存

## 核心ルール

| # | ルール |
|---|--------|
| 1 | Playwright は **Windows headful** 前提（ヘッドレス不可: 2FA 対応のため） |
| 2 | **セレクタは `config/selectors.json` から読む**。コード直書き禁止 |
| 3 | TBD セレクタは `SelectorTBDError` で安全に停止 |
| 4 | 2FA 検知時: `awaiting_user` 状態でユーザー入力を待ち → 入力完了後に継続 |
| 5 | 失敗時は artifacts（スクショ / HTML / ネットワークログ）を自動保存 |
| 6 | リトライ N 回（デフォルト 3）→ 超過で停止 |
| 7 | 施設 ID 一致チェック（`dl.g_header_id dd`）は処理 A で必須 |
| 8 | 処理 0 は既存リポジトリの DOM 更新ロジックを `page.evaluate` で注入 |
| 9 | 処理 C の 3ヶ月制約は分割出力で対応 |

## 処理フロー概要

```
ログイン → [2FA 待ち] → 施設切替 → 処理0 → 処理A → 処理B → 処理C → 完了
```

| 処理 | 画面 | 概要 |
|------|------|------|
| 処理0 | カレンダー詳細 | page.evaluate で DOM 更新 → 保存 |
| 処理A | 6800 detail | 施設 ID 一致チェック（安全弁） |
| 処理B | 5050 | コピー → 送信継続を繰り返し |
| 処理C | 5070 | 出力 → Excel と突合検証（完全一致判定） |

## 禁止事項

- `C:\lincolnpricereflected` 外への成果物・一時ファイル作成
- `config/selectors.json` 以外の場所でのセレクタ定義
- ヘッドレスモードでの本番実行
- 施設 ID チェックのスキップ
- 検証不一致を無視した続行

## チェックリスト

### 実行前

- [ ] `config/selectors.json` に使用するセレクタが定義済み（TBD でないこと）
- [ ] 環境変数 `LINCOLN_LOGIN_ID`, `LINCOLN_LOGIN_PW` が設定済み
- [ ] `PLAYWRIGHT_HEADLESS=false` であること
- [ ] 対象施設 ID が正しいこと

### 実行中

- [ ] 2FA 画面が出たらユーザー入力を待機
- [ ] 各ステップ完了ごとに `last_completed_step` を更新
- [ ] 操作失敗時はスクショを自動保存

### 失敗時

- [ ] artifacts（スクショ / HTML / ネットワークログ）が保存されたか確認
- [ ] エラー種別を特定（→ [troubleshooting.md](references/troubleshooting.md)）
- [ ] リトライ回数の上限に達していないか確認
- [ ] resume で続きから再開可能か確認

## 参照ドキュメント

- [references/lincoln-pages.md](references/lincoln-pages.md) — 画面ごとの遷移・目的・成功条件
- [references/selectors.md](references/selectors.md) — 既知セレクタ一覧 + TBD の埋め方
- [references/troubleshooting.md](references/troubleshooting.md) — よくある失敗と対処
- `config/selectors.json` — セレクタ定義（実体）
- `docs/selectors_catalog.md` — セレクタ棚卸し（ステータス管理）
