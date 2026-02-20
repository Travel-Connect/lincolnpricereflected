"use client";

import { useCallback, useRef } from "react";
import { useApp } from "@/lib/context/app-context";
import {
  Upload,
  FileSpreadsheet,
  X,
  Building2,
  Check,
} from "lucide-react";
import type { WizardState } from "./page";
import type { ExecMode, Facility } from "@/lib/types/database";

interface Props {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
}

export function StepOneScreen({ state, setState }: Props) {
  const { facilities } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith(".xlsx")) {
        setState((s) => ({ ...s, file, uploadedPath: null }));
      }
    },
    [setState]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        setState((s) => ({ ...s, file, uploadedPath: null }));
      }
    },
    [setState]
  );

  function setExecMode(mode: ExecMode) {
    setState((s) => ({ ...s, execMode: mode }));
  }

  function setFacility(facility: Facility) {
    setState((s) => ({ ...s, facility }));
  }

  function removeFile() {
    setState((s) => ({ ...s, file: null, uploadedPath: null, originalName: null }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="space-y-6">
      {/* Exec Mode */}
      <section className="rounded-lg border bg-white p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">実行モード</h2>
        <div className="flex gap-2">
          {execModeOptions.map(({ value, label, desc }) => (
            <button
              key={value}
              onClick={() => setExecMode(value)}
              className={`flex-1 rounded-lg border p-3 text-left transition-colors ${
                state.execMode === value
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className="flex items-center gap-2">
                {state.execMode === value && (
                  <Check className="size-4 text-indigo-600" />
                )}
                <span className="text-sm font-medium">{label}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{desc}</p>
            </button>
          ))}
        </div>
      </section>

      {/* File Upload */}
      <section className="rounded-lg border bg-white p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">
          Excel ファイル
        </h2>
        {state.file ? (
          <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="size-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-800">
                  {state.file.name}
                </p>
                <p className="text-xs text-green-600">
                  {(state.file.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
            <button
              onClick={removeFile}
              className="rounded p-1 text-green-600 hover:bg-green-100"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-6 py-10 text-center transition-colors hover:border-indigo-400 hover:bg-indigo-50/50"
          >
            <Upload className="size-8 text-slate-400" />
            <p className="text-sm text-slate-600">
              ここにファイルをドロップ、またはクリックして選択
            </p>
            <p className="text-xs text-slate-400">.xlsx ファイルのみ</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        )}
      </section>

      {/* Facility Selection */}
      <section className="rounded-lg border bg-white p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">施設選択</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {facilities.map((f) => (
            <button
              key={f.id}
              onClick={() => setFacility(f)}
              className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                state.facility?.id === f.id
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <Building2
                className={`size-4 ${
                  state.facility?.id === f.id
                    ? "text-indigo-600"
                    : "text-slate-400"
                }`}
              />
              <div>
                <p className="text-sm font-medium">{f.name}</p>
                <p className="text-xs text-slate-400">{f.lincoln_id}</p>
              </div>
            </button>
          ))}
        </div>
        {facilities.length === 0 && (
          <p className="text-sm text-slate-400">
            施設が登録されていません。設定ページで追加してください。
          </p>
        )}
      </section>

      {/* Calendar Mappings (shown only for A_only or A_and_B) */}
      {state.execMode !== "B_only" && (
        <section className="rounded-lg border bg-white p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">
            カレンダーマッピング
          </h2>
          <p className="text-xs text-slate-500">
            Excel のカレンダー名とリンカーンのカレンダーを紐付けます。
            施設選択後、リンカーンからカレンダー一覧を取得できます。
          </p>
          {state.calendarMappings.length > 0 ? (
            <div className="space-y-2">
              {state.calendarMappings.map((m, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded border p-2 text-sm"
                >
                  <span className="flex-1 text-slate-700">
                    {m.excel_calendar}
                  </span>
                  <span className="text-slate-400">→</span>
                  <input
                    value={m.lincoln_calendar_id}
                    onChange={(e) => {
                      const next = [...state.calendarMappings];
                      next[i] = { ...next[i], lincoln_calendar_id: e.target.value };
                      setState((s) => ({ ...s, calendarMappings: next }));
                    }}
                    placeholder="リンカーンカレンダーID"
                    className="flex-1 rounded border px-2 py-1 text-sm"
                  />
                  <button
                    onClick={() => {
                      setState((s) => ({
                        ...s,
                        calendarMappings: s.calendarMappings.filter(
                          (_, idx) => idx !== i
                        ),
                      }));
                    }}
                    className="rounded p-1 text-slate-400 hover:text-red-500"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              マッピングはまだ設定されていません。Excel
              解析後に自動的に追加されるか、手動で追加できます。
            </p>
          )}
          <button
            onClick={() =>
              setState((s) => ({
                ...s,
                calendarMappings: [
                  ...s.calendarMappings,
                  { excel_calendar: "", lincoln_calendar_id: "" },
                ],
              }))
            }
            className="text-xs text-indigo-600 hover:text-indigo-700"
          >
            + マッピングを追加
          </button>
        </section>
      )}
    </div>
  );
}

const execModeOptions: {
  value: ExecMode;
  label: string;
  desc: string;
}[] = [
  {
    value: "A_and_B",
    label: "A + B",
    desc: "カレンダーマッピング + 一括料金反映",
  },
  {
    value: "A_only",
    label: "A のみ",
    desc: "カレンダーマッピングのみ（STEP0）",
  },
  {
    value: "B_only",
    label: "B のみ",
    desc: "一括料金反映のみ（STEPB）",
  },
];
