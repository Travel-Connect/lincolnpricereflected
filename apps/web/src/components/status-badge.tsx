"use client";

import { Badge } from "@/components/ui/badge";
import {
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MinusCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { JobStatus, StepStatus } from "@/lib/types/database";

type StatusType = JobStatus | StepStatus | "SKIPPED";

const statusConfig: Record<
  StatusType,
  { label: string; icon: typeof Clock; className: string }
> = {
  PENDING: {
    label: "待機中",
    icon: Clock,
    className: "bg-slate-100 text-slate-600 border-slate-200",
  },
  RUNNING: {
    label: "実行中",
    icon: Loader2,
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  SUCCESS: {
    label: "成功",
    icon: CheckCircle2,
    className: "bg-green-50 text-green-700 border-green-200",
  },
  FAILED: {
    label: "失敗",
    icon: XCircle,
    className: "bg-red-50 text-red-700 border-red-200",
  },
  CANCELLED: {
    label: "中止",
    icon: MinusCircle,
    className: "bg-slate-100 text-slate-500 border-slate-200",
  },
  AWAITING_2FA: {
    label: "2FA待ち",
    icon: AlertTriangle,
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  SKIPPED: {
    label: "スキップ",
    icon: MinusCircle,
    className: "bg-slate-50 text-slate-400 border-slate-100",
  },
};

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.PENDING;
  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 border font-medium",
        config.className,
        className
      )}
    >
      <Icon
        className={cn("size-3", status === "RUNNING" && "animate-spin")}
      />
      {config.label}
    </Badge>
  );
}

interface StepDotProps {
  status: StepStatus | "SKIPPED";
  className?: string;
}

const dotColors: Record<StepStatus | "SKIPPED", string> = {
  PENDING: "bg-slate-300",
  RUNNING: "bg-blue-500 animate-pulse",
  SUCCESS: "bg-green-500",
  FAILED: "bg-red-500",
  SKIPPED: "bg-slate-200",
};

export function StepDot({ status, className }: StepDotProps) {
  return (
    <span
      className={cn("inline-block size-2 rounded-full", dotColors[status], className)}
      title={statusConfig[status]?.label}
    />
  );
}

interface ExecModeBadgeProps {
  mode: "A_only" | "B_only" | "A_and_B";
  className?: string;
}

const execModeConfig = {
  A_only: { label: "A", className: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  B_only: { label: "B", className: "bg-violet-100 text-violet-700 border-violet-200" },
  A_and_B: { label: "A+B", className: "bg-slate-100 text-slate-700 border-slate-200" },
};

export function ExecModeBadge({ mode, className }: ExecModeBadgeProps) {
  const config = execModeConfig[mode];
  return (
    <Badge
      variant="outline"
      className={cn("border font-medium text-[10px] px-1.5 py-0", config.className, className)}
    >
      {config.label}
    </Badge>
  );
}
