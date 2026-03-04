"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Settings,
  Building2,
  Calendar,
  ListChecks,
  RefreshCw,
  User,
  Eye,
  EyeOff,
  Save,
} from "lucide-react";
import { saveCredentials } from "./actions";
import type { Facility, UserLincolnCredentials } from "@/lib/types/database";

const TABS = [
  { id: "facilities", label: "施設", icon: Building2 },
  { id: "calendars", label: "カレンダー", icon: Calendar },
  { id: "plans", label: "プラン", icon: ListChecks },
  { id: "retry", label: "リトライ", icon: RefreshCw },
  { id: "account", label: "アカウント", icon: User },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface Props {
  facilities: Facility[];
  credentials: UserLincolnCredentials | null;
  userEmail: string;
}

export function SettingsClient({
  facilities,
  credentials,
  userEmail,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("facilities");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="size-5 text-slate-600" />
        <h1 className="text-lg font-semibold">設定</h1>
      </div>

      <div className="flex gap-6">
        {/* Tab sidebar */}
        <nav className="w-44 shrink-0 space-y-0.5">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                activeTab === id
                  ? "bg-indigo-50 text-indigo-700 font-medium"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </nav>

        {/* Tab content */}
        <div className="flex-1">
          {activeTab === "facilities" && (
            <FacilitiesTab facilities={facilities} />
          )}
          {activeTab === "calendars" && <CalendarsTab />}
          {activeTab === "plans" && <PlansTab />}
          {activeTab === "retry" && <RetryTab />}
          {activeTab === "account" && (
            <AccountTab
              credentials={credentials}
              userEmail={userEmail}
              facilities={facilities}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// --- Facilities Tab ---
function FacilitiesTab({ facilities }: { facilities: Facility[] }) {
  return (
    <div className="rounded-lg border bg-white p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-700">施設一覧</h2>
      {facilities.length === 0 ? (
        <p className="text-sm text-slate-400">施設が登録されていません。</p>
      ) : (
        <div className="space-y-2">
          {facilities.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between rounded-lg border px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <Building2 className="size-4 text-slate-400" />
                <div>
                  <p className="text-sm font-medium">{f.name}</p>
                  <p className="text-xs text-slate-400">{f.lincoln_id}</p>
                </div>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  f.active
                    ? "bg-green-100 text-green-700"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                {f.active ? "有効" : "無効"}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-400">
        施設の追加・編集は管理者がデータベースから行います。
      </p>
    </div>
  );
}

// --- Calendars Tab ---
function CalendarsTab() {
  return (
    <div className="rounded-lg border bg-white p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-700">
        カレンダー設定
      </h2>
      <p className="text-sm text-slate-500">
        施設ごとのデフォルトカレンダー割当を管理します。
        リンカーンからカレンダー一覧を取得して設定できます。
      </p>
      <div className="rounded border-2 border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
        カレンダー設定機能は準備中です
      </div>
    </div>
  );
}

// --- Plans Tab ---
function PlansTab() {
  return (
    <div className="rounded-lg border bg-white p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-700">プラン設定</h2>
      <p className="text-sm text-slate-500">
        施設ごとのプラングループセットとデフォルト選択を管理します。
      </p>
      <div className="rounded border-2 border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
        プラン設定機能は準備中です
      </div>
    </div>
  );
}

// --- Retry Tab ---
function RetryTab() {
  const [retryCount, setRetryCount] = useState(3);
  const [retrySteps, setRetrySteps] = useState({
    PARSE: true,
    STEPA: true,
    STEP0: true,
    STEPB: true,
    STEPC: true,
  });

  function toggleStep(step: keyof typeof retrySteps) {
    setRetrySteps((prev) => ({ ...prev, [step]: !prev[step] }));
  }

  return (
    <div className="rounded-lg border bg-white p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-700">
        リトライ設定
      </h2>

      <div className="space-y-3">
        <div>
          <label className="text-sm text-slate-600">
            デフォルトリトライ回数
          </label>
          <div className="mt-1 flex items-center gap-3">
            <button
              onClick={() => setRetryCount((c) => Math.max(0, c - 1))}
              className="rounded-lg border px-3 py-1 hover:bg-slate-50"
            >
              -
            </button>
            <span className="w-8 text-center text-lg font-semibold">
              {retryCount}
            </span>
            <button
              onClick={() => setRetryCount((c) => Math.min(10, c + 1))}
              className="rounded-lg border px-3 py-1 hover:bg-slate-50"
            >
              +
            </button>
          </div>
        </div>

        <div>
          <label className="text-sm text-slate-600">
            リトライ対象ステップ
          </label>
          <div className="mt-2 space-y-2">
            {(
              Object.entries(retrySteps) as [
                keyof typeof retrySteps,
                boolean,
              ][]
            ).map(([step, enabled]) => (
              <label
                key={step}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => toggleStep(step)}
                  className="rounded"
                />
                {stepLabels[step]}
              </label>
            ))}
          </div>
        </div>

        <button
          onClick={() => toast.success("リトライ設定を保存しました")}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Save className="size-4" />
          保存
        </button>
      </div>
    </div>
  );
}

const stepLabels: Record<string, string> = {
  PARSE: "Excel解析",
  STEPA: "ログイン・施設確認",
  STEP0: "カレンダーランク反映",
  STEPB: "一括料金送信",
  STEPC: "出力検証",
};

// --- Account Tab ---
function AccountTab({
  credentials,
  userEmail,
  facilities,
}: {
  credentials: UserLincolnCredentials | null;
  userEmail: string;
  facilities: Facility[];
}) {
  const [loginId, setLoginId] = useState(
    credentials?.lincoln_login_id ?? ""
  );
  const [loginPw, setLoginPw] = useState(
    credentials?.lincoln_login_pw ?? ""
  );
  const [defaultFacility, setDefaultFacility] = useState(
    credentials?.default_facility_id ?? ""
  );
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!loginId || !loginPw) {
      toast.error("ログインIDとパスワードを入力してください");
      return;
    }
    setSaving(true);
    try {
      await saveCredentials({
        lincoln_login_id: loginId,
        lincoln_login_pw: loginPw,
        default_facility_id: defaultFacility || null,
      });
      toast.success("アカウント情報を保存しました");
    } catch (err) {
      toast.error(
        `保存に失敗しました: ${err instanceof Error ? err.message : "不明なエラー"}`
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border bg-white p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-700">
        アカウント設定
      </h2>

      <div className="space-y-3">
        {/* Email (read-only) */}
        <div>
          <label className="text-sm text-slate-600">メールアドレス</label>
          <input
            value={userEmail}
            disabled
            className="mt-1 w-full rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-500"
          />
        </div>

        {/* Lincoln Login ID */}
        <div>
          <label className="text-sm text-slate-600">
            Lincoln ログインID
          </label>
          <input
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            placeholder="B7862253"
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        {/* Lincoln Password */}
        <div>
          <label className="text-sm text-slate-600">
            Lincoln パスワード
          </label>
          <div className="relative mt-1">
            <input
              type={showPw ? "text" : "password"}
              value={loginPw}
              onChange={(e) => setLoginPw(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border px-3 py-2 pr-10 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
            >
              {showPw ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
        </div>

        {/* Default Facility */}
        <div>
          <label className="text-sm text-slate-600">
            デフォルト施設
          </label>
          <select
            value={defaultFacility}
            onChange={(e) => setDefaultFacility(e.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          >
            <option value="">選択なし</option>
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.lincoln_id})
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          <Save className="size-4" />
          {saving ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}
