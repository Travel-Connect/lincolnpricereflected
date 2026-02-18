# 実装 WBS — Lincoln Price Reflected

## 1. PR分割方針

- 各PRは1つの責務（機能単位 or レイヤー単位）に限定
- 同一ファイルを複数PRで同時編集しない
- 依存関係に沿って順番にマージ
- 各PRにはテスト or 動作確認手順を含める

---

## 2. フェーズ概要

```
Phase 0: プロジェクト基盤
Phase 1: データ層（Supabase）
Phase 2: Excel パーサ
Phase 3: Runner 基盤（認証・共通機能）
Phase 4: フロントエンド基盤
Phase 5: 処理C（出力→検証）← 検証から先に作る
Phase 6: 処理B（一括コピー）
Phase 7: 処理A（施設IDチェック）
Phase 8: 処理0（カレンダーDOM更新）
Phase 9: E2E結合・最終検証
```

> **設計判断**: 処理Cを先に実装する理由 — 検証機能があれば、処理B/A/0の実装中に結果を即座に確認できる。

---

## 3. 詳細WBS

### Phase 0: プロジェクト基盤

| # | PR | タイトル | 担当 | 成果物 | 依存 |
|---|-----|---------|------|--------|------|
| 0-1 | PR#1 | monorepo 初期セットアップ | lead | package.json (workspaces), turbo.json, .gitignore, .env.example | なし |
| 0-2 | PR#2 | docs + config 初版 | lead | docs/*, config/selectors.json | なし |
| 0-3 | PR#3 | apps/web Next.js 初期化 | frontend | apps/web/ (create-next-app) | 0-1 |
| 0-4 | PR#4 | apps/runner 初期化 | automation | apps/runner/ (package.json, tsconfig, playwright.config) | 0-1 |

### Phase 1: データ層（Supabase）

| # | PR | タイトル | 担当 | 成果物 | 依存 |
|---|-----|---------|------|--------|------|
| 1-1 | PR#5 | Supabase マイグレーション: facilities + aliases | backend | supabase/migrations/001_facilities.sql | 0-1 |
| 1-2 | PR#6 | Supabase マイグレーション: jobs + job_steps + artifacts | backend | supabase/migrations/002_jobs.sql | 1-1 |
| 1-3 | PR#7 | 施設マスタ seed データ | backend | supabase/seed.sql (9施設 + aliases) | 1-1 |
| 1-4 | PR#8 | Supabase Storage バケット設定 | backend | supabase/migrations/003_storage.sql | 1-2 |
| 1-5 | PR#9 | Supabase クライアント共通ライブラリ | backend | apps/web/src/lib/supabase.ts, 型定義 | 1-2 |

### Phase 2: Excel パーサ

| # | PR | タイトル | 担当 | 成果物 | 依存 |
|---|-----|---------|------|--------|------|
| 2-1 | PR#10 | Python Excel パーサ (uv) | data | apps/runner/src/parsers/parse_excel.py, pyproject.toml | 0-4 |
| 2-2 | PR#11 | TS ラッパー + RankMatrix 型 | data | apps/runner/src/parsers/excel-reader.ts, rank-matrix.ts | 2-1 |
| 2-3 | PR#12 | 施設名抽出・照合ロジック | data | apps/runner/src/parsers/facility-matcher.ts | 2-2, 1-5 |
| 2-4 | PR#13 | Excel パーサ ユニットテスト | data | apps/runner/src/parsers/__tests__/ | 2-2 |

### Phase 3: Runner 基盤（認証・共通機能）

| # | PR | タイトル | 担当 | 成果物 | 依存 |
|---|-----|---------|------|--------|------|
| 3-1 | PR#14 | セレクタローダ + TBDガード | automation | apps/runner/src/selectors.ts | 0-4, 0-2 |
| 3-2 | PR#15 | リトライユーティリティ | automation | apps/runner/src/retry.ts | 0-4 |
| 3-3 | PR#16 | artifacts 保存ユーティリティ | automation | apps/runner/src/artifacts.ts | 0-4, 1-4 |
| 3-4 | PR#17 | ジョブ状態管理 (resume) | automation | apps/runner/src/job-state.ts | 0-4, 1-5 |
| 3-5 | PR#18 | Lincoln ログイン | automation | apps/runner/src/auth/login.ts | 3-1 |
| 3-6 | PR#19 | 2FA 検知・待機 | automation | apps/runner/src/auth/two-factor.ts | 3-5 |
| 3-7 | PR#20 | 施設切替 | automation | apps/runner/src/auth/facility-switch.ts | 3-5 |
| 3-8 | PR#21 | Runner メインエントリポイント + CLI | automation | apps/runner/src/main.ts | 3-1〜3-7 |

