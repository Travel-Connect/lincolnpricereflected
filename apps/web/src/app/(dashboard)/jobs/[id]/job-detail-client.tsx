"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  Calendar,
  StopCircle,
  Play,
  RefreshCw,
  Download,
  FileImage,
  FileText,
  FileCode,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { StatusBadge, ExecModeBadge } from "@/components/status-badge";
import type { Job, JobStep, JobLog, Artifact } from "@/lib/types/database";

const STEP_LABELS: Record<string, string> = {
  PARSE: "Excel 解析",
  STEPA: "施設ID確認",
  STEP0: "カレンダー反映",
  STEPB: "一括料金反映",
  STEPC: "出力検証",
};

const PHASE_GROUPS_FULL = [
  { label: "ログイン/準備", steps: ["PARSE", "STEPA"] },
  { label: "処理A", steps: ["STEP0"] },
  { label: "処理B", steps: ["STEPB"] },
  { label: "検証", steps: ["STEPC"] },
];

function getVisibleSteps(execMode: string): string[] {
  switch (execMode) {
    case "A_only":
      return ["PARSE", "STEPA", "STEP0", "STEPC"];
    case "B_only":
      return ["PARSE", "STEPB", "STEPC"];
    default: // A_and_B
      return ["PARSE", "STEPA", "STEP0", "STEPB", "STEPC"];
  }
}

function getPhaseGroups(execMode: string) {
  const visible = getVisibleSteps(execMode);
  return PHASE_GROUPS_FULL
    .map((g) => ({
      ...g,
      steps: g.steps.filter((s) => visible.includes(s)),
    }))
    .filter((g) => g.steps.length > 0);
}

interface Props {
  initialJob: Job;
  initialSteps: JobStep[];
  initialArtifacts: Artifact[];
}

