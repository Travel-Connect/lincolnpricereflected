"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/context/app-context";
import {
  Plus,
  Trash2,
  Save,
  FolderOpen,
  Loader2,
  RefreshCw,
  Check,
} from "lucide-react";
import {
  fetchFacilityCalendars,
  fetchFacilityPlanGroupNames,
  fetchFacilityPlanNames,
  requestCalendarSync,
  getSyncRequestStatus,
  loadPatterns,
  saveProcessBPattern,
  deleteProcessBPattern,
} from "./actions";
import type { WizardState } from "./page";
import type { ProcessBMappingRow, ProcessBPattern } from "@/lib/types/database";

type SyncStatus = "idle" | "syncing" | "done" | "error";

interface Props {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
}

export function StepTwoScreen({ state, setState }: Props) {
  const { facilities } = useApp();

  // Lincoln data from DB
  const [lincolnCalendars, setLincolnCalendars] = useState<string[]>([]);
  const [planGroupNames, setPlanGroupNames] = useState<string[]>([]);
  const [planNamesBySet, setPlanNamesBySet] = useState<Record<string, string[]>>({});
  const [loadingData, setLoadingData] = useState(false);

  // Sync status
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pattern save/load
  const [savedPatterns, setSavedPatterns] = useState<ProcessBPattern[]>([]);
  const [selectedPatternId, setSelectedPatternId] = useState<string>("");
  const [patternName, setPatternName] = useState("");
  const [savingPattern, setSavingPattern] = useState(false);

  const MAX_PATTERNS = 5;

  // Fetch Lincoln calendars + plan group names + plan names when facility changes
  useEffect(() => {
    if (!state.facility) {
      setLincolnCalendars([]);
      setPlanGroupNames([]);
      setPlanNamesBySet({});
      return;
    }
    let cancelled = false;
    setLoadingData(true);
    Promise.all([
      fetchFacilityCalendars(state.facility.id),
      fetchFacilityPlanGroupNames(state.facility.id),
      fetchFacilityPlanNames(state.facility.id),
    ])
      .then(([cals, pgs, pns]) => {
        if (!cancelled) {
          setLincolnCalendars(cals);
          setPlanGroupNames(pgs);
          setPlanNamesBySet(pns);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLincolnCalendars([]);
          setPlanGroupNames([]);
          setPlanNamesBySet({});
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingData(false);
      });
    return () => { cancelled = true; };
  }, [state.facility?.id]);

  // Load saved patterns when facility changes
  useEffect(() => {
    if (!state.facility) {
      setSavedPatterns([]);
      setSelectedPatternId("");
      return;
    }
    let cancelled = false;
    const facilityId = state.facility.id;
    loadPatterns(facilityId)
      .then(({ processBPatterns }) => {
        if (cancelled) return;
        const patterns = processBPatterns as ProcessBPattern[];
        setSavedPatterns(patterns);

        // Auto-select: last used (localStorage) > is_default > none
        const lastUsedId = localStorage.getItem(`lincoln_last_patternB_${facilityId}`);
        const lastUsed = lastUsedId ? patterns.find((p) => p.id === lastUsedId) : null;
        const target = lastUsed ?? patterns.find((p) => p.is_default) ?? null;

        if (target) {
          setSelectedPatternId(target.id);
          setPatternName(target.name);
          setState((s) => ({ ...s, processBRows: target.rows }));
        } else {
          setSelectedPatternId("");
          setPatternName("");
        }
      })
      .catch(() => {
        if (!cancelled) setSavedPatterns([]);
      });
    return () => { cancelled = true; };
  }, [state.facility?.id]);

  // Cleanup sync polling on unmount
  useEffect(() => {
    return () => {
      if (syncPollRef.current) clearInterval(syncPollRef.current);
    };
  }, []);

  /** Reload patterns from DB */
  const refreshPatterns = useCallback(async () => {
    if (!state.facility) return;
    const { processBPatterns } = await loadPatterns(state.facility.id);
    setSavedPatterns(processBPatterns as ProcessBPattern[]);
  }, [state.facility]);

  /** Load a pattern's rows into wizard state */
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
        setState((s) => ({ ...s, processBRows: pattern.rows }));
        // Remember last used pattern per facility
        if (state.facility) {
          localStorage.setItem(`lincoln_last_patternB_${state.facility.id}`, patternId);
        }
      }
    },
    [savedPatterns, setState, state.facility],
  );

  /** Save current rows as a pattern */
  const handleSavePattern = useCallback(async () => {
    if (!state.facility || !patternName.trim()) return;
    if (state.processBRows.length === 0) return;

    const isUpdate = savedPatterns.some((p) => p.id === selectedPatternId);
    if (!isUpdate && savedPatterns.length >= MAX_PATTERNS) return;

    setSavingPattern(true);
    try {
      const saved = await saveProcessBPattern({
        facility_id: state.facility.id,
        name: patternName.trim(),
        is_default: false,
        rows: state.processBRows,
        ...(isUpdate ? { id: selectedPatternId } : {}),
      });
      await refreshPatterns();
      // Remember as last used pattern
      const savedId = saved?.id ?? selectedPatternId;
      if (savedId) {
        localStorage.setItem(`lincoln_last_patternB_${state.facility.id}`, savedId);
        setSelectedPatternId(savedId);
      }
    } catch {
      // Error handling
    } finally {
      setSavingPattern(false);
    }
  }, [state.facility, state.processBRows, patternName, selectedPatternId, savedPatterns, refreshPatterns]);

  /** Delete a saved pattern */
  const handleDeletePattern = useCallback(async () => {
    if (!selectedPatternId) return;
    setSavingPattern(true);
    try {
      await deleteProcessBPattern(selectedPatternId);
      setSelectedPatternId("");
      setPatternName("");
      await refreshPatterns();
    } catch {
      // Error handling
    } finally {
      setSavingPattern(false);
    }
  }, [selectedPatternId, refreshPatterns]);

  /** Trigger sync from Lincoln (reuses calendar sync which now also scrapes 5050) */
  const handleSync = useCallback(async () => {
    if (!state.facility) return;
    setSyncStatus("syncing");
    setSyncError(null);

    try {
      const { id: reqId } = await requestCalendarSync(state.facility.id, state.targetMachine || undefined);
      const facilityId = state.facility.id;

      syncPollRef.current = setInterval(async () => {
        try {
          const result = await getSyncRequestStatus(reqId);
          if (result.status === "DONE") {
            if (syncPollRef.current) clearInterval(syncPollRef.current);
            syncPollRef.current = null;
            setSyncStatus("done");
            // Refresh calendars, plan group names, and plan names
            const [cals, pgs, pns] = await Promise.all([
              fetchFacilityCalendars(facilityId),
              fetchFacilityPlanGroupNames(facilityId),
              fetchFacilityPlanNames(facilityId),
            ]);
            setLincolnCalendars(cals);
            setPlanGroupNames(pgs);
            setPlanNamesBySet(pns);
            setTimeout(() => setSyncStatus("idle"), 3000);
          } else if (result.status === "ERROR") {
            if (syncPollRef.current) clearInterval(syncPollRef.current);
            syncPollRef.current = null;
            setSyncStatus("error");
            setSyncError(result.error_message || "同期に失敗しました");
          }
        } catch {
          // Ignore transient errors during polling
        }
      }, 3000);
    } catch (err) {
      setSyncStatus("error");
      setSyncError(err instanceof Error ? err.message : "同期リクエストに失敗しました");
    }
  }, [state.facility]);

  function updateRow(index: number, field: keyof ProcessBMappingRow, value: string) {
    setState((s) => {
      const next = [...s.processBRows];
      next[index] = { ...next[index], [field]: value };
      // Clear plan_name when plan_group_set changes (available options differ)
      if (field === "plan_group_set") {
        next[index] = { ...next[index], plan_name: "" };
      }
      return { ...s, processBRows: next };
    });
  }

  function addRow() {
    setState((s) => ({
      ...s,
      processBRows: [
        ...s.processBRows,
        { copy_source: "", plan_group_set: "", plan_name: "" },
      ],
    }));
  }

  function removeRow(index: number) {
    setState((s) => ({
      ...s,
      processBRows: s.processBRows.filter((_, i) => i !== index),
    }));
  }

  const totalPlanNames = Object.values(planNamesBySet).reduce((sum, arr) => sum + arr.length, 0);
  const hasDropdowns = lincolnCalendars.length > 0 || planGroupNames.length > 0;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">
              処理B マッピング
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              コピー元カレンダーからプラングループセットへの反映設定を行います。
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasDropdowns && (
              <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">
                {lincolnCalendars.length} カレンダー / {planGroupNames.length} PGS / {totalPlanNames} プラン
              </span>
            )}
            {state.facility && (
              <button
                onClick={handleSync}
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

        {syncStatus === "error" && syncError && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {syncError}
          </div>
        )}
        {syncStatus === "syncing" && (
          <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Runner がリンカーンからデータを取得しています。Runner が起動していることを確認してください。
          </div>
        )}

        {loadingData && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="size-3 animate-spin" />
            データ読み込み中...
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
                    {` (${p.rows.length}件)`}
                  </option>
                ))}
              </select>
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
            {state.processBRows.some((r) => r.copy_source || r.plan_group_set) && (
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

        {/* Table header */}
        <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-xs font-medium text-slate-500 px-1">
          <span>コピー元カレンダー</span>
          <span>プラングループセット</span>
          <span>プラン名</span>
          <span className="w-8" />
        </div>

        {/* Rows */}
        <div className="space-y-2">
          {state.processBRows.map((row, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center"
            >
              {/* Copy source — dropdown or text input */}
              {lincolnCalendars.length > 0 ? (
                <select
                  value={row.copy_source}
                  onChange={(e) => updateRow(i, "copy_source", e.target.value)}
                  className="rounded-lg border bg-white px-3 py-2 text-sm"
                >
                  <option value="">選択...</option>
                  {lincolnCalendars.map((cal) => (
                    <option key={cal} value={cal}>
                      {cal}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={row.copy_source}
                  onChange={(e) => updateRow(i, "copy_source", e.target.value)}
                  placeholder="テストカレンダー"
                  className="rounded-lg border px-3 py-2 text-sm"
                />
              )}
              {/* Plan group set — dropdown or text input */}
              {planGroupNames.length > 0 ? (
                <select
                  value={row.plan_group_set}
                  onChange={(e) =>
                    updateRow(i, "plan_group_set", e.target.value)
                  }
                  className="rounded-lg border bg-white px-3 py-2 text-sm"
                >
                  <option value="">選択...</option>
                  {planGroupNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={row.plan_group_set}
                  onChange={(e) =>
                    updateRow(i, "plan_group_set", e.target.value)
                  }
                  placeholder="カレンダーテスト"
                  className="rounded-lg border px-3 py-2 text-sm"
                />
              )}
              {/* Plan name — dropdown filtered by selected plan_group_set, or text input */}
              {(planNamesBySet[row.plan_group_set]?.length ?? 0) > 0 ? (
                <select
                  value={row.plan_name}
                  onChange={(e) => updateRow(i, "plan_name", e.target.value)}
                  className="rounded-lg border bg-white px-3 py-2 text-sm"
                >
                  <option value="">選択...</option>
                  {planNamesBySet[row.plan_group_set].map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={row.plan_name}
                  onChange={(e) => updateRow(i, "plan_name", e.target.value)}
                  placeholder="(任意)"
                  className="rounded-lg border px-3 py-2 text-sm"
                />
              )}
              <button
                onClick={() => removeRow(i)}
                disabled={state.processBRows.length <= 1}
                className="rounded p-2 text-slate-400 hover:text-red-500 disabled:opacity-30"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={addRow}
          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
        >
          <Plus className="size-3" />
          行を追加
        </button>
      </section>

      {/* Safety warning for production */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-700 space-y-1">
        <p className="font-semibold">注意</p>
        <p>
          検証モードでは「カレンダーテスト」のみを対象にしてください。
          本番のプラングループセット（「〇単泊カレンダー」「□連泊カレンダー」等）に
          送信する場合は十分にご確認ください。
        </p>
      </div>
    </div>
  );
}
