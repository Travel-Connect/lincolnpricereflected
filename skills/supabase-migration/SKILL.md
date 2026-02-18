# supabase-migration

Supabase のマイグレーション作成・適用・検証を Claude Code で行うための Skill。

## トリガーフレーズ例

1. 「テーブルを追加したい」「カラムを追加したい」
2. 「マイグレーションを作って」「migration を書いて」
3. 「DB スキーマを変更したい」
4. 「RLS ポリシーを追加したい」
5. 「シードデータを更新したい」
6. 「マイグレーションを適用して」「db reset して」
7. 「既存テーブルの構造を確認して」

## 入力

- スキーマ変更の意図（テーブル追加・カラム変更・ポリシー追加など）
- 必要に応じて `docs/design.md` §2 のスキーマ定義

## 出力

- `supabase/migrations/` 配下のタイムスタンプ付き SQL ファイル
- 必要に応じて `supabase/seed.sql` の更新
- 適用結果の確認レポート

## 核心ルール

| # | ルール | 詳細 |
|---|--------|------|
| 1 | **ファイル命名規則** | `YYYYMMDDHHMMSS_<description>.sql`。既存のタイムスタンプより未来の値を使用 |
| 2 | **冪等性** | `IF NOT EXISTS`、`ON CONFLICT DO NOTHING`、`CREATE OR REPLACE` を活用し、再実行しても安全にする |
| 3 | **RLS 必須** | 新規テーブルには必ず `ENABLE ROW LEVEL SECURITY` + ポリシーを設定。authenticated=SELECT, service_role=ALL が基本パターン |
| 4 | **updated_at トリガー** | `updated_at` カラムを持つテーブルには `update_updated_at_column()` トリガーを設定 |
| 5 | **FK に CASCADE** | 子テーブルの外部キーには `ON DELETE CASCADE` を付与（設計で明示的に指定がある場合のみ例外） |
| 6 | **UUID 主キー** | 主キーは `UUID PRIMARY KEY DEFAULT gen_random_uuid()` を使用 |
| 7 | **CHECK 制約** | ENUM 的な値は CHECK 制約で制限（PostgreSQL enum 型は使わない） |
| 8 | **インデックス** | FK カラム・頻出検索カラムにはインデックスを作成。命名: `idx_<table>_<column>` |
| 9 | **コメント** | テーブルには `COMMENT ON TABLE` で日本語説明を付与 |
| 10 | **seed は冪等** | `seed.sql` は `ON CONFLICT DO NOTHING` で何度実行しても安全にする |

## ワークフロー

```
1. 変更内容の確認
   └→ docs/design.md §2 のスキーマ定義を参照

2. 既存マイグレーションの確認
   └→ supabase/migrations/ の最新タイムスタンプを確認

3. マイグレーション SQL 作成
   ├→ テーブル/カラム定義
   ├→ インデックス作成
   ├→ トリガー設定 (updated_at がある場合)
   ├→ RLS 有効化 + ポリシー作成
   └→ COMMENT ON TABLE

4. シードデータ更新 (必要な場合)
   └→ supabase/seed.sql に追記

5. ローカル検証
   ├→ npx supabase db reset
   └→ エラーがないことを確認
```

## 既存スキーマ一覧

→ [references/existing-schema.md](references/existing-schema.md)

## マイグレーション テンプレート

→ [references/migration-templates.md](references/migration-templates.md)

## 禁止事項

- PostgreSQL `CREATE TYPE ... AS ENUM` の使用（CHECK 制約を代わりに使う）
- RLS なしのテーブル公開
- `supabase/migrations/` 以外の場所へのマイグレーション作成
- 既存マイグレーションファイルの内容変更（新しいマイグレーションで ALTER する）
- `DROP TABLE` / `DROP COLUMN` の安易な使用（データ損失リスク — 必ず確認を取る）
- `C:\lincolnpricereflected` 外へのファイル作成

## チェックリスト

### 実行前

- [ ] `docs/design.md` でスキーマ定義を確認
- [ ] `supabase/migrations/` の最新タイムスタンプを確認し、それより未来の値を採番
- [ ] 既存テーブルとの FK 関係・依存関係を確認
- [ ] 破壊的変更（DROP, ALTER TYPE 等）がないか確認。ある場合はユーザーに警告

### 実行中

- [ ] `ENABLE ROW LEVEL SECURITY` と最低 2 ポリシー（authenticated SELECT, service_role ALL）を付与
- [ ] `updated_at` があるテーブルにはトリガーを設定
- [ ] インデックスを FK カラムに作成
- [ ] `COMMENT ON TABLE` で日本語説明を付与
- [ ] seed.sql 更新時は `ON CONFLICT DO NOTHING` を使用

### 適用・検証

- [ ] `npx supabase db reset` がエラーなく完了
- [ ] 新規テーブル/カラムが存在することを確認
- [ ] RLS ポリシーが正しく設定されていることを確認
- [ ] seed データが投入されていることを確認

## 参照ドキュメント

- [references/existing-schema.md](references/existing-schema.md) — 現在のテーブル一覧と構造
- [references/migration-templates.md](references/migration-templates.md) — SQL テンプレート集
- `docs/design.md` §2 — DB スキーマ設計
- `docs/requirements.md` §5 — 施設一覧
- `supabase/config.toml` — Supabase ローカル設定
