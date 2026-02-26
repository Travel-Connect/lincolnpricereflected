-- Runner registration table (agent.py heartbeats to register machines)
CREATE TABLE lincoln.runners (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_name    TEXT        NOT NULL UNIQUE,
  last_heartbeat  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE lincoln.runners ENABLE ROW LEVEL SECURITY;

-- service_role can do everything
CREATE POLICY "service_role_full_access" ON lincoln.runners
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- authenticated users can read (for Web UI runner selector)
CREATE POLICY "authenticated_read_runners" ON lincoln.runners
  FOR SELECT TO authenticated USING (true);

-- Grants
GRANT USAGE ON SCHEMA lincoln TO anon, authenticated, service_role;
GRANT ALL ON lincoln.runners TO service_role;
GRANT SELECT ON lincoln.runners TO authenticated;

-- Add target_machine column to jobs
ALTER TABLE lincoln.jobs ADD COLUMN target_machine TEXT;

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE lincoln.runners;
