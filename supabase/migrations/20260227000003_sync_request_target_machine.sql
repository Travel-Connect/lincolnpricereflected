-- Add target_machine to calendar_sync_requests so only the designated
-- Runner PC processes each sync request (prevents black console windows
-- from appearing on all PCs when one user triggers a sync).
ALTER TABLE lincoln.calendar_sync_requests
  ADD COLUMN IF NOT EXISTS target_machine TEXT;
