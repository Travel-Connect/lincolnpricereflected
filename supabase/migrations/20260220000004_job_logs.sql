-- Migration: job_logs テーブル
-- リアルタイムログストリーミング用

CREATE TABLE lincoln.job_logs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id     UUID        NOT NULL REFERENCES lincoln.jobs(id) ON DELETE CASCADE,
  step       TEXT,
  level      TEXT        NOT NULL DEFAULT 'info'
    CHECK (level IN ('info', 'warn', 'error', 'debug')),
  message    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_logs_job_id ON lincoln.job_logs (job_id, created_at);

COMMENT ON TABLE lincoln.job_logs IS 'ジョブ実行ログ — リアルタイムストリーミング用';

-- RLS: ユーザーは自分のジョブのログのみ参照可能
ALTER TABLE lincoln.job_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read own job_logs"
  ON lincoln.job_logs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM lincoln.jobs
      WHERE jobs.id = job_logs.job_id
        AND jobs.user_id = auth.uid()
    )
  );

CREATE POLICY "service_role all job_logs"
  ON lincoln.job_logs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON lincoln.job_logs TO authenticated;
