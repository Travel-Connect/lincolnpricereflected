"use client";

import { useApp } from "@/lib/context/app-context";
import { Building2 } from "lucide-react";
import type { Environment } from "@/lib/types/database";

export function Header() {
  const { currentFacility, environment, setEnvironment } = useApp();

  return (
    <header className="flex h-14 items-center justify-between border-b bg-white px-6">
      {/* Left: Facility */}
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <Building2 className="size-4" />
        <span>{currentFacility?.name ?? ""}</span>
      </div>

      {/* Right: Environment toggle */}
      <div className="flex items-center gap-1 rounded-lg border p-0.5 text-xs">
        <ToggleButton
          active={environment === "production"}
          onClick={() => setEnvironment("production")}
          label="本番"
        />
        <ToggleButton
          active={environment === "staging"}
          onClick={() => setEnvironment("staging")}
          label="検証"
        />
      </div>
    </header>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1 transition-colors ${
        active
          ? "bg-slate-900 text-white"
          : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {label}
    </button>
  );
}
