-- Migration: Supabase Storage バケット
-- Reference: docs/design.md §2.3

-- ============================================================
-- Storage buckets
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('excel-uploads', 'excel-uploads', false);

INSERT INTO storage.buckets (id, name, public)
VALUES ('artifacts', 'artifacts', false);

-- ============================================================
-- Storage RLS policies
-- ============================================================

-- excel-uploads: authenticated can upload and read
CREATE POLICY "authenticated upload excel-uploads"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'excel-uploads');

CREATE POLICY "authenticated read excel-uploads"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'excel-uploads');

CREATE POLICY "service_role all excel-uploads"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'excel-uploads');

-- artifacts: service_role writes, authenticated reads
CREATE POLICY "service_role all artifacts"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'artifacts');

CREATE POLICY "authenticated read artifacts"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'artifacts');
