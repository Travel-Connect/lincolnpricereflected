"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/lib/context/app-context";
import {
  Plus,
  History,
  Settings,
  HelpCircle,
  Code2,
  LogOut,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const navItems = [
  { href: "/jobs/new", label: "新規ジョブ", icon: Plus },
  { href: "/history", label: "ジョブ履歴", icon: History },
  { href: "/settings", label: "設定", icon: Settings },
  { href: "/help", label: "ヘルプ", icon: HelpCircle },
  { href: "/developer", label: "開発者向け", icon: Code2 },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useApp();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex h-screen w-[220px] flex-col bg-[#1a1d21] text-white shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold">
          L
        </div>
        <span className="text-sm font-semibold">Lincoln Price</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/10 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="truncate text-xs text-slate-300">
              {user.email}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
            title="ログアウト"
          >
            <LogOut className="size-4" />
          </button>
        </div>
        <p className="mt-1 text-[10px] text-slate-500">v1.0.0</p>
      </div>
    </aside>
  );
}
