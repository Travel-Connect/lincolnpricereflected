"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  History,
  Search,
  X,
  ChevronRight,
  Filter,
} from "lucide-react";
import { StatusBadge, ExecModeBadge } from "@/components/status-badge";
import type { Job, JobStatus, Environment } from "@/lib/types/database";

interface Props {
  initialJobs: Job[];
}

export function HistoryClient({ initialJobs }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<JobStatus | "ALL">("ALL");
  const [envFilter, setEnvFilter] = useState<Environment | "ALL">("ALL");

  const filtered = useMemo(() => {
    return initialJobs.filter((job) => {
      // Status filter
      if (statusFilter !== "ALL" && job.status !== statusFilter) return false;
      // Environment filter
      if (envFilter !== "ALL" && job.environment !== envFilter) return false;
      // Text search
      if (search) {
        const q = search.toLowerCase();
        const facilityName = job.facility?.name?.toLowerCase() ?? "";
        const facilityId = job.facility?.lincoln_id?.toLowerCase() ?? "";
        const jobId = job.id.toLowerCase();
        if (
          !facilityName.includes(q) &&
          !facilityId.includes(q) &&
          !jobId.includes(q)
        )
          return false;
      }
      return true;
    });
  }, [initialJobs, search, statusFilter, envFilter]);

  const hasFilters = search || statusFilter !== "ALL" || envFilter !== "ALL";

  function clearFilters() {
    setSearch("");
    setStatusFilter("ALL");
    setEnvFilter("ALL");
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <History className="size-5 text-slate-600" />
        <h1 className="text-lg font-semibold">ジョブ履歴</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="施設名、施設ID、ジョブIDで検索..."
            className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as JobStatus | "ALL")
          }
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="ALL">全ステータス</option>
          <option value="PENDING">待機中</option>
          <option value="RUNNING">実行中</option>
          <option value="SUCCESS">成功</option>
          <option value="FAILED">失敗</option>
          <option value="CANCELLED">中止</option>
          <option value="AWAITING_2FA">2FA待ち</option>
        </select>

        <select
          value={envFilter}
          onChange={(e) =>
            setEnvFilter(e.target.value as Environment | "ALL")
          }
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="ALL">全環境</option>
          <option value="production">本番</option>
          <option value="staging">検証</option>
        </select>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
          >
            <X className="size-3" />
            クリア
          </button>
        )}

        <span className="text-xs text-slate-400">
          {filtered.length} 件
        </span>
      </div>

      {/* Job list */}
      {filtered.length > 0 ? (
        <div className="rounded-lg border bg-white divide-y">
          {filtered.map((job) => (
            <Link
              key={job.id}
              href={`/jobs/${job.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-4 min-w-0">
                <StatusBadge status={job.status} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {job.facility?.name ?? "不明な施設"}
                    </span>
                    <ExecModeBadge mode={job.execution_mode} />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                    {job.target_period_from && (
                      <span>
                        {job.target_period_from} ~ {job.target_period_to}
                      </span>
                    )}
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        job.environment === "production"
                          ? "bg-red-50 text-red-600"
                          : "bg-blue-50 text-blue-600"
                      }`}
                    >
                      {job.environment === "production" ? "本番" : "検証"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                <span className="text-xs text-slate-400">
                  {new Date(job.created_at).toLocaleString("ja-JP", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <ChevronRight className="size-4 text-slate-300" />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border bg-white p-12 text-center">
          <Filter className="mx-auto size-8 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">
            {hasFilters
              ? "条件に一致するジョブがありません"
              : "ジョブがまだありません"}
          </p>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="mt-2 text-xs text-indigo-600 hover:text-indigo-700"
            >
              フィルタをクリア
            </button>
          )}
        </div>
      )}
    </div>
  );
}
