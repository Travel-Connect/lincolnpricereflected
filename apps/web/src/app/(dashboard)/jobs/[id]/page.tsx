import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { typedData, typedDataOrEmpty } from "@/lib/supabase/typed-query";
import type { Job, JobStep, Artifact } from "@/lib/types/database";
import { JobDetailClient } from "./job-detail-client";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: job } = await supabase
    .from("jobs")
    .select("*, facility:facilities(*)")
    .eq("id", id)
    .single();

  if (!job) notFound();

  const [stepsRes, artifactsRes] = await Promise.all([
    supabase
      .from("job_steps")
      .select("*")
      .eq("job_id", id)
      .order("started_at", { ascending: true, nullsFirst: false }),
    supabase
      .from("artifacts")
      .select("*")
      .eq("job_id", id)
      .order("created_at", { ascending: true }),
  ]);

  return (
    <JobDetailClient
      initialJob={typedData<Job>(job)}
      initialSteps={typedDataOrEmpty<JobStep>(stepsRes.data)}
      initialArtifacts={typedDataOrEmpty<Artifact>(artifactsRes.data)}
    />
  );
}
