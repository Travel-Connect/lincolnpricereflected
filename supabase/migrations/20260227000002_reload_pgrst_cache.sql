-- Force PostgREST schema cache reload to pick up facility_plan_names RLS changes
NOTIFY pgrst, 'reload schema';
