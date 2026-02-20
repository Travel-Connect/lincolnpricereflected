"use client";

import { Plus, Trash2 } from "lucide-react";
import type { WizardState } from "./page";
import type { ProcessBMappingRow } from "@/lib/types/database";

interface Props {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
}

export function StepTwoScreen({ state, setState }: Props) {
  function updateRow(index: number, field: keyof ProcessBMappingRow, value: string) {
    setState((s) => {
      const next = [...s.processBRows];
      next[index] = { ...next[index], [field]: value };
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
        </div>

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
              <input
                value={row.copy_source}
                onChange={(e) => updateRow(i, "copy_source", e.target.value)}
                placeholder="テストカレンダー"
                className="rounded-lg border px-3 py-2 text-sm"
              />
              <input
                value={row.plan_group_set}
                onChange={(e) =>
                  updateRow(i, "plan_group_set", e.target.value)
                }
                placeholder="カレンダーテスト"
                className="rounded-lg border px-3 py-2 text-sm"
              />
              <input
                value={row.plan_name}
                onChange={(e) => updateRow(i, "plan_name", e.target.value)}
                placeholder="(任意)"
                className="rounded-lg border px-3 py-2 text-sm"
              />
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
