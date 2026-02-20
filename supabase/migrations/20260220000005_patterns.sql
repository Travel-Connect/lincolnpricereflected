-- Migration: パターンテーブル
-- カレンダーマッピングパターン + 処理Bマッピングパターン

-- ============================================================
-- calendar_patterns (処理A用カレンダーマッピングパターン)
-- ============================================================
CREATE TABLE lincoln.calendar_patterns (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID        NOT NULL REFERENCES lincoln.facilities(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  is_default  BOOLEAN     NOT NULL DEFAULT FALSE,
  mappings    JSONB       NOT NULL,
  -- mappings: [{ "excel_calendar": "...", "lincoln_calendar_id": "..." }, ...]
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(facility_id, user_id, name)
);

CREATE INDEX idx_calendar_patterns_facility ON lincoln.calendar_patterns (facility_id, user_id);

CREATE TRIGGER set_calendar_patterns_updated_at
  BEFORE UPDATE ON lincoln.calendar_patterns
  FOR EACH ROW
  EXECUTE FUNCTION lincoln.update_updated_at_column();

COMMENT ON TABLE lincoln.calendar_patterns IS 'カレンダーマッピングパターン — 施設×ユーザー単位で保存';

-- ============================================================
-- process_b_patterns (処理B用マッピングパターン)
-- ============================================================
CREATE TABLE lincoln.process_b_patterns (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID        NOT NULL REFERENCES lincoln.facilities(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  is_default  BOOLEAN     NOT NULL DEFAULT FALSE,
  rows        JSONB       NOT NULL,
  -- rows: [{ "copy_source": "...", "plan_group_set": "...", "plan_name": "..." }, ...]
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(facility_id, user_id, name)
);

CREATE INDEX idx_process_b_patterns_facility ON lincoln.process_b_patterns (facility_id, user_id);

CREATE TRIGGER set_process_b_patterns_updated_at
  BEFORE UPDATE ON lincoln.process_b_patterns
  FOR EACH ROW
  EXECUTE FUNCTION lincoln.update_updated_at_column();

COMMENT ON TABLE lincoln.process_b_patterns IS '処理Bマッピングパターン — 施設×ユーザー単位で保存';

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE lincoln.calendar_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE lincoln.process_b_patterns ENABLE ROW LEVEL SECURITY;

-- calendar_patterns: ユーザーは自分のパターンのみ CRUD
CREATE POLICY "users read own calendar_patterns"
  ON lincoln.calendar_patterns FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "users insert own calendar_patterns"
  ON lincoln.calendar_patterns FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own calendar_patterns"
  ON lincoln.calendar_patterns FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users delete own calendar_patterns"
  ON lincoln.calendar_patterns FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "service_role all calendar_patterns"
  ON lincoln.calendar_patterns FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- process_b_patterns: 同様
CREATE POLICY "users read own process_b_patterns"
  ON lincoln.process_b_patterns FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "users insert own process_b_patterns"
  ON lincoln.process_b_patterns FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own process_b_patterns"
  ON lincoln.process_b_patterns FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users delete own process_b_patterns"
  ON lincoln.process_b_patterns FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "service_role all process_b_patterns"
  ON lincoln.process_b_patterns FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- GRANT
GRANT SELECT, INSERT, UPDATE, DELETE ON lincoln.calendar_patterns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON lincoln.process_b_patterns TO authenticated;
