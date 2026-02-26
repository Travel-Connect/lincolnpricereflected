-- Facility calendars: cached from Lincoln 6800 page
CREATE TABLE IF NOT EXISTS lincoln.facility_calendars (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id   UUID NOT NULL REFERENCES lincoln.facilities(id) ON DELETE CASCADE,
  calendar_name TEXT NOT NULL,
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(facility_id, calendar_name)
);

-- Grants
GRANT SELECT ON lincoln.facility_calendars TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON lincoln.facility_calendars TO service_role;

-- RLS
ALTER TABLE lincoln.facility_calendars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read facility_calendars"
  ON lincoln.facility_calendars FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage facility_calendars"
  ON lincoln.facility_calendars FOR ALL
  TO service_role
  USING (true);
