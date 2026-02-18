-- Migration: jobs + job_steps + artifacts
-- Reference: docs/design.md §2, docs/requirements.md §4

-- ============================================================
-- jobs (ジョブ管理)
-- ============================================================
CREATE TABLE jobs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id         UUID        NOT NULL REFERENCES facilities(id),
  status              TEXT        NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','RUNNING','SUCCESS','FAILED','CANCELLED')),
  last_completed_step TEXT
    CHECK (last_completed_step IS NULL
        OR last_completed_step IN ('PARSE','STEP0','STEPA','STEPB','STEPC','DONE')),
  excel_file_path     TEXT,
  excel_original_name TEXT,
  stay_type           TEXT
    CHECK (stay_type IS NULL OR stay_type IN ('A','B')),
  target_period_from  DATE,
  target_period_to    DATE,
  summary_json        JSONB,
  result_json         JSONB,
  retry_count         INTEGER     NOT NULL DEFAULT 3,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_jobs_facility_id ON jobs (facility_id);
CREATE INDEX idx_jobs_status      ON jobs (status);
CREATE INDEX idx_jobs_created_at  ON jobs (created_at DESC);

CREATE TRIGGER set_jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE jobs IS 'ジョブ管理 — Excel パース→反映→検証の実行単位';

-- ============================================================
-- job_steps (ステップ実行ログ)
-- ============================================================
CREATE TABLE job_steps (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  step          TEXT        NOT NULL
    CHECK (step IN ('PARSE','STEP0','STEPA','STEPB','STEPC')),
  status        TEXT        NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','RUNNING','SUCCESS','FAILED')),
  attempt       INTEGER     NOT NULL DEFAULT 1,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  error_message TEXT,
  metadata_json JSONB
);

CREATE INDEX idx_job_steps_job_id ON job_steps (job_id);

COMMENT ON TABLE job_steps IS 'ステップ実行ログ — 各ステップの状態・試行回数を記録';

-- ============================================================
-- artifacts (成果物・エビデンス)
-- ============================================================
CREATE TABLE artifacts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  step         TEXT        NOT NULL,
  type         TEXT        NOT NULL
    CHECK (type IN ('screenshot','html','network_log','verification_csv')),
  storage_path TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_artifacts_job_id ON artifacts (job_id);

COMMENT ON TABLE artifacts IS '成果物 — スクショ・HTML・ネットワークログ・検証結果を保存';

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read jobs"
  ON jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_role all jobs"
  ON jobs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated read job_steps"
  ON job_steps FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_role all job_steps"
  ON job_steps FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated read artifacts"
  ON artifacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_role all artifacts"
  ON artifacts FOR ALL TO service_role USING (true) WITH CHECK (true);
