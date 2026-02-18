/**
 * Seed remote Supabase with facility data.
 * Usage: cd apps/runner && npx tsx ../../scripts/seed-remote.ts
 */
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, "..", ".env") });

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
console.log("Supabase URL:", url);
console.log("Connecting...");

const sb = createClient(url, key, { db: { schema: "lincoln" } });

const facilities = [
  { lincoln_id: "I38347", name: "アクアパレス北谷" },
  { lincoln_id: "D88689", name: "プライベートコンド古宇利島" },
  { lincoln_id: "G49445", name: "プールヴィラ古宇利島" },
  { lincoln_id: "F02223", name: "ミュージックホテルコザ" },
  { lincoln_id: "O85848", name: "ジョイントホーム 那覇" },
  { lincoln_id: "P05894", name: "プールヴィラ 今泊" },
  { lincoln_id: "Y77131", name: "畳の宿 那覇壺屋" },
  { lincoln_id: "F63659", name: "プールヴィラ 屋我地島" },
  { lincoln_id: "F25555", name: "プライベートコンド北谷 ジャーガル" },
];

// Insert facilities
console.log("Inserting facilities...");
const { data: inserted, error: insErr } = await sb
  .from("facilities")
  .upsert(facilities, { onConflict: "lincoln_id" })
  .select();

if (insErr) {
  console.error("Insert facilities error:", insErr);
  process.exit(1);
}
console.log(`Facilities inserted: ${inserted.length}`);

// Fetch all facilities for alias creation
const { data: allFac } = await sb
  .from("facilities")
  .select("id, lincoln_id, name");

console.log(`Fetched ${allFac!.length} facilities for alias creation`);

// Create aliases (name = alias)
const nameAliases = allFac!.map((f) => ({ facility_id: f.id, alias: f.name }));

// Extra aliases (space-removed variants)
const extraMap = [
  { lincoln_id: "O85848", alias: "ジョイントホーム那覇" },
  { lincoln_id: "P05894", alias: "プールヴィラ今泊" },
  { lincoln_id: "Y77131", alias: "畳の宿那覇壺屋" },
  { lincoln_id: "Y77131", alias: "畳の宿" },
  { lincoln_id: "F63659", alias: "プールヴィラ屋我地島" },
  { lincoln_id: "F25555", alias: "プライベートコンド北谷ジャーガル" },
];

const extras = extraMap.map((ea) => {
  const fac = allFac!.find((f) => f.lincoln_id === ea.lincoln_id)!;
  return { facility_id: fac.id, alias: ea.alias };
});

const allAliases = [...nameAliases, ...extras];

console.log(`Inserting ${allAliases.length} aliases...`);
const { error: aliasErr, data: aliasData } = await sb
  .from("facility_aliases")
  .upsert(allAliases, { onConflict: "facility_id,alias", ignoreDuplicates: true })
  .select();

if (aliasErr) {
  console.error("Insert aliases error:", aliasErr);
  process.exit(1);
}
console.log(`Aliases inserted: ${aliasData.length}`);

// Verify
const { data: verifyFac } = await sb
  .from("facilities")
  .select("lincoln_id, name");
const { data: verifyAl } = await sb
  .from("facility_aliases")
  .select("alias");

console.log("\n=== Seed Complete ===");
console.log(`Facilities: ${verifyFac!.length}`);
console.log(`Aliases: ${verifyAl!.length}`);
verifyFac!.forEach((f) => console.log(`  ${f.lincoln_id} → ${f.name}`));
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
