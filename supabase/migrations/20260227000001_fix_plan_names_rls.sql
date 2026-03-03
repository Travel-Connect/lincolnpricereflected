-- Fix: facility_plan_names table is not readable by anon/authenticated despite
-- migration 20260220000011 having correct GRANT + RLS. Re-apply to ensure
-- the policy is active on remote.

-- Re-grant (idempotent)
GRANT SELECT ON lincoln.facility_plan_names TO anon, authenticated;
GRANT ALL ON lincoln.facility_plan_names TO service_role;

-- Drop + recreate policies (safe — IF EXISTS prevents errors)
DROP POLICY IF EXISTS "Anyone can read plan names" ON lincoln.facility_plan_names;
DROP POLICY IF EXISTS "Service role can manage plan names" ON lincoln.facility_plan_names;

CREATE POLICY "Anyone can read plan names"
  ON lincoln.facility_plan_names FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage plan names"
  ON lincoln.facility_plan_names FOR ALL
  TO service_role
  USING (true);
