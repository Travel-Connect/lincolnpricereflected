# マイグレーション SQL テンプレート

## 新規テーブル作成

```sql
-- Migration: <テーブル名の説明>
-- Reference: docs/design.md §X

-- ============================================================
-- <table_name> (<日本語説明>)
-- ============================================================
CREATE TABLE <table_name> (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- カラム定義 ...
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_<table>_<column> ON <table_name> (<column>);

-- updated_at トリガー (updated_at カラムがある場合)
CREATE TRIGGER set_<table_name>_updated_at
  BEFORE UPDATE ON <table_name>
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE <table_name> IS '<日本語テーブル説明>';

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read <table_name>"
  ON <table_name> FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_role all <table_name>"
  ON <table_name> FOR ALL TO service_role USING (true) WITH CHECK (true);
```

## カラム追加

```sql
-- Migration: <table_name> に <column> を追加
-- Reference: docs/design.md §X

ALTER TABLE <table_name>
  ADD COLUMN <column_name> <type> <constraints>;

-- インデックスが必要な場合
CREATE INDEX idx_<table>_<column> ON <table_name> (<column_name>);

-- COMMENT 更新が必要な場合
COMMENT ON COLUMN <table_name>.<column_name> IS '<説明>';
```

## CHECK 制約の追加/変更

```sql
-- 既存の CHECK 制約を削除してから再作成
ALTER TABLE <table_name>
  DROP CONSTRAINT IF EXISTS <constraint_name>;

ALTER TABLE <table_name>
  ADD CONSTRAINT <constraint_name>
  CHECK (<column> IN ('VALUE1', 'VALUE2', 'VALUE3'));
```

## 外部キー付きテーブル

```sql
CREATE TABLE <child_table> (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   UUID        NOT NULL REFERENCES <parent_table>(id) ON DELETE CASCADE,
  -- ...
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_<child_table>_parent_id ON <child_table> (parent_id);
```

## Storage バケット追加

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('<bucket-name>', '<bucket-name>', false);

-- RLS ポリシー
CREATE POLICY "authenticated upload <bucket>"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = '<bucket-name>');

CREATE POLICY "authenticated read <bucket>"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = '<bucket-name>');

CREATE POLICY "service_role all <bucket>"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = '<bucket-name>');
```

## シードデータ追加

```sql
-- ON CONFLICT で冪等に
INSERT INTO <table_name> (col1, col2) VALUES
  ('val1', 'val2'),
  ('val3', 'val4')
ON CONFLICT (<unique_column>) DO NOTHING;
```

## タイムスタンプ採番ルール

形式: `YYYYMMDDHHMMSS_<description>.sql`

- 既存の最新タイムスタンプを確認
- それより未来の値を使用
- 同日の場合は HHMMSS 部分をインクリメント

例:
```
20260218000001_facilities.sql     ← 既存
20260218000002_jobs.sql           ← 既存
20260218000003_plans.sql          ← 既存
20260218000004_storage.sql        ← 既存
20260218000005_add_xxx.sql        ← 新規 (次に作る場合)
```

## ローカル検証コマンド

```bash
# マイグレーション + シード適用（ローカル DB リセット）
npx supabase db reset

# ローカル Supabase 起動（未起動の場合）
npx supabase start

# マイグレーションの差分確認
npx supabase db diff
```
