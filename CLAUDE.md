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

## 主要ディレクトリ

- `apps/web/` — Next.js アプリケーション
- `apps/runner/` — Python Runner
- `config/` — セレクタ等の設定ファイル
- `supabase/` — マイグレーション・シード
- `docs/` — 要件定義書・設計書
- `data/artifacts/` — ジョブ生成物（ローカル）
