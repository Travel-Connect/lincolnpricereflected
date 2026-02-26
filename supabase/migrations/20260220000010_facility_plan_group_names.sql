-- Cache of plan group set names scraped from Lincoln 5050 page per facility.
-- Similar to facility_calendars but for plan group sets.
CREATE TABLE IF NOT EXISTS lincoln.facility_plan_group_names (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id           UUID        NOT NULL REFERENCES lincoln.facilities(id) ON DELETE CASCADE,
  plan_group_set_name   TEXT        NOT NULL,
  synced_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(facility_id, plan_group_set_name)
);

-- Grants
GRANT SELECT ON lincoln.facility_plan_group_names TO anon, authenticated;
GRANT ALL ON lincoln.facility_plan_group_names TO service_role;

-- RLS
ALTER TABLE lincoln.facility_plan_group_names ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read plan group names"
  ON lincoln.facility_plan_group_names FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage plan group names"
  ON lincoln.facility_plan_group_names FOR ALL
  TO service_role
  USING (true);
