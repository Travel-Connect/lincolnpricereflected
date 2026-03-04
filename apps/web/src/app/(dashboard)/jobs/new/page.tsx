"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/context/app-context";
import { toast } from "sonner";
import type {
  ExecMode,
  Facility,
  CalendarMappingRow,
  ProcessBMappingRow,
} from "@/lib/types/database";
import { uploadExcel, createJob } from "./actions";
import { StepOneScreen } from "./step-one";
import { StepTwoScreen } from "./step-two";
import { StepThreeScreen } from "./step-three";

export interface WizardState {
  execMode: ExecMode;
  file: File | null;
  uploadedPath: string | null;
  originalName: string | null;
  facility: Facility | null;
  stayType: "A" | "B" | null;
  calendarMappings: CalendarMappingRow[];
  processBRows: ProcessBMappingRow[];
  retryCount: number;
  targetMachine: string;
}

const INITIAL_STATE: WizardState = {
  execMode: "A_and_B",
  file: null,
  uploadedPath: null,
  originalName: null,
  facility: null,
  stayType: null,
  calendarMappings: [],
  processBRows: [{ copy_source: "", plan_group_set: "", plan_name: "" }],
  retryCount: 3,
  targetMachine: "",
};

const USER_DEFAULT_MACHINE: Record<string, string> = {
  "tc.kamizato@gmail.com": "KAMIZATO-MAIN",
  "s-funakoshi@travel-connect.jp": "FUNAKOSHI-DESK",
  "r-tamashiro@travel-connect.jp": "TAMASHIRO",
};

export default function NewJobPage() {
  const router = useRouter();
  const { environment, user, runners } = useApp();
  const [screen, setScreen] = useState(0);
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [submitting, setSubmitting] = useState(false);

  // Auto-select default Runner PC based on logged-in user
  useEffect(() => {
    if (state.targetMachine) return;
    const email = user.email ?? "";
    const defaultMachine = USER_DEFAULT_MACHINE[email];
    if (defaultMachine && runners.some((r) => r.machine_name === defaultMachine)) {
      setState((s) => ({ ...s, targetMachine: defaultMachine }));
    }
  }, [user.email, runners, state.targetMachine]);

  const screens = getScreens(state.execMode);
  const currentScreenLabel = screens[screen];

  function canGoNext(): boolean {
    if (currentScreenLabel === "process_a") {
      return !!(state.file && state.facility);
    }
    if (currentScreenLabel === "process_b") {
      return state.processBRows.some(
        (r) => r.copy_source && r.plan_group_set
      );
    }
    return true;
  }

  function handleNext() {
    if (!canGoNext()) return;
    setScreen((s) => Math.min(s + 1, screens.length - 1));
  }

  function handleBack() {
    setScreen((s) => Math.max(s - 1, 0));
  }

  async function handleExecute() {
    if (!state.targetMachine) {
      toast.error("Runner PC を選択してください");
      return;
    }
    if (!state.facility || !state.file) return;
    setSubmitting(true);

    try {
      let path = state.uploadedPath;
      let originalName = state.originalName;
      if (!path) {
        const formData = new FormData();
        formData.append("file", state.file);
        const result = await uploadExcel(formData);
        path = result.path;
        originalName = result.originalName;
      }

      const result = await createJob({
        facility_id: state.facility.id,
        execution_mode: state.execMode,
        environment,
        excel_file_path: path!,
        excel_original_name: originalName ?? state.file.name,
        stay_type: state.stayType,
        config_json: {
          calendar_mappings: state.calendarMappings,
          process_b_rows: state.processBRows,
        },
        retry_count: state.retryCount,
        target_machine: state.targetMachine,
      });

      // Navigate to job detail page
      router.push(`/jobs/${result.id}`);
    } catch (err) {
      toast.error(
        `ジョブ作成に失敗しました: ${err instanceof Error ? err.message : "不明なエラー"}`
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Progress indicator */}
      <div className="flex items-center gap-2">
        {screens.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            {i > 0 && <div className="h-px w-8 bg-slate-200" />}
            <button
              onClick={() => i < screen && setScreen(i)}
              disabled={i > screen}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                i === screen
                  ? "bg-indigo-600 text-white"
                  : i < screen
                    ? "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                    : "bg-slate-100 text-slate-400"
              }`}
            >
              <span>{i + 1}</span>
              <span>{screenLabels[label]}</span>
            </button>
          </div>
        ))}
      </div>

      {/* Screen content */}
      {currentScreenLabel === "process_a" && (
        <StepOneScreen state={state} setState={setState} />
      )}
      {currentScreenLabel === "process_b" && (
        <StepTwoScreen state={state} setState={setState} />
      )}
      {currentScreenLabel === "confirm" && (
        <StepThreeScreen state={state} setState={setState} />
      )}

      {/* Navigation buttons */}
      <div className="flex items-center justify-between border-t pt-4">
        <button
          onClick={screen === 0 ? () => router.push("/history") : handleBack}
          className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
        >
          {screen === 0 ? "キャンセル" : "戻る"}
        </button>
        <div className="flex gap-2">
          {screen < screens.length - 1 ? (
            <button
              onClick={handleNext}
              disabled={!canGoNext()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              次へ
            </button>
          ) : (
            <button
              onClick={handleExecute}
              disabled={submitting || !canGoNext()}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {submitting ? "実行中..." : "実行開始"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const screenLabels: Record<string, string> = {
  process_a: "ファイル・カレンダー設定",
  process_b: "一括送信設定",
  confirm: "確認・実行",
};

function getScreens(execMode: ExecMode): string[] {
  switch (execMode) {
    case "A_only":
      return ["process_a", "confirm"];
    case "B_only":
      return ["process_a", "process_b", "confirm"];
    case "A_and_B":
      return ["process_a", "process_b", "confirm"];
  }
}
