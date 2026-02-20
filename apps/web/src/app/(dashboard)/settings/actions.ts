"use server";

import { createClient } from "@/lib/supabase/server";

export async function saveCredentials(input: {
  lincoln_login_id: string;
  lincoln_login_pw: string;
  default_facility_id: string | null;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Upsert: insert if not exists, update if exists
  const { data: existing } = await supabase
    .from("user_lincoln_credentials")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (existing) {
    const { error } = await supabase
      .from("user_lincoln_credentials")
      .update({
        lincoln_login_id: input.lincoln_login_id,
        lincoln_login_pw: input.lincoln_login_pw,
        default_facility_id: input.default_facility_id,
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("user_lincoln_credentials")
      .insert({
        user_id: user.id,
        lincoln_login_id: input.lincoln_login_id,
        lincoln_login_pw: input.lincoln_login_pw,
        default_facility_id: input.default_facility_id,
      });
    if (error) throw new Error(error.message);
  }
}
