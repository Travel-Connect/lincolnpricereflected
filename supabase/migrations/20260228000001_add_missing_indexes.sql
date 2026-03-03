-- Add missing composite indexes for frequently queried columns.
-- These improve performance for Web UI listing and Runner polling.

-- jobs: filter by user + status (Web UI "my jobs" view)
CREATE INDEX IF NOT EXISTS idx_jobs_user_id_status
  ON lincoln.jobs (user_id, status);

-- job_logs: filter by job + step (job detail log panel)
CREATE INDEX IF NOT EXISTS idx_job_logs_job_step
  ON lincoln.job_logs (job_id, step);

-- facility_plan_names: lookup by facility (sync + STEPC)
CREATE INDEX IF NOT EXISTS idx_facility_plan_names_facility
  ON lincoln.facility_plan_names (facility_id);

-- facility_plan_group_names: lookup by facility (sync + STEPB)
CREATE INDEX IF NOT EXISTS idx_facility_plan_group_names_facility
  ON lincoln.facility_plan_group_names (facility_id);