### Phase 4: フロントエンド基盤

| # | PR | タイトル | 担当 | 成果物 | 依存 |
|---|-----|---------|------|--------|------|
| 4-1 | PR#22 | レイアウト + ダッシュボード | frontend | apps/web/src/app/layout.tsx, page.tsx | 0-3, 1-5 |
| 4-2 | PR#23 | Excel アップロード画面 | frontend | apps/web/src/app/upload/ | 4-1, 1-4 |
| 4-3 | PR#24 | 施設選択 + A/B紐づけ UI | frontend | apps/web/src/app/upload/ (拡張) | 4-2, 1-5 |
| 4-4 | PR#25 | サマリ表示 + 実行確認ダイアログ | frontend | apps/web/src/components/summary-dialog.tsx | 4-3 |
| 4-5 | PR#26 | ジョブ一覧画面 | frontend | apps/web/src/app/jobs/ | 4-1, 1-5 |
| 4-6 | PR#27 | ジョブ詳細画面（ステップ進捗・ログ） | frontend | apps/web/src/app/jobs/[id]/ | 4-5 |
| 4-7 | PR#28 | Runner 起動 API Route | frontend | apps/web/src/app/api/jobs/start/route.ts | 4-4, 3-8 |

### Phase 5: 処理C（出力→検証）

| # | PR | タイトル | 担当 | 成果物 | 依存 |
|---|-----|---------|------|--------|------|
| 5-1 | PR#29 | 処理C: 5070 画面遷移 + 期間設定 | automation | apps/runner/src/steps/stepC-verify-output.ts (前半) | 3-8 |
| 5-2 | PR#30 | 処理C: プラングループ選択 + 出力 | automation | apps/runner/src/steps/stepC-verify-output.ts (後半) | 5-1 |
| 5-3 | PR#31 | 処理C: 突合検証ロジック | data | apps/runner/src/steps/stepC-verification.ts | 5-2, 2-2 |
| 5-4 | PR#32 | 処理C: 3ヶ月分割出力対応 | automation | apps/runner/src/steps/stepC-verify-output.ts (拡張) | 5-3 |

### Phase 6: 処理B（一括コピー）

| # | PR | タイトル | 担当 | 成果物 | 依存 |
|---|-----|---------|------|--------|------|
| 6-1 | PR#33 | 処理B: 5050 画面遷移 + コピー実行 | automation | apps/runner/src/steps/stepB-bulk-copy.ts | 3-8 |
| 6-2 | PR#34 | 処理B: 送信継続ループ | automation | apps/runner/src/steps/stepB-bulk-copy.ts (拡張) | 6-1 |

### Phase 7: 処理A（施設IDチェック）

| # | PR | タイトル | 担当 | 成果物 | 依存 |
|---|-----|---------|------|--------|------|
| 7-1 | PR#35 | 処理A: 6800 detail 施設ID取得・検証 | automation | apps/runner/src/steps/stepA-facility-check.ts | 3-8 |

### Phase 8: 処理0（カレンダーDOM更新）

| # | PR | タイトル | 担当 | 成果物 | 依存 |
|---|-----|---------|------|--------|------|
| 8-1 | PR#36 | 処理0: lincoln リポジトリ DOM ロジック移植 | automation | apps/runner/src/steps/step0-calendar-import.ts | 3-8 |
| 8-2 | PR#37 | 処理0: page.evaluate 注入 + 実行 | automation | apps/runner/src/steps/step0-calendar-import.ts (拡張) | 8-1 |
| 8-3 | PR#38 | 処理0: 保存/送信ボタン実行 | automation | apps/runner/src/steps/step0-calendar-import.ts (拡張) | 8-2 |

> **Note**: PR#38 は `step0.saveButton` セレクタが TBD のため、セレクタ取得後に着手。

### Phase 9: E2E結合・最終検証

| # | PR | タイトル | 担当 | 成果物 | 依存 |
|---|-----|---------|------|--------|------|
| 9-1 | PR#39 | E2E パイプライン結合 (全ステップ通し実行) | lead + automation | apps/runner/src/main.ts (統合テスト) | 5-4, 6-2, 7-1, 8-3 |
| 9-2 | PR#40 | ジョブ resume テスト | automation | テストケース + ドキュメント | 9-1 |
| 9-3 | PR#41 | 本番運用ドキュメント | lead | docs/operation-guide.md | 9-1 |

---

## 4. 担当者別ビュー

