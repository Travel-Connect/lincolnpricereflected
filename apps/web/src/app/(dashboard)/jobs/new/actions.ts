"use server";

import { createClient } from "@/lib/supabase/server";
import type { ExecMode, Environment } from "@/lib/types/database";

export async function uploadExcel(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const file = formData.get("file") as File;
  if (!file || file.size === 0) throw new Error("No file provided");

  // Supabase Storage keys only accept ASCII — extract extension and use timestamp
  const ext = file.name.replace(/^.*\./, ".") || ".xlsx";
  const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, "");
  const path = `${user.id}/${Date.now()}${safeExt}`;
  const { error } = await supabase.storage
    .from("lincoln-excel-uploads")
    .upload(path, file);

  if (error) throw new Error(`Upload failed: ${error.message}`);

  return { path, originalName: file.name };
}

export interface CreateJobInput {
  facility_id: string;
  execution_mode: ExecMode;
  environment: Environment;
  excel_file_path: string;
  excel_original_name: string;
  stay_type: "A" | "B" | null;
  config_json: Record<string, unknown>;
  retry_count: number;
  target_machine: string;
}

export async function createJob(input: CreateJobInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      facility_id: input.facility_id,
      user_id: user.id,
      status: "PENDING",
      execution_mode: input.execution_mode,
      environment: input.environment,
      excel_file_path: input.excel_file_path,
      excel_original_name: input.excel_original_name,
      stay_type: input.stay_type,
      config_json: input.config_json,
      retry_count: input.retry_count,
      target_machine: input.target_machine,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Job creation failed: ${error.message}`);

  return { id: data.id };
}

export async function saveCalendarPattern(input: {
  facility_id: string;
  name: string;
  is_default: boolean;
  mappings: { excel_calendar: string; lincoln_calendar_id: string }[];
  id?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  if (input.id) {
    // Update existing
    const { error } = await supabase
      .from("calendar_patterns")
      .update({
        name: input.name,
        is_default: input.is_default,
        mappings: input.mappings,
      })
      .eq("id", input.id)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
    return { id: input.id };
  } else {
    // Insert new
    const { data, error } = await supabase
      .from("calendar_patterns")
      .insert({
        facility_id: input.facility_id,
        user_id: user.id,
        name: input.name,
        is_default: input.is_default,
        mappings: input.mappings,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: data.id };
  }
}

export async function saveProcessBPattern(input: {
  facility_id: string;
  name: string;
  is_default: boolean;
  rows: { copy_source: string; plan_group_set: string; plan_name: string }[];
  id?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  if (input.id) {
    const { error } = await supabase
      .from("process_b_patterns")
      .update({
        name: input.name,
        is_default: input.is_default,
        rows: input.rows,
      })
      .eq("id", input.id)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("process_b_patterns").insert({
      facility_id: input.facility_id,
      user_id: user.id,
      name: input.name,
      is_default: input.is_default,
      rows: input.rows,
    });
    if (error) throw new Error(error.message);
  }
}

export async function fetchFacilityCalendars(
  facilityId: string,
): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("facility_calendars")
    .select("calendar_name")
    .eq("facility_id", facilityId)
    .order("calendar_name");

  if (error) throw new Error(`Failed to fetch calendars: ${error.message}`);
  return (data ?? []).map((row) => row.calendar_name);
}

export async function deleteCalendarPattern(patternId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("calendar_patterns")
    .delete()
    .eq("id", patternId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
}

export async function fetchFacilityPlanGroupNames(
  facilityId: string,
): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("facility_plan_group_names")
    .select("plan_group_set_name")
    .eq("facility_id", facilityId)
    .order("plan_group_set_name");

  if (error) throw new Error(`Failed to fetch plan group names: ${error.message}`);
  return (data ?? []).map((row) => row.plan_group_set_name);
}

export async function fetchFacilityPlanNames(
  facilityId: string,
): Promise<Record<string, string[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("facility_plan_names")
    .select("plan_group_set_name, plan_name")
    .eq("facility_id", facilityId)
    .order("plan_group_set_name")
    .order("plan_name");

  if (error) throw new Error(`Failed to fetch plan names: ${error.message}`);

  // Group by plan_group_set_name
  const grouped: Record<string, string[]> = {};
  for (const row of data ?? []) {
    if (!grouped[row.plan_group_set_name]) {
      grouped[row.plan_group_set_name] = [];
    }
    grouped[row.plan_group_set_name].push(row.plan_name);
  }
  return grouped;
}

export async function deleteProcessBPattern(patternId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("process_b_patterns")
    .delete()
    .eq("id", patternId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
}

export async function requestCalendarSync(
  facilityId: string,
): Promise<{ id: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("calendar_sync_requests")
    .insert({ facility_id: facilityId })
    .select("id")
    .single();

  if (error) throw new Error(`Sync request failed: ${error.message}`);
  return { id: data.id };
}

export async function getSyncRequestStatus(
  reqId: string,
): Promise<{ status: string; error_message?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calendar_sync_requests")
    .select("status, error_message")
    .eq("id", reqId)
    .single();

  if (error) throw new Error(`Failed to check sync status: ${error.message}`);
  return data;
}

export async function loadPatterns(facilityId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const [calRes, pbRes] = await Promise.all([
    supabase
      .from("calendar_patterns")
      .select("*")
      .eq("facility_id", facilityId)
      .eq("user_id", user.id)
      .order("name"),
    supabase
      .from("process_b_patterns")
      .select("*")
      .eq("facility_id", facilityId)
      .eq("user_id", user.id)
      .order("name"),
  ]);

  return {
    calendarPatterns: calRes.data ?? [],
    processBPatterns: pbRes.data ?? [],
  };
}
