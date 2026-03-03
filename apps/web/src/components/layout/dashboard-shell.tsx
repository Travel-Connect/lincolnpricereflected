"use client";

import type { User } from "@supabase/supabase-js";
import type { Facility, UserLincolnCredentials, Runner } from "@/lib/types/database";
import { AppProvider } from "@/lib/context/app-context";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { Toaster } from "sonner";

interface DashboardShellProps {
  children: React.ReactNode;
  user: User;
  credentials: UserLincolnCredentials | null;
  facilities: Facility[];
  runners: Runner[];
}

export function DashboardShell({
  children,
  user,
  credentials,
  facilities,
  runners,
}: DashboardShellProps) {
  return (
    <AppProvider
      user={user}
      credentials={credentials}
      facilities={facilities}
      runners={runners}
    >
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto bg-slate-50 p-6">
            {children}
          </main>
        </div>
      </div>
      <Toaster position="top-right" richColors />
    </AppProvider>
  );
}
