-- Add lincoln schema tables to Supabase Realtime publication
-- This enables the Web UI's JobDetail page to receive live updates

-- Note: ALTER PUBLICATION ... ADD TABLE is idempotent-safe if tables aren't already in the publication.
-- If a table is already published, this will error, so we use a DO block to handle gracefully.

DO $$
BEGIN
  -- jobs: real-time status updates (RUNNING → SUCCESS/FAILED)
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE lincoln.jobs;
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'lincoln.jobs already in supabase_realtime';
  END;

  -- job_steps: step progress tracking
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE lincoln.job_steps;
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'lincoln.job_steps already in supabase_realtime';
  END;

  -- job_logs: live log streaming to terminal viewer
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE lincoln.job_logs;
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'lincoln.job_logs already in supabase_realtime';
  END;
END $$;
