-- Migration: jobs テーブルに user_id カラムを追加
-- ジョブの実行ユーザーを追跡

ALTER TABLE lincoln.jobs ADD COLUMN user_id UUID REFERENCES auth.users(id);

CREATE INDEX idx_jobs_user_id ON lincoln.jobs (user_id);

-- authenticated に INSERT 権限を追加（ジョブ作成用）
GRANT INSERT ON lincoln.jobs TO authenticated;

-- RLS: ユーザーは自分のジョブのみ参照可能に更新
DROP POLICY IF EXISTS "authenticated read jobs" ON lincoln.jobs;
CREATE POLICY "authenticated read own jobs"
  ON lincoln.jobs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "authenticated insert own jobs"
  ON lincoln.jobs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
