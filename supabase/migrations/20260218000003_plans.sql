-- Migration: plan_groups + plans + job_expected_ranks
-- Reference: docs/requirements.md §3.4, §3.5

-- ============================================================
-- plan_groups (リンカーンから取得したプラングループ)
-- ============================================================
CREATE TABLE lincoln.plan_groups (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID        NOT NULL REFERENCES lincoln.facilities(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  lincoln_id  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plan_groups_facility_id ON lincoln.plan_groups (facility_id);

COMMENT ON TABLE lincoln.plan_groups IS 'プラングループ — Lincoln 5070 から取得した選択肢を保存';

-- ============================================================
-- plans (プラングループ配下の個別プラン)
-- ============================================================
CREATE TABLE lincoln.plans (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_group_id  UUID        NOT NULL REFERENCES lincoln.plan_groups(id) ON DELETE CASCADE,
  name           TEXT        NOT NULL,
  lincoln_id     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plans_plan_group_id ON lincoln.plans (plan_group_id);

COMMENT ON TABLE lincoln.plans IS 'プラン — プラングループ配下の個別プラン';

-- ============================================================
-- job_expected_ranks (Excel パース結果の期待ランクデータ)
-- ============================================================
CREATE TABLE lincoln.job_expected_ranks (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id    UUID        NOT NULL REFERENCES lincoln.jobs(id) ON DELETE CASCADE,
  date      DATE        NOT NULL,
  room_type TEXT        NOT NULL,
  rank_code TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_expected_ranks_job_id ON lincoln.job_expected_ranks (job_id);

COMMENT ON TABLE lincoln.job_expected_ranks IS '期待ランクデータ — Excel パース結果をジョブ単位で保存';

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE lincoln.plan_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE lincoln.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE lincoln.job_expected_ranks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read plan_groups"
  ON lincoln.plan_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_role all plan_groups"
  ON lincoln.plan_groups FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated read plans"
  ON lincoln.plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_role all plans"
  ON lincoln.plans FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated read job_expected_ranks"
  ON lincoln.job_expected_ranks FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_role all job_expected_ranks"
  ON lincoln.job_expected_ranks FOR ALL TO service_role USING (true) WITH CHECK (true);
