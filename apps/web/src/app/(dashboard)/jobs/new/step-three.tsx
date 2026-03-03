"use client";

import { useApp } from "@/lib/context/app-context";
import {
  FileSpreadsheet,
  Building2,
  Calendar,
  ListChecks,
  AlertTriangle,
  Minus,
  Plus,
} from "lucide-react";
import { ExecModeBadge } from "@/components/status-badge";
import type { WizardState } from "./page";

interface Props {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
}

export function StepThreeScreen({ state, setState }: Props) {
  const { environment } = useApp();

  return (
    <div className="space-y-6">
      {/* Summary card */}
      <section className="rounded-lg border bg-white p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">実行内容の確認</h2>

        <div className="space-y-3">
          {/* Exec mode */}
          <SummaryRow
            icon={Calendar}
            label="実行モード"
            value={<ExecModeBadge mode={state.execMode} />}
          />

          {/* File */}
          <SummaryRow
            icon={FileSpreadsheet}
            label="Excel ファイル"
            value={
              <span className="text-sm">{state.file?.name ?? "未選択"}</span>
            }
          />

          {/* Facility */}
          <SummaryRow
            icon={Building2}
            label="施設"
            value={
              <span className="text-sm">
                {state.facility
                  ? `${state.facility.name} (${state.facility.lincoln_id})`
                  : "未選択"}
              </span>
            }
          />

          {/* Environment */}
          <SummaryRow
            icon={AlertTriangle}
            label="環境"
            value={
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${
                  environment === "production"
                    ? "bg-red-100 text-red-700"
                    : "bg-blue-100 text-blue-700"
                }`}
              >
                {environment === "production" ? "本番" : "検証"}
              </span>
            }
          />

          {/* Calendar mappings */}
          {state.execMode !== "B_only" && (
            <>
              <SummaryRow
                icon={Calendar}
                label="カレンダーマッピング"
                value={
                  <span className="text-sm text-slate-600">
                    {state.calendarMappings.length} 件
                  </span>
                }
              />
              {state.calendarMappings.length > 0 && (
                <div className="ml-6 space-y-1">
                  {state.calendarMappings.map((m, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-xs text-slate-500"
                    >
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">
                        {m.lincoln_calendar_id}
                      </span>
                      <span className="text-slate-400">←</span>
                      <span>{m.excel_calendar}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Process B rows */}
          {state.execMode !== "A_only" && (
            <>
              <SummaryRow
                icon={ListChecks}
                label="処理B マッピング"
                value={
                  <span className="text-sm text-slate-600">
                    {state.processBRows.filter((r) => r.copy_source).length} 件
                  </span>
                }
              />
              {state.processBRows.filter((r) => r.copy_source).length > 0 && (
                <div className="ml-6 space-y-1">
                  {state.processBRows
                    .filter((r) => r.copy_source)
                    .map((r, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs text-slate-500"
                      >
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">
                          {r.copy_source}
                        </span>
                        <span className="text-slate-400">→</span>
                        <span>{r.plan_group_set}</span>
                      </div>
                    ))}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Retry count */}
      <section className="rounded-lg border bg-white p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">リトライ回数</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() =>
              setState((s) => ({
                ...s,
                retryCount: Math.max(0, s.retryCount - 1),
              }))
            }
            className="rounded-lg border p-2 hover:bg-slate-50"
          >
            <Minus className="size-4" />
          </button>
          <span className="w-8 text-center text-lg font-semibold">
            {state.retryCount}
          </span>
          <button
            onClick={() =>
              setState((s) => ({
                ...s,
                retryCount: Math.min(10, s.retryCount + 1),
              }))
            }
            className="rounded-lg border p-2 hover:bg-slate-50"
          >
            <Plus className="size-4" />
          </button>
          <span className="text-xs text-slate-500">
            各ステップの失敗時に自動リトライ
          </span>
        </div>
      </section>

      {/* Warning */}
      {environment === "production" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-700 space-y-1">
          <p className="flex items-center gap-1 font-semibold">
            <AlertTriangle className="size-4" />
            本番環境での実行
          </p>
          <p>
            本番環境で実行します。リンカーンの実際のカレンダー・プランに反映されます。
            実行前に設定内容を十分にご確認ください。
          </p>
        </div>
      )}
    </div>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Calendar;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0 last:pb-0">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Icon className="size-4" />
        {label}
      </div>
      {value}
    </div>
  );
}