### lead（仕様統合・レビュー）
- PR#1, PR#2, PR#39, PR#41
- 全PRのレビュー

### automation-engineer（Playwright runner）
- PR#4, PR#14〜PR#21, PR#29〜PR#30, PR#32〜PR#38, PR#40

### data-engineer（Excel パーサ・検証）
- PR#10〜PR#13, PR#31

### backend-platform（Supabase）
- PR#5〜PR#9

### frontend-engineer（Next.js UI）
- PR#3, PR#22〜PR#28

---

## 5. 依存関係グラフ（簡略）

```
PR#1 (monorepo)
 ├── PR#2 (docs)
 ├── PR#3 (web init) ──→ PR#22〜PR#28
 ├── PR#4 (runner init)
 │    ├── PR#10〜PR#13 (parser)
 │    └── PR#14〜PR#21 (runner基盤)
 │         ├── PR#29〜PR#32 (処理C)
 │         ├── PR#33〜PR#34 (処理B)
 │         ├── PR#35 (処理A)
 │         └── PR#36〜PR#38 (処理0)
 └── PR#5〜PR#9 (supabase)

全処理 ──→ PR#39 (E2E) ──→ PR#40, PR#41
```

---

## 6. TBD ブロッカー

以下の TBD が解決するまで、該当 PR は着手不可（ガード実装は先行可能）。
TBD セレクタの詳細は `docs/selectors_catalog.md` を参照。

### 6.1 認証・施設切替（6件）

| TBD | ブロックするPR | 回避策 |
|-----|---------------|--------|
| auth.loginIdInput | PR#18 | ガード付きスタブで先にPR作成 |
| auth.loginPwInput | PR#18 | 同上 |
| auth.loginButton | PR#18 | 同上 |
| auth.twoFactorInput | PR#19 | ガード付きスタブで先にPR作成 |
| auth.twoFactorSubmit | PR#19 | 同上 |
| facilitySwitch.* (4項目) | PR#20 | ガード付きスタブで先にPR作成、セレクタ取得後に差し替え |

### 6.2 処理0（1件）

| TBD | ブロックするPR | 回避策 |
|-----|---------------|--------|
| step0.calendarNameInput | PR#37 | ガード付きスタブ |
| step0.saveButton | PR#38 | PR#36, PR#37 までは先行可能 |

### 6.3 処理B（1件）

| TBD | ブロックするPR | 回避策 |
|-----|---------------|--------|
| stepB.autoCompleteInput | PR#33 | ガード付きスタブ、autocomplete リストは取得可能 |

### 6.4 処理C（3件）

| TBD | ブロックするPR | 回避策 |
|-----|---------------|--------|
| stepC.rankOnlyToggle | PR#30 | ガード付きで出力時にスキップする分岐を実装 |
| stepC.planGroupList | PR#30 | ガード付きスタブ |
| stepC.planGroupConfirm | PR#30 | ガード付きスタブ |

> **合計 12 件** の TBD セレクタが残存（`config/selectors.json` 内の `"TBD"` 値）。
> Lincoln 実画面へのアクセス取得後に、優先的に解消すること。

---

## 7. マイルストーン

| マイルストーン | 完了条件 | 含むPR |
|--------------|---------|--------|
| M0: 基盤完了 | monorepo + Supabase + 初期化完了 | PR#1〜PR#9 |
| M1: パーサ完了 | Excel → RankMatrix 変換が動作 | PR#10〜PR#13 |
| M2: Runner基盤完了 | ログイン→施設切替→ジョブ管理が動作 | PR#14〜PR#21 |
| M3: 検証パス（処理C単体） | 5070出力→突合が動作 | PR#29〜PR#32 |
| M4: 反映パス（処理B+A） | コピー→送信→施設IDチェックが動作 | PR#33〜PR#35 |
| M5: 全パイプライン | 処理0→A→B→C 通し実行で SUCCESS | PR#36〜PR#39 |
| M6: 運用開始 | ドキュメント完備、resume テスト合格 | PR#40〜PR#41 |

---

## 8. 実装順序の推奨（並行作業）

Phase 0〜1 完了後、以下を並行して進められる:

```
[automation-engineer] Phase 3 (Runner基盤) ──→ Phase 5 (処理C) ──→ Phase 6〜8
[data-engineer]       Phase 2 (パーサ)     ──→ Phase 5-3 (突合ロジック)
[backend-platform]    Phase 1 (Supabase)   ──→ (完了後フロントエンド支援)
[frontend-engineer]   Phase 4 (UI)         ──→ (Phase 5以降は結合待ち)
```
