"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Code2,
  Check,
  AlertTriangle,
  Copy,
  Filter,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SelectorEntry } from "./actions";

type FilterMode = "all" | "known" | "tbd";

interface Props {
  selectors: SelectorEntry[];
}

export function DeveloperClient({ selectors }: Props) {
  const [filter, setFilter] = useState<FilterMode>("all");

  const stats = useMemo(() => {
    const total = selectors.length;
    const tbd = selectors.filter((s) => s.isTBD).length;
    return { total, known: total - tbd, tbd };
  }, [selectors]);

  const filtered = useMemo(() => {
    if (filter === "known") return selectors.filter((s) => !s.isTBD);
    if (filter === "tbd") return selectors.filter((s) => s.isTBD);
    return selectors;
  }, [selectors, filter]);

  // Group by section
  const grouped = useMemo(() => {
    const map = new Map<string, SelectorEntry[]>();
    for (const s of filtered) {
      const list = map.get(s.section) ?? [];
      list.push(s);
      map.set(s.section, list);
    }
    return map;
  }, [filtered]);

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("コピーしました");
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Code2 className="size-5 text-slate-600" />
        <h1 className="text-lg font-semibold">開発者向け</h1>
        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-200">
          Engineer only
        </Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="合計" value={stats.total} color="slate" />
        <StatCard label="Known" value={stats.known} color="green" />
        <StatCard label="TBD" value={stats.tbd} color="amber" />
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="size-4 text-slate-400" />
        {(["all", "known", "tbd"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setFilter(mode)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === mode
                ? "bg-indigo-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {mode === "all" ? "すべて" : mode === "known" ? "Known" : "TBD"}
          </button>
        ))}
        <span className="text-xs text-slate-400">{filtered.length} 件</span>
      </div>

      {/* Selector table by section */}
      {Array.from(grouped.entries()).map(([section, entries]) => (
        <div key={section} className="rounded-lg border bg-white overflow-hidden">
          <div className="border-b bg-slate-50 px-4 py-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">
                {section}
              </span>
              <span className="text-xs text-slate-400">
                {entries[0]?.description}
              </span>
            </div>
          </div>
          <div className="divide-y">
            {entries.map((entry) => (
              <div
                key={`${entry.section}.${entry.key}`}
                className="flex items-center justify-between px-4 py-2.5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {entry.isTBD ? (
                    <AlertTriangle className="size-4 shrink-0 text-amber-500" />
                  ) : (
                    <Check className="size-4 shrink-0 text-green-500" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700">{entry.key}</p>
                    <p className="truncate font-mono text-xs text-green-700 bg-slate-50 rounded px-1.5 py-0.5 mt-0.5">
                      {entry.value}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => copyToClipboard(entry.value)}
                  className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  title="コピー"
                >
                  <Copy className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "slate" | "green" | "amber";
}) {
  const styles = {
    slate: "border-slate-200 bg-white",
    green: "border-green-200 bg-green-50",
    amber: "border-amber-200 bg-amber-50",
  };
  const textStyles = {
    slate: "text-slate-800",
    green: "text-green-700",
    amber: "text-amber-700",
  };

  return (
    <div className={`rounded-lg border p-4 ${styles[color]}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-bold ${textStyles[color]}`}>{value}</p>
    </div>
  );
}
