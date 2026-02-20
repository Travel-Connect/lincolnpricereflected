import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
      .order("created_at", { ascending: true }),
    supabase
      .from("artifacts")
      .select("*")
      .eq("job_id", id)
      .order("created_at", { ascending: true }),
  ]);

  return (
    <JobDetailClient
      initialJob={job as unknown as Job}
      initialSteps={(stepsRes.data as unknown as JobStep[]) ?? []}
      initialArtifacts={(artifactsRes.data as unknown as Artifact[]) ?? []}
    />
  );
}