export function JobDetailClient({
  initialJob,
  initialSteps,
  initialArtifacts,
}: Props) {
  const [job, setJob] = useState<Job>(initialJob);
  const [steps, setSteps] = useState<JobStep[]>(initialSteps);
  const [artifacts] = useState<Artifact[]>(initialArtifacts);
  const [logs, setLogs] = useState<JobLog[]>([]);
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);

  // Poll for updates while job is active (3s interval)
  const isActive =
    job.status === "PENDING" ||
    job.status === "RUNNING" ||
    job.status === "AWAITING_2FA";

  useEffect(() => {
    if (!isActive) return;

    const supabase = createClient();
    const poll = async () => {
      const [jobRes, stepsRes, logsRes] = await Promise.all([
        supabase
          .from("jobs")
          .select("*, facility:facilities(*)")
          .eq("id", job.id)
          .single(),
        supabase
          .from("job_steps")
          .select("*")
          .eq("job_id", job.id)
          .order("started_at", { ascending: true, nullsFirst: false }),
        supabase
          .from("job_logs")
          .select("*")
          .eq("job_id", job.id)
          .order("created_at", { ascending: true }),
      ]);
      if (jobRes.data) setJob(jobRes.data as unknown as Job);
      if (stepsRes.data) setSteps(stepsRes.data as unknown as JobStep[]);
      if (logsRes.data) setLogs(logsRes.data as unknown as JobLog[]);
    };

    const interval = setInterval(poll, 3000);
    // Fetch immediately on mount too
    poll();

    return () => clearInterval(interval);
  }, [job.id, isActive]);

  async function handleAbort() {
    const supabase = createClient();
    const { error } = await supabase
      .from("jobs")
      .update({ status: "CANCELLED" })
      .eq("id", job.id);

    if (error) {
      toast.error("中止に失敗しました");
    } else {
      toast.success("ジョブを中止しました");
      setShowAbortConfirm(false);
    }
  }

  async function handleResume() {
    const supabase = createClient();
    const { error } = await supabase
      .from("jobs")
      .update({ status: "PENDING" })
      .eq("id", job.id);

    if (error) {
      toast.error("再開に失敗しました");
    } else {
      toast.success("ジョブを再キューしました");
    }
  }

  const isFailed = job.status === "FAILED";
  const isSuccess = job.status === "SUCCESS";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Back link */}
      <Link
        href="/history"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="size-4" />
        ジョブ履歴に戻る
      </Link>

      {/* 2FA banner */}
      {job.status === "AWAITING_2FA" && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-amber-800">
            <AlertTriangle className="size-5" />
            二段階認証が必要です
          </div>
          <p className="text-sm text-amber-700">
            Runner のブラウザウィンドウに 2FA
            コード入力画面が表示されています。ブラウザ上で直接コードを入力してください。
            認証完了後、処理が自動的に再開されます。
          </p>
        </div>
      )}

      {/* Success banner */}
      {isSuccess && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-green-800">
              <CheckCircle2 className="size-5" />
              ジョブが正常に完了しました
            </div>
            <Link
              href="/jobs/new"
              className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
            >
              同じ条件で再実行
            </Link>
          </div>
        </div>
      )}

      {/* Failed banner */}
      {isFailed && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-red-800">
              <XCircle className="size-5" />
              ジョブが失敗しました
            </div>
            <button
              onClick={handleResume}
              className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
            >
              <RefreshCw className="size-3" />
              再開
            </button>
          </div>
        </div>
      )}

      {/* Header card */}
      <div className="rounded-lg border bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StatusBadge status={job.status} />
            <ExecModeBadge mode={job.execution_mode} />
          </div>
          <div className="flex items-center gap-2">
            {isActive && (
              <button
                onClick={() => setShowAbortConfirm(true)}
                className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
              >
                <StopCircle className="size-3" />
                中止
              </button>
            )}
            {isFailed && (
              <button
                onClick={handleResume}
                className="flex items-center gap-1 rounded-lg border border-indigo-200 px-3 py-1.5 text-xs text-indigo-600 hover:bg-indigo-50"
              >
                <Play className="size-3" />
                再開
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <div className="flex items-center gap-2 text-slate-500">
            <Building2 className="size-4" />
            施設
          </div>
          <div className="text-slate-800">
            {job.facility?.name ?? job.facility_id}
          </div>

          <div className="flex items-center gap-2 text-slate-500">
            <Calendar className="size-4" />
            期間
          </div>
          <div className="text-slate-800">
            {job.target_period_from && job.target_period_to
              ? `${job.target_period_from} ~ ${job.target_period_to}`
              : "未設定"}
          </div>

          <div className="flex items-center gap-2 text-slate-500">
            <FileSpreadsheet className="size-4" />
            ファイル
          </div>
          <div className="text-slate-800">
            {job.excel_original_name ?? "—"}
          </div>
        </div>
      </div>

      {/* Phase timeline */}
      <div className="rounded-lg border bg-white p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">
          実行フェーズ
        </h3>
        <div className="flex gap-2">
          {getPhaseGroups(job.execution_mode).map(({ label, steps: phaseSteps }) => {
            const phaseStatus = getPhaseStatus(phaseSteps, steps, job);
            return (
              <div
                key={label}
                className={`flex-1 rounded-lg border p-3 text-center text-xs ${phaseStatusStyles[phaseStatus]}`}
              >
                <span className="font-medium">{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step details */}
      <div className="rounded-lg border bg-white p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">ステップ詳細</h3>
        <div className="space-y-2">
          {getVisibleSteps(job.execution_mode).map(
            (stepName) => {
              const step = steps.find((s) => s.step === stepName);
              return (
                <div
                  key={stepName}
                  className="flex items-center justify-between rounded border px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <StatusBadge
                      status={step?.status ?? "PENDING"}
                      className="text-[10px]"
                    />
                    <span className="text-sm">
                      {STEP_LABELS[stepName]}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    {step?.attempt && step.attempt > 1 && (
                      <span>試行 {step.attempt}</span>
                    )}
                    {step?.error_message && (
                      <span
                        className="max-w-[200px] truncate text-red-500"
                        title={step.error_message}
                      >
                        {step.error_message}
                      </span>
                    )}
                    {step?.completed_at && (
                      <span>
                        {new Date(step.completed_at).toLocaleTimeString(
                          "ja-JP"
                        )}
                      </span>
                    )}
                  </div>
                </div>
              );
            }
          )}
        </div>
      </div>

      {/* Artifacts */}
      {artifacts.length > 0 && (
        <div className="rounded-lg border bg-white p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">
            成果物
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {artifacts.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-2">
                  <ArtifactIcon type={a.type} />
                  <div>
                    <p className="text-xs font-medium text-slate-700">
                      {artifactTypeLabel[a.type]}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {STEP_LABELS[a.step] ?? a.step}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => toast.info("ダウンロード機能は準備中です")}
                  className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <Download className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Logs */}
      {logs.length > 0 && (
        <div className="rounded-lg border bg-slate-900 p-4 space-y-1 max-h-64 overflow-y-auto">
          <h3 className="text-xs font-semibold text-slate-400 mb-2">
            実行ログ
          </h3>
          {logs.map((log) => (
            <div key={log.id} className="flex gap-2 text-xs font-mono">
              <span className="shrink-0 text-slate-500">
                {new Date(log.created_at).toLocaleTimeString("ja-JP")}
              </span>
              <span
                className={
                  log.level === "error"
                    ? "text-red-400"
                    : log.level === "warn"
                      ? "text-amber-400"
                      : "text-slate-300"
                }
              >
                {log.message}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Abort confirm modal */}
      {showAbortConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-80 rounded-lg bg-white p-6 shadow-lg space-y-4">
            <h3 className="font-semibold">ジョブを中止しますか？</h3>
            <p className="text-sm text-slate-500">
              実行中のジョブを中止します。途中まで反映された内容は元に戻りません。
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAbortConfirm(false)}
                className="rounded px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                キャンセル
              </button>
              <button
                onClick={handleAbort}
                className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
              >
                中止する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getPhaseStatus(
  phaseSteps: string[],
  allSteps: JobStep[],
  _job: Job
): "pending" | "running" | "success" | "failed" {
  const matched = allSteps.filter((s) => phaseSteps.includes(s.step));
  if (matched.length === 0) return "pending";
  if (matched.some((s) => s.status === "FAILED")) return "failed";
  if (matched.some((s) => s.status === "RUNNING")) return "running";
  if (matched.every((s) => s.status === "SUCCESS")) return "success";
  return "pending";
}

const phaseStatusStyles: Record<string, string> = {
  pending: "border-slate-200 bg-slate-50 text-slate-400",
  running: "border-blue-300 bg-blue-50 text-blue-700",
  success: "border-green-300 bg-green-50 text-green-700",
  failed: "border-red-300 bg-red-50 text-red-700",
};

const artifactTypeLabel: Record<string, string> = {
  screenshot: "スクリーンショット",
  html: "HTML",
  network_log: "ネットワークログ",
  verification_csv: "検証結果 CSV",
};

function ArtifactIcon({ type }: { type: string }) {
  switch (type) {
    case "screenshot":
      return <FileImage className="size-4 text-blue-500" />;
    case "html":
      return <FileCode className="size-4 text-orange-500" />;
    case "verification_csv":
      return <FileSpreadsheet className="size-4 text-green-500" />;
    default:
      return <FileText className="size-4 text-slate-400" />;
  }
}
