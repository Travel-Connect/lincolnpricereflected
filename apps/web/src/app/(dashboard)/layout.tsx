import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import type { Facility, UserLincolnCredentials, Runner } from "@/lib/types/database";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch facilities
  const { data: facilities } = await supabase
    .from("facilities")
    .select("*")
    .eq("active", true)
    .order("name");

  // Fetch user's Lincoln credentials
  const { data: credentials } = await supabase
    .from("user_lincoln_credentials")
    .select("*")
    .eq("user_id", user.id)
    .single();

  // Fetch online runners
  const { data: runners } = await supabase
    .from("runners")
    .select("*")
    .order("machine_name");

  return (
    <DashboardShell
      user={user}
      credentials={(credentials as UserLincolnCredentials) ?? null}
      facilities={(facilities as Facility[]) ?? []}
      runners={(runners as Runner[]) ?? []}
    >
      {children}
    </DashboardShell>
  );
}
