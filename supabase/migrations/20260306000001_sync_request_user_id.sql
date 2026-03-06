-- Add user_id to calendar_sync_requests so the Runner can use per-user
-- Lincoln credentials instead of the shared env vars.
ALTER TABLE lincoln.calendar_sync_requests
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
