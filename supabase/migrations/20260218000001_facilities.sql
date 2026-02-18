-- Migration: facilities + facility_aliases
-- Reference: docs/design.md §2, docs/requirements.md §5

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- facilities (施設マスタ)
-- ============================================================
CREATE TABLE facilities (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lincoln_id VARCHAR(10) UNIQUE NOT NULL,
  name       TEXT        NOT NULL,
  active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_facilities_lincoln_id ON facilities (lincoln_id);

COMMENT ON TABLE facilities IS '施設マスタ — Lincoln 施設ID と名称を管理';

-- ============================================================
-- facility_aliases (施設エイリアス — Excel ファイル名照合用)
-- ============================================================
CREATE TABLE facility_aliases (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID        NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  alias       TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(facility_id, alias)
);

CREATE INDEX idx_facility_aliases_alias ON facility_aliases (alias);

COMMENT ON TABLE facility_aliases IS '施設エイリアス — Excel ファイル名の施設名揺れを吸収';

-- ============================================================
-- updated_at トリガー関数
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_facilities_updated_at
  BEFORE UPDATE ON facilities
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read facilities"
  ON facilities FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_role all facilities"
  ON facilities FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated read facility_aliases"
  ON facility_aliases FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_role all facility_aliases"
  ON facility_aliases FOR ALL TO service_role USING (true) WITH CHECK (true);
