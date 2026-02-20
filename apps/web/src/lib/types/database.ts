// TypeScript types matching lincoln schema tables
// Source: supabase/migrations/20260218000001 ~ 20260220000006

// --- Enums ---

export type JobStatus = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "CANCELLED" | "AWAITING_2FA";
export type StepName = "PARSE" | "STEPA" | "STEP0" | "STEPB" | "STEPC";
export type StepStatus = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED";
export type StayType = "A" | "B";
export type ExecMode = "A_only" | "B_only" | "A_and_B";
export type ArtifactType = "screenshot" | "html" | "network_log" | "verification_csv";
export type Environment = "production" | "staging";
export type LogLevel = "info" | "warn" | "error" | "debug";

// --- Core Tables ---

export interface Facility {
  id: string;
  lincoln_id: string;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FacilityAlias {
  id: string;
  facility_id: string;
  alias: string;
  created_at: string;
}

export interface Job {
  id: string;
  facility_id: string;
  user_id: string | null;
  status: JobStatus;
  execution_mode: ExecMode;
  environment: Environment;
  last_completed_step: StepName | "DONE" | null;
  excel_file_path: string | null;
  excel_original_name: string | null;
  stay_type: StayType | null;
  target_period_from: string | null;
  target_period_to: string | null;
  summary_json: Record<string, unknown> | null;
  result_json: Record<string, unknown> | null;
  config_json: JobConfig | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
  // joined
  facility?: Facility;
}

export interface JobConfig {
  calendar_name?: string;
  plan_group_set_names?: string[];
  output_plans?: { value: string; label: string }[];
  room_type_mappings?: { output: string; input: string }[];
  calendar_pattern_id?: string;
  process_b_pattern_id?: string;
}

export interface JobStep {
  id: string;
  job_id: string;
  step: StepName;
  status: StepStatus;
  attempt: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  metadata_json: Record<string, unknown> | null;
}

export interface JobLog {
  id: string;
  job_id: string;
  step: string | null;
  level: LogLevel;
  message: string;
  created_at: string;
}

export interface Artifact {
  id: string;
  job_id: string;
  step: string;
  type: ArtifactType;
  storage_path: string;
  created_at: string;
}

export interface JobExpectedRank {
  id: string;
  job_id: string;
  date: string;
  room_type: string;
  rank_code: string;
  created_at: string;
}

// --- User ---

export interface UserLincolnCredentials {
  id: string;
  user_id: string;
  lincoln_login_id: string;
  lincoln_login_pw: string;
  default_facility_id: string | null;
  created_at: string;
  updated_at: string;
}

// --- Patterns ---

export interface CalendarPattern {
  id: string;
  facility_id: string;
  user_id: string;
  name: string;
  is_default: boolean;
  mappings: CalendarMappingRow[];
  created_at: string;
  updated_at: string;
}

export interface CalendarMappingRow {
  excel_calendar: string;
  lincoln_calendar_id: string;
}

export interface ProcessBPattern {
  id: string;
  facility_id: string;
  user_id: string;
  name: string;
  is_default: boolean;
  rows: ProcessBMappingRow[];
  created_at: string;
  updated_at: string;
}

export interface ProcessBMappingRow {
  copy_source: string;
  plan_group_set: string;
  plan_name: string;
}

// --- Plans ---

export interface PlanGroup {
  id: string;
  facility_id: string;
  name: string;
  lincoln_id: string | null;
  created_at: string;
}

export interface Plan {
  id: string;
  plan_group_id: string;
  name: string;
  lincoln_id: string | null;
  created_at: string;
}

// --- Facility Config ---

export interface FacilityCalendarMapping {
  id: string;
  facility_id: string;
  calendar_name: string;
  stay_type: StayType;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface FacilityPlanGroupSet {
  id: string;
  facility_id: string;
  plan_group_set_name: string;
  lincoln_id: string | null;
  stay_type: StayType;
  is_default: boolean;
  created_at: string;
}

export interface FacilityOutputPlan {
  id: string;
  facility_id: string;
  value: string;
  label: string;
  stay_type: StayType;
  is_default: boolean;
  created_at: string;
}

export interface FacilityRoomTypeMapping {
  id: string;
  facility_id: string;
  output_room_type: string;
  input_room_type: string;
  stay_type: StayType;
  created_at: string;
}
