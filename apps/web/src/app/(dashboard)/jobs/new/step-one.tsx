"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/context/app-context";
import {
  Upload,
  FileSpreadsheet,
  X,
  Building2,
  Check,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
  FolderOpen,
} from "lucide-react";
import { extractRoomTypes, extractFacilityName } from "@/lib/parse-excel-client";
import {
  fetchFacilityCalendars,
  requestCalendarSync,
  getSyncRequestStatus,
  loadPatterns,
  saveCalendarPattern,
  deleteCalendarPattern,
} from "./actions";
import type { WizardState } from "./page";
import type { ExecMode, Facility, CalendarPattern } from "@/lib/types/database";

type SyncStatus = "idle" | "syncing" | "done" | "error";

interface Props {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
}

export function StepOneScreen({ state, setState }: Props) {
  const { facilities } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lincolnCalendars, setLincolnCalendars] = useState<string[]>([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pattern save/load
  const [savedPatterns, setSavedPatterns] = useState<CalendarPattern[]>([]);
  const [selectedPatternId, setSelectedPatternId] = useState<string>("");
  const [patternName, setPatternName] = useState("");
  const [savingPattern, setSavingPattern] = useState(false);

  const MAX_PATTERNS = 5;

  // Fetch Lincoln calendars when facility changes
  useEffect(() => {
    if (!state.facility) {
      setLincolnCalendars([]);
      return;
    }
    let cancelled = false;
    setLoadingCalendars(true);
    fetchFacilityCalendars(state.facility.id)
      .then((cals) => {
        if (!cancelled) setLincolnCalendars(cals);
      })
      .catch(() => {
        if (!cancelled) setLincolnCalendars([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingCalendars(false);
      });
    return () => { cancelled = true; };
  }, [state.facility?.id]);

  // Cleanup sync polling on unmount
  useEffect(() => {
    return () => {
      if (syncPollRef.current) clearInterval(syncPollRef.current);
    };
  }, []);

  // Load saved patterns when facility changes
  useEffect(() => {
    if (!state.facility) {
      setSavedPatterns([]);
      setSelectedPatternId("");
      return;
    }
    let cancelled = false;
    loadPatterns(state.facility.id)
      .then(({ calendarPatterns }) => {
        if (!cancelled) {
          setSavedPatterns(calendarPatterns as CalendarPattern[]);
          // Auto-select default pattern
          const def = (calendarPatterns as CalendarPattern[]).find((p) => p.is_default);
          if (def) {
            setSelectedPatternId(def.id);
            setPatternName(def.name);
            setState((s) => ({ ...s, calendarMappings: def.mappings }));
          } else {
            setSelectedPatternId("");
            setPatternName("");
          }
        }
      })
      .catch(() => {
        if (!cancelled) setSavedPatterns([]);
      });
    return () => { cancelled = true; };
  }, [state.facility?.id]);

  /** Reload patterns from DB */
  const refreshPatterns = useCallback(async () => {
    if (!state.facility) return;
    const { calendarPatterns } = await loadPatterns(state.facility.id);
    setSavedPatterns(calendarPatterns as CalendarPattern[]);
  }, [state.facility]);

  /** Load a pattern's mappings into the wizard state */
  const handleLoadPattern = useCallback(
    (patternId: string) => {
      setSelectedPatternId(patternId);
      if (!patternId) {
        setPatternName("");
        return;
      }
      const pattern = savedPatterns.find((p) => p.id === patternId);
      if (pattern) {
        setPatternName(pattern.name);
        setState((s) => ({ ...s, calendarMappings: pattern.mappings }));
      }
    },
    [savedPatterns, setState],
  );

  /** Save current mappings as a pattern */
  const handleSavePattern = useCallback(async () => {
    if (!state.facility || !patternName.trim()) return;
    if (state.calendarMappings.length === 0) return;

    // Check max limit (only for new patterns)
    const isUpdate = savedPatterns.some((p) => p.id === selectedPatternId);
    if (!isUpdate && savedPatterns.length >= MAX_PATTERNS) return;

    setSavingPattern(true);
    try {
      await saveCalendarPattern({
        facility_id: state.facility.id,
        name: patternName.trim(),
        is_default: false,
        mappings: state.calendarMappings,
        ...(isUpdate ? { id: selectedPatternId } : {}),
      });
      await refreshPatterns();
    } catch {
      // Error handling — could add toast here
    } finally {
      setSavingPattern(false);
    }
  }, [state.facility, state.calendarMappings, patternName, selectedPatternId, savedPatterns, refreshPatterns]);

  /** Delete a saved pattern */
  const handleDeletePattern = useCallback(async () => {
    if (!selectedPatternId) return;
    setSavingPattern(true);
    try {
      await deleteCalendarPattern(selectedPatternId);
      setSelectedPatternId("");
      setPatternName("");
      await refreshPatterns();
    } catch {
      // Error handling
    } finally {
      setSavingPattern(false);
    }
  }, [selectedPatternId, refreshPatterns]);

  /** Trigger calendar sync from Lincoln */
  const handleSyncCalendars = useCallback(async () => {
    if (!state.facility) return;
    setSyncStatus("syncing");
    setSyncError(null);

    try {
      const { id: reqId } = await requestCalendarSync(state.facility.id);

      // Poll for completion every 3 seconds
      const facilityId = state.facility.id;
      syncPollRef.current = setInterval(async () => {
        try {
          const result = await getSyncRequestStatus(reqId);
          if (result.status === "DONE") {
            if (syncPollRef.current) clearInterval(syncPollRef.current);
            syncPollRef.current = null;
            setSyncStatus("done");
            // Refresh calendars
            const cals = await fetchFacilityCalendars(facilityId);
            setLincolnCalendars(cals);
            // Reset status after 3 seconds
            setTimeout(() => setSyncStatus("idle"), 3000);
          } else if (result.status === "ERROR") {
            if (syncPollRef.current) clearInterval(syncPollRef.current);
            syncPollRef.current = null;
            setSyncStatus("error");
            setSyncError(result.error_message || "同期に失敗しました");
          }
          // PENDING/RUNNING — keep polling
        } catch {
          // Ignore transient errors during polling
        }
      }, 3000);
    } catch (err) {
      setSyncStatus("error");
      setSyncError(err instanceof Error ? err.message : "同期リクエストに失敗しました");
    }
  }, [state.facility]);

  /** Parse Excel and extract room types + auto-select facility from filename */
  const parseAndSetFile = useCallback(
    async (file: File) => {
      setState((s) => ({ ...s, file, uploadedPath: null }));

      // Auto-select facility from filename (e.g. 【畳の宿那覇壺屋様】→ match)
      const facName = extractFacilityName(file.name);
      let matchedFacility: Facility | null = null;
      if (facName) {
        const normalized = facName.replace(/\s/g, "");
        matchedFacility =
          facilities.find((f) => f.name.replace(/\s/g, "") === normalized) ??
          facilities.find((f) => normalized.includes(f.name.replace(/\s/g, "")) || f.name.replace(/\s/g, "").includes(normalized)) ??
          null;
      }

      try {
        const roomTypes = await extractRoomTypes(file);
        setState((s) => ({
          ...s,
          file,
          uploadedPath: null,
          facility: matchedFacility ?? s.facility,
          calendarMappings: roomTypes.map((name) => ({
            excel_calendar: name,
            lincoln_calendar_id: "",
          })),
        }));
      } catch {
        setState((s) => ({
          ...s,
          file,
          uploadedPath: null,
          facility: matchedFacility ?? s.facility,
        }));
      }
    },
    [setState, facilities]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith(".xlsx")) {
        parseAndSetFile(file);
      }
    },
    [parseAndSetFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        parseAndSetFile(file);
      }
    },
    [parseAndSetFile]
  );

  function setExecMode(mode: ExecMode) {
    setState((s) => ({ ...s, execMode: mode }));
  }

  function setFacility(facility: Facility) {
    setState((s) => ({ ...s, facility }));
  }

  function removeFile() {
    setState((s) => ({ ...s, file: null, uploadedPath: null, originalName: null, calendarMappings: [] }));
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
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">
              カレンダーマッピング
            </h2>
            <div className="flex items-center gap-2">
              {lincolnCalendars.length > 0 && (
                <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">
                  {lincolnCalendars.length} カレンダー取得済み
                </span>
              )}
              {state.facility && (
                <button
                  onClick={handleSyncCalendars}
                  disabled={syncStatus === "syncing"}
                  className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                    syncStatus === "syncing"
                      ? "border-slate-200 bg-slate-50 text-slate-400 cursor-wait"
                      : syncStatus === "done"
                        ? "border-green-300 bg-green-50 text-green-700"
                        : syncStatus === "error"
                          ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                          : "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                  }`}
                >
                  {syncStatus === "syncing" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : syncStatus === "done" ? (
                    <Check className="size-3" />
                  ) : (
                    <RefreshCw className="size-3" />
                  )}
                  {syncStatus === "syncing"
                    ? "リンカーンから取得中..."
                    : syncStatus === "done"
                      ? "取得完了"
                      : "リンカーンから取得"}
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Excel のカレンダー名とリンカーンのカレンダーを紐付けます。
            {lincolnCalendars.length === 0 && state.facility && !loadingCalendars && syncStatus === "idle" && (
              <span className="text-amber-600">
                {" "}カレンダー未取得です。「リンカーンから取得」ボタンをクリックしてください。
              </span>
            )}
          </p>
          {syncStatus === "error" && syncError && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {syncError}
            </div>
          )}
          {syncStatus === "syncing" && (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Runner がリンカーンからカレンダー情報を取得しています。Runner が起動していることを確認してください。
            </div>
          )}

          {loadingCalendars && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="size-3 animate-spin" />
              カレンダー読み込み中...
            </div>
          )}

          {/* Pattern save/load bar */}
          {state.facility && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <FolderOpen className="size-3.5" />
                保存済みパターン ({savedPatterns.length}/{MAX_PATTERNS})
              </div>
              <div className="flex items-center gap-2">
                {/* Pattern selector */}
                <select
                  value={selectedPatternId}
                  onChange={(e) => handleLoadPattern(e.target.value)}
                  className="min-w-0 flex-1 rounded border bg-white px-2 py-1.5 text-sm"
                >
                  <option value="">パターンを選択...</option>
                  {savedPatterns.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.is_default ? " (デフォルト)" : ""}
                      {` (${p.mappings.length}件)`}
                    </option>
                  ))}
                </select>
                {/* Delete button */}
                {selectedPatternId && (
                  <button
                    onClick={handleDeletePattern}
                    disabled={savingPattern}
                    className="shrink-0 rounded border border-red-200 bg-white p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-50"
                    title="パターンを削除"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
              {/* Save bar */}
              {state.calendarMappings.length > 0 && (
                <div className="flex items-center gap-2">
                  <input
                    value={patternName}
                    onChange={(e) => setPatternName(e.target.value)}
                    placeholder="パターン名を入力"
                    maxLength={50}
                    className="min-w-0 flex-1 rounded border px-2 py-1.5 text-sm"
                  />
                  <button
                    onClick={handleSavePattern}
                    disabled={
                      savingPattern ||
                      !patternName.trim() ||
                      (!savedPatterns.some((p) => p.id === selectedPatternId) &&
                        savedPatterns.length >= MAX_PATTERNS)
                    }
                    className="flex shrink-0 items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                  >
                    {savingPattern ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Save className="size-3" />
                    )}
                    {savedPatterns.some((p) => p.id === selectedPatternId)
                      ? "上書き保存"
                      : "新規保存"}
                  </button>
                </div>
              )}
              {!savedPatterns.some((p) => p.id === selectedPatternId) &&
                savedPatterns.length >= MAX_PATTERNS && (
                  <p className="text-[10px] text-amber-600">
                    保存上限 ({MAX_PATTERNS}件) に達しています。既存のパターンを削除してください。
                  </p>
                )}
            </div>
          )}

          {state.calendarMappings.length > 0 ? (
            <div className="space-y-2">
              {state.calendarMappings.map((m, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded border p-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate text-slate-700">
                    {m.excel_calendar || "(未設定)"}
                  </span>
                  <span className="shrink-0 text-slate-400">→</span>
                  {lincolnCalendars.length > 0 ? (
                    <select
                      value={m.lincoln_calendar_id}
                      onChange={(e) => {
                        const next = [...state.calendarMappings];
                        next[i] = { ...next[i], lincoln_calendar_id: e.target.value };
                        setState((s) => ({ ...s, calendarMappings: next }));
                      }}
                      className="min-w-0 flex-1 rounded border bg-white px-2 py-1 text-sm"
                    >
                      <option value="">選択してください</option>
                      {lincolnCalendars.map((cal) => (
                        <option key={cal} value={cal}>
                          {cal}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={m.lincoln_calendar_id}
                      onChange={(e) => {
                        const next = [...state.calendarMappings];
                        next[i] = { ...next[i], lincoln_calendar_id: e.target.value };
                        setState((s) => ({ ...s, calendarMappings: next }));
                      }}
                      placeholder="リンカーンカレンダー名"
                      className="min-w-0 flex-1 rounded border px-2 py-1 text-sm"
                    />
                  )}
                  <button
                    onClick={() => {
                      setState((s) => ({
                        ...s,
                        calendarMappings: s.calendarMappings.filter(
                          (_, idx) => idx !== i
                        ),
                      }));
                    }}
                    className="shrink-0 rounded p-1 text-slate-400 hover:text-red-500"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              Excel ファイルをアップロードすると自動的に追加されます。
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
