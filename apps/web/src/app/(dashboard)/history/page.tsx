import { createClient } from "@/lib/supabase/server";
import { typedDataOrEmpty } from "@/lib/supabase/typed-query";
import type { Job } from "@/lib/types/database";
import { HistoryClient } from "./history-client";

export default async function HistoryPage() {
  const supabase = await createClient();

  const { data: jobs } = await supabase
    .from("jobs")
    .select("*, facility:facilities(id, name, lincoln_id)")
    .order("created_at", { ascending: false })
    .range(0, 49);

  return <HistoryClient initialJobs={typedDataOrEmpty<Job>(jobs)} />;
}
