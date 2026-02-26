-- Allow authenticated users to update their own jobs (cancel, resume)
GRANT UPDATE ON lincoln.jobs TO authenticated;

CREATE POLICY "authenticated update own jobs"
  ON lincoln.jobs FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
