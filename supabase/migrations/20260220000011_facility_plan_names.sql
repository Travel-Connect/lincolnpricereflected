-- Plan names per plan group set, scraped from Lincoln 5050 page.
-- Each plan group set contains multiple plan groups (plans).
CREATE TABLE IF NOT EXISTS lincoln.facility_plan_names (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id           UUID        NOT NULL REFERENCES lincoln.facilities(id) ON DELETE CASCADE,
  plan_group_set_name   TEXT        NOT NULL,
  plan_name             TEXT        NOT NULL,
  synced_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(facility_id, plan_group_set_name, plan_name)
);

-- Grants
GRANT SELECT ON lincoln.facility_plan_names TO anon, authenticated;
GRANT ALL ON lincoln.facility_plan_names TO service_role;

-- RLS
ALTER TABLE lincoln.facility_plan_names ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read plan names"
  ON lincoln.facility_plan_names FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage plan names"
  ON lincoln.facility_plan_names FOR ALL
  TO service_role
  USING (true);
