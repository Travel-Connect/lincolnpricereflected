-- Calendar sync requests: triggered from web UI, processed by Runner
CREATE TABLE IF NOT EXISTS lincoln.calendar_sync_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id   UUID NOT NULL REFERENCES lincoln.facilities(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'DONE', 'ERROR')),
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

-- Grants
GRANT SELECT, INSERT ON lincoln.calendar_sync_requests TO authenticated;
GRANT ALL ON lincoln.calendar_sync_requests TO service_role;

-- RLS
ALTER TABLE lincoln.calendar_sync_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read/create sync requests"
  ON lincoln.calendar_sync_requests FOR ALL
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage sync requests"
  ON lincoln.calendar_sync_requests FOR ALL
  TO service_role
  USING (true);

-- Add to Realtime publication
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE lincoln.calendar_sync_requests;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'already in publication';
END $$;
