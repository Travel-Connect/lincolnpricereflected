# Lincoln Price Reflected

リンカーン（宿泊施設管理システム）への料金ランク自動反映ツール。

## プロジェクト概要

- **目的**: Excel の日別ランクをリンカーンへ反映し、出力 Excel と突合して成否を判定
- **アーキテクチャ**: Next.js (Vercel) + Supabase + Runner (Python/Playwright headful on Windows)
- **ドキュメント**: `docs/requirements.md`, `docs/design.md`

## 制約

- 成果物はすべて `C:\lincolnpricereflected` 配下に作成すること
- ログ、スクショ、生成 CSV 等の一時ファイルも含む

## 技術スタック

- **Web**: Next.js (App Router), Vercel
- **DB/Storage**: Supabase (PostgreSQL, Storage, Realtime)
- **Runner**: TypeScript + Playwright (headful)
- **セレクタ**: `config/selectors.json` に集約（コード中の直書き禁止）

## Supabase 設定

- **プロジェクト**: `wupufaekvxchpltyvzim` (OTAlogin と共有)
- **スキーマ**: `lincoln`（OTAlogin の `public` と分離）
- **Supabase クライアント**: `db: { schema: "lincoln" }` を必ず指定すること
- **Storage バケット**: `lincoln-excel-uploads`, `lincoln-artifacts`（`lincoln-` プレフィックスで区別）
- **config.toml**: `schemas` と `extra_search_path` に `lincoln` を含めること
- **権限**: `lincoln` スキーマには `anon`, `authenticated`, `service_role` への GRANT が必要（migration 005）
- **注意**: `supabase config push` は Auth 設定も上書きするため、OTAlogin の Auth に影響しないか確認してから実行すること
- **マイグレーション**: OTAlogin の既存マイグレーション (00001〜00004, 20260204*) は `reverted` 済み

## 安全ルール

- **STEPB（5050 料金ランク一括設定）のプラングループセット**: テスト時は必ず「カレンダーテスト」のみを対象にすること
  - 「〇単泊カレンダー」「□連泊カレンダー」等の本番プラングループセットには**絶対に送信しないこと**
  - 本番プラングループセットへの送信はユーザーが明示的に指示した場合のみ許可

## 主要ディレクトリ

- `apps/web/` — Next.js アプリケーション
- `apps/runner/` — TypeScript Runner (Playwright)
- `config/` — セレクタ等の設定ファイル
- `supabase/` — マイグレーション・シード
- `docs/` — 要件定義書・設計書
- `data/artifacts/` — ジョブ生成物（ローカル）
- `scripts/` — デモ・キャプチャ用スクリプト

## 実装上の注意点（躓きポイント）

### SheetJS (xlsx) の ESM インポート
- `import XLSX from "xlsx"` を使うこと（デフォルトインポート）
- `import * as XLSX from "xlsx"` だと `XLSX.readFile is not a function` になる
- SheetJS の ESM ビルドは `readFile` 等をデフォルトエクスポートにのみ配置するため

### Playwright ダイアログ処理
- Lincoln の `doUpdate()` / `doSend()` は `window.confirm()` を使う
- Playwright はデフォルトでダイアログを自動 dismiss → **保存が無言で失敗する**
- 必ず `page.on('dialog', d => d.accept())` を事前に登録すること
- 対象: STEP0 (6800 登録), STEPB (5050 送信)

### STEP0: defaultInputPriceRankCd を更新してはいけない
- Lincoln の `doUpdate()` は `inputPriceRankCd` と `defaultInputPriceRankCd` を比較して変更検知する
- 両方を同じ値にすると「変更なし」と判定され、保存が無言で失敗する
- `updateCalendarCells()` では `inputPriceRankCd` のみ更新し、`defaultInputPriceRankCd` は元の値のまま残すこと

### 施設切替の二重ログインエラー
- 施設切替（`Ascsc1010SwitchAction.do`）は初回で MASC1042 エラーになるのが正常
- リトライ（再度選択）で強制切替が成功する — これが想定フロー

### STEPC プラングループ設定
- STEPB は「プラングループセット」（例: カレンダーテスト）に送信する
- STEPC は「個別プラン」（例: 和室コンド / カレンダーテスト）を出力する
- `outputPlans` は `{value: "roomTypeId,planGroupId", label: "表示名"}` 形式
- テスト時は STEPB で送信したプラングループセットに含まれるプランのみを STEPC で出力すること

### STEPC 部屋タイプマッピング
- 出力 xlsx の部屋タイプ名（例: "和室コンド ～5名仕様～"）は入力 Excel と異なる
- `RoomTypeMapping` で変換: `{"和室コンド ～5名仕様～": "和室コンド5名"}`
- 宿泊タイプ（単泊/連泊）はプラン名のキーワードから判定
- 施設ごとにマッピングが必要 — 現在は畳の宿那覇壺屋のみ `DEFAULT_ROOM_TYPE_MAPPING` あり

### Supabase 1000行制限
- Supabase のデフォルト max_rows は 1000
- 1000行を超えるデータ取得には `.range()` によるページネーションが必要
- `loadExpectedRanks()` で使用
