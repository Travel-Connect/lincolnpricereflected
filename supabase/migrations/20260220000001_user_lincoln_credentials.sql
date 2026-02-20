-- Migration: user_lincoln_credentials テーブル
-- ユーザーごとの Lincoln ログイン情報を管理

CREATE TABLE lincoln.user_lincoln_credentials (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lincoln_login_id    TEXT        NOT NULL,
  lincoln_login_pw    TEXT        NOT NULL,
  default_facility_id UUID        REFERENCES lincoln.facilities(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE TRIGGER set_user_lincoln_credentials_updated_at
  BEFORE UPDATE ON lincoln.user_lincoln_credentials
  FOR EACH ROW
  EXECUTE FUNCTION lincoln.update_updated_at_column();

COMMENT ON TABLE lincoln.user_lincoln_credentials IS 'ユーザー別 Lincoln ログイン情報';

-- RLS: ユーザーは自分のレコードのみ読み書き可能
ALTER TABLE lincoln.user_lincoln_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own credentials"
  ON lincoln.user_lincoln_credentials FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "users insert own credentials"
  ON lincoln.user_lincoln_credentials FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own credentials"
  ON lincoln.user_lincoln_credentials FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "service_role all credentials"
  ON lincoln.user_lincoln_credentials FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- authenticated needs INSERT/UPDATE/SELECT on this table
GRANT SELECT, INSERT, UPDATE ON lincoln.user_lincoln_credentials TO authenticated;
