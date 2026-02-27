import { createClient } from "@/lib/supabase/server";
import { typedData, typedDataOrEmpty } from "@/lib/supabase/typed-query";
import type {
  Facility,
  UserLincolnCredentials,
} from "@/lib/types/database";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [facilitiesRes, credentialsRes] = await Promise.all([
    supabase
      .from("facilities")
      .select("*")
      .order("name"),
    supabase
      .from("user_lincoln_credentials")
      .select("*")
      .eq("user_id", user!.id)
      .single(),
  ]);

  return (
    <SettingsClient
      facilities={typedDataOrEmpty<Facility>(facilitiesRes.data)}
      credentials={typedData<UserLincolnCredentials | null>(credentialsRes.data ?? null)}
      userEmail={user!.email ?? ""}
    />
  );
}
