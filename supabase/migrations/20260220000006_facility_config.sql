-- Migration: 施設設定テーブル群 + RLS 修正
-- 施設ごとのカレンダー・プラン・部屋タイプ設定 + 子テーブルのユーザースコープ化

-- ============================================================
-- facility_calendar_mappings (施設別カレンダー割当)
-- ============================================================
CREATE TABLE lincoln.facility_calendar_mappings (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id   UUID        NOT NULL REFERENCES lincoln.facilities(id) ON DELETE CASCADE,
  calendar_name TEXT        NOT NULL,
  stay_type     TEXT        NOT NULL CHECK (stay_type IN ('A', 'B')),
  is_default    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(facility_id, calendar_name, stay_type)
);

CREATE TRIGGER set_facility_calendar_mappings_updated_at
  BEFORE UPDATE ON lincoln.facility_calendar_mappings
  FOR EACH ROW
  EXECUTE FUNCTION lincoln.update_updated_at_column();

COMMENT ON TABLE lincoln.facility_calendar_mappings IS '施設別カレンダー割当 — コピー元カレンダー設定';

-- ============================================================
-- facility_plan_group_sets (施設別プラングループセット設定)
-- ============================================================
CREATE TABLE lincoln.facility_plan_group_sets (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id         UUID        NOT NULL REFERENCES lincoln.facilities(id) ON DELETE CASCADE,
  plan_group_set_name TEXT        NOT NULL,
  lincoln_id          TEXT,
  stay_type           TEXT        NOT NULL CHECK (stay_type IN ('A', 'B')),
  is_default          BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(facility_id, plan_group_set_name, stay_type)
);

COMMENT ON TABLE lincoln.facility_plan_group_sets IS '施設別プラングループセット — STEPB の送信対象';

-- ============================================================
-- facility_output_plans (施設別出力プラン設定 — STEPC 用)
-- ============================================================
CREATE TABLE lincoln.facility_output_plans (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID        NOT NULL REFERENCES lincoln.facilities(id) ON DELETE CASCADE,
  value       TEXT        NOT NULL,
  label       TEXT        NOT NULL,
  stay_type   TEXT        NOT NULL CHECK (stay_type IN ('A', 'B')),
  is_default  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(facility_id, value, stay_type)
);

COMMENT ON TABLE lincoln.facility_output_plans IS '施設別出力プラン — STEPC の 5070 デュアルリスト選択肢';

-- ============================================================
-- facility_room_type_mappings (施設別部屋タイプマッピング — STEPC 検証用)
-- ============================================================
CREATE TABLE lincoln.facility_room_type_mappings (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id      UUID        NOT NULL REFERENCES lincoln.facilities(id) ON DELETE CASCADE,
  output_room_type TEXT        NOT NULL,
  input_room_type  TEXT        NOT NULL,
  stay_type        TEXT        NOT NULL CHECK (stay_type IN ('A', 'B')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(facility_id, output_room_type, stay_type)
);

COMMENT ON TABLE lincoln.facility_room_type_mappings IS '施設別部屋タイプマッピング — STEPC の出力Excel⇔入力Excel照合用';

-- ============================================================
-- RLS: 施設設定テーブル (共有設定: 全 authenticated ユーザーが参照可能)
-- ============================================================
ALTER TABLE lincoln.facility_calendar_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE lincoln.facility_plan_group_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE lincoln.facility_output_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE lincoln.facility_room_type_mappings ENABLE ROW LEVEL SECURITY;

-- SELECT: authenticated, ALL: service_role
CREATE POLICY "authenticated read facility_calendar_mappings"
  ON lincoln.facility_calendar_mappings FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_role all facility_calendar_mappings"
  ON lincoln.facility_calendar_mappings FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated read facility_plan_group_sets"
  ON lincoln.facility_plan_group_sets FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_role all facility_plan_group_sets"
  ON lincoln.facility_plan_group_sets FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated read facility_output_plans"
  ON lincoln.facility_output_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_role all facility_output_plans"
  ON lincoln.facility_output_plans FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated read facility_room_type_mappings"
  ON lincoln.facility_room_type_mappings FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_role all facility_room_type_mappings"
  ON lincoln.facility_room_type_mappings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- RLS 修正: job_steps, artifacts をユーザースコープに変更
-- ============================================================

-- job_steps: 自分のジョブのステップのみ参照可能
DROP POLICY IF EXISTS "authenticated read job_steps" ON lincoln.job_steps;
CREATE POLICY "authenticated read own job_steps"
  ON lincoln.job_steps FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM lincoln.jobs
      WHERE jobs.id = job_steps.job_id
        AND jobs.user_id = auth.uid()
    )
  );

-- artifacts: 自分のジョブの成果物のみ参照可能
DROP POLICY IF EXISTS "authenticated read artifacts" ON lincoln.artifacts;
CREATE POLICY "authenticated read own artifacts"
  ON lincoln.artifacts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM lincoln.jobs
      WHERE jobs.id = artifacts.job_id
        AND jobs.user_id = auth.uid()
    )
  );

-- job_expected_ranks: 自分のジョブの期待ランクのみ参照可能
DROP POLICY IF EXISTS "authenticated read job_expected_ranks" ON lincoln.job_expected_ranks;
CREATE POLICY "authenticated read own job_expected_ranks"
  ON lincoln.job_expected_ranks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM lincoln.jobs
      WHERE jobs.id = job_expected_ranks.job_id
        AND jobs.user_id = auth.uid()
    )
  );

-- ============================================================
-- anon ロールのアクセス除去 (認証必須ツールのため)
-- ============================================================
REVOKE ALL ON ALL TABLES IN SCHEMA lincoln FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA lincoln REVOKE SELECT ON TABLES FROM anon;
