-- Migration: plan_groups + plans + job_expected_ranks
-- Reference: docs/requirements.md §3.4, §3.5

-- ============================================================
-- plan_groups (リンカーンから取得したプラングループ)
-- ============================================================
CREATE TABLE plan_groups (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID        NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  lincoln_id  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plan_groups_facility_id ON plan_groups (facility_id);

COMMENT ON TABLE plan_groups IS 'プラングループ — Lincoln 5070 から取得した選択肢を保存';

-- ============================================================
-- plans (プラングループ配下の個別プラン)
-- ============================================================
CREATE TABLE plans (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_group_id  UUID        NOT NULL REFERENCES plan_groups(id) ON DELETE CASCADE,
  name           TEXT        NOT NULL,
  lincoln_id     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plans_plan_group_id ON plans (plan_group_id);

COMMENT ON TABLE plans IS 'プラン — プラングループ配下の個別プラン';

-- ============================================================
-- job_expected_ranks (Excel パース結果の期待ランクデータ)
-- ============================================================
CREATE TABLE job_expected_ranks (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id    UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  date      DATE        NOT NULL,
  room_type TEXT        NOT NULL,
  rank_code TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_expected_ranks_job_id ON job_expected_ranks (job_id);

COMMENT ON TABLE job_expected_ranks IS '期待ランクデータ — Excel パース結果をジョブ単位で保存';

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE plan_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_expected_ranks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read plan_groups"
  ON plan_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_role all plan_groups"
  ON plan_groups FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated read plans"
  ON plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_role all plans"
  ON plans FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated read job_expected_ranks"
  ON job_expected_ranks FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_role all job_expected_ranks"
  ON job_expected_ranks FOR ALL TO service_role USING (true) WITH CHECK (true);
