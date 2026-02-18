-- Migration: lincoln スキーマの権限付与
-- PostgREST の各ロールに lincoln スキーマへのアクセスを許可

-- スキーマ USAGE 権限
GRANT USAGE ON SCHEMA lincoln TO anon, authenticated, service_role;

-- テーブル権限
GRANT ALL ON ALL TABLES IN SCHEMA lincoln TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA lincoln TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA lincoln TO anon;

-- 今後作成されるテーブルにもデフォルト権限を適用
ALTER DEFAULT PRIVILEGES IN SCHEMA lincoln
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA lincoln
  GRANT SELECT ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA lincoln
  GRANT SELECT ON TABLES TO anon;

-- シーケンス権限（UUID gen_random_uuid は不要だが念のため）
GRANT USAGE ON ALL SEQUENCES IN SCHEMA lincoln TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA lincoln
  GRANT USAGE ON SEQUENCES TO service_role;
