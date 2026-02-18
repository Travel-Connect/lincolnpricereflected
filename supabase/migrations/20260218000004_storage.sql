-- Migration: Supabase Storage バケット (lincoln用)
-- Reference: docs/design.md §2.3

-- ============================================================
-- Storage buckets (lincoln- プレフィックスで OTAlogin と区別)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('lincoln-excel-uploads', 'lincoln-excel-uploads', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('lincoln-artifacts', 'lincoln-artifacts', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Storage RLS policies
-- ============================================================

-- lincoln-excel-uploads: authenticated can upload and read
CREATE POLICY "authenticated upload lincoln-excel-uploads"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lincoln-excel-uploads');

CREATE POLICY "authenticated read lincoln-excel-uploads"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'lincoln-excel-uploads');

CREATE POLICY "service_role all lincoln-excel-uploads"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'lincoln-excel-uploads');

-- lincoln-artifacts: service_role writes, authenticated reads
CREATE POLICY "service_role all lincoln-artifacts"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'lincoln-artifacts');

CREATE POLICY "authenticated read lincoln-artifacts"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'lincoln-artifacts');
