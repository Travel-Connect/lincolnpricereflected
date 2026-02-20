/**
 * Demo runner — PARSE → STEPA → STEP0 → STEPB をゆっくり目視確認できるスクリプト。
 *
 * Usage:
 *   cd apps/runner
 *   npx tsx ../../scripts/demo-run.ts --excel "C:\lincolnpricereflected\docs\【畳の宿那覇壺屋様】料金変動案_20260212.xlsx"
 *
 * 前提:
 *   - .env に SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LINCOLN_LOGIN_ID, LINCOLN_LOGIN_PW を設定
 *   - 畳の宿 那覇壺屋 (Y77131) が facilities テーブルに存在
 *   - テストカレンダーが Lincoln 6800 画面に存在
 */

import "dotenv/config";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Load .env from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, "..", ".env") });

// --- Config ---
const FACILITY_LINCOLN_ID = "Y77131"; // 畳の宿 那覇壺屋
const SLOW_MO_MS = 300; // ブラウザ操作の遅延 (ms)
const STEPS_TO_RUN = ["PARSE", "STEPA", "STEP0", "STEPB"] as const;

// --- Parse CLI args ---
function getExcelPath(): string {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--excel");
  if (idx === -1 || idx + 1 >= args.length) {
    console.error(
      'Usage: npx tsx ../../scripts/demo-run.ts --excel "path/to/excel.xlsx"',
    );
    process.exit(1);
  }
  return args[idx + 1];
}

// --- Supabase helpers ---
function getSb() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: "lincoln" } },
  );
}

async function createTestJob(
  facilityUuid: string,
  excelPath: string,
): Promise<string> {
  const sb = getSb();
  const { data, error } = await sb
    .from("jobs")
    .insert({
      facility_id: facilityUuid,
      status: "PENDING",
      excel_file_path: excelPath,
      excel_original_name: excelPath.split(/[\\/]/).pop(),
      retry_count: 1, // デモは1回のみ
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Job 作成失敗: ${error?.message}`);
  }
  return data.id;
}

async function getFacilityUuid(lincolnId: string): Promise<string> {
  const sb = getSb();
  const { data, error } = await sb
    .from("facilities")
    .select("id")
    .eq("lincoln_id", lincolnId)
    .single();

  if (error || !data) {
    throw new Error(
      `施設 ${lincolnId} が見つかりません: ${error?.message}`,
    );
  }
  return data.id;
}

// --- Main ---
async function main() {
  const excelPath = getExcelPath();

  console.log("╔══════════════════════════════════════════╗");
  console.log("║  Lincoln Demo Runner (slowMo mode)       ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();
  console.log(`  Excel:    ${excelPath}`);
  console.log(`  施設:     畳の宿 那覇壺屋 (${FACILITY_LINCOLN_ID})`);
  console.log(`  カレンダー: テストカレンダー`);
  console.log(`  slowMo:   ${SLOW_MO_MS}ms`);
  console.log(`  Steps:    ${STEPS_TO_RUN.join(" → ")}`);
  console.log();

  // 1. 施設UUID取得
  console.log("[demo] 施設UUID取得中...");
  const facilityUuid = await getFacilityUuid(FACILITY_LINCOLN_ID);
  console.log(`[demo] 施設UUID: ${facilityUuid}`);

  // 2. テストジョブ作成
  console.log("[demo] テストジョブ作成中...");
  const jobId = await createTestJob(facilityUuid, excelPath);
  console.log(`[demo] ジョブID: ${jobId}`);

  // 3. PARSE は Playwright 不要 — 先に実行
  console.log();
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  STEP: PARSE (Excel パース)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Dynamic import to use the runner's modules
  const { run: runParse } = await import(
    "../apps/runner/src/steps/step-parse.js"
  );
  const { getJob, updateLastCompletedStep, updateJobStatus } = await import(
    "../apps/runner/src/job-state.js"
  );

  await updateJobStatus(jobId, "RUNNING");
  let job = await getJob(jobId);

  const dummyPage = {} as never; // PARSE doesn't use page
  await runParse(jobId, dummyPage, job);
  await updateLastCompletedStep(jobId, "PARSE");
  console.log("[demo] ✓ PARSE 完了\n");

  // 4. ブラウザ起動 (storageState でセッション永続化)
  const sessionFile = resolve(__dirname, "..", "data", "artifacts", "lincoln-session.json");
  const hasSession = existsSync(sessionFile);
  console.log("[demo] ブラウザ起動中 (slowMo mode)...");
  if (hasSession) {
    console.log(`[demo] Session: ${sessionFile} (既存セッション読み込み)`);
  }
  const browser = await chromium.launch({
    headless: false,
    slowMo: SLOW_MO_MS,
  });
  const context = await browser.newContext(
    hasSession ? { storageState: sessionFile } : {},
  );
  const page = await context.newPage();

  try {
    // 5. ログイン
    console.log();
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  AUTH: Lincoln ログイン");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const { login, waitFor2FA } = await import(
      "../apps/runner/src/auth/index.js"
    );

    const loginId = process.env.LINCOLN_LOGIN_ID;
    const loginPw = process.env.LINCOLN_LOGIN_PW;
    if (!loginId || !loginPw) {
      throw new Error(".env に LINCOLN_LOGIN_ID / LINCOLN_LOGIN_PW を設定してください");
    }

    const loginResult = await login(page, loginId, loginPw);

    if (loginResult.needs2FA) {
      console.log("[demo] 2FA が必要です — ブラウザで認証コードを入力してください...");
      await waitFor2FA(page);
    }
    console.log("[demo] ✓ ログイン完了\n");

    // 6. 施設切替
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  施設切替: 畳の宿 那覇壺屋");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const { switchFacility } = await import(
      "../apps/runner/src/auth/facility-switch.js"
    );
    await switchFacility(page, "畳の宿", FACILITY_LINCOLN_ID);
    console.log("[demo] ✓ 施設切替完了\n");

    // 7. STEPA
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  STEP: STEPA (施設ID一致チェック)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    job = await getJob(jobId); // refresh
    const { run: runStepA } = await import(
      "../apps/runner/src/steps/step-a.js"
    );
    await runStepA(jobId, page, job);
    await updateLastCompletedStep(jobId, "STEPA");
    console.log("[demo] ✓ STEPA 完了\n");

    // 8. STEP0
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  STEP: STEP0 (カレンダーランク反映)");
    console.log("  → テストカレンダー を使用");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    job = await getJob(jobId); // refresh
    const { run: runStep0 } = await import(
      "../apps/runner/src/steps/step0.js"
    );
    await runStep0(jobId, page, job);
    await updateLastCompletedStep(jobId, "STEP0");
    console.log("[demo] ✓ STEP0 完了\n");

    // 9. STEPB
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  STEP: STEPB (料金ランク一括設定)");
    console.log("  → テストカレンダー → カレンダーテスト");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    job = await getJob(jobId); // refresh
    const { run: runStepB } = await import(
      "../apps/runner/src/steps/step-b.js"
    );
    await runStepB(jobId, page, job);
    await updateLastCompletedStep(jobId, "STEPB");
    console.log("[demo] ✓ STEPB 完了\n");

    // 10. STEPC
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  STEP: STEPC (出力→突合検証)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    job = await getJob(jobId); // refresh
    const { run: runStepC } = await import(
      "../apps/runner/src/steps/step-c.js"
    );
    const outputFile = await runStepC(jobId, page, job, {
      outputPlans: [
        { value: "6,46", label: "和室コンド / カレンダーテスト" },
        { value: "5,47", label: "和室コンド ～5名仕様～ / カレンダーテスト" },
      ],
    });
    await updateLastCompletedStep(jobId, "STEPC");
    console.log(`[demo] ✓ STEPC 完了 — 出力ファイル: ${outputFile}\n`);

    // 11. 完了
    await updateLastCompletedStep(jobId, "DONE");
    await updateJobStatus(jobId, "SUCCESS");

    // Save session state for next run
    await context.storageState({ path: sessionFile });
    console.log(`[demo] セッション保存: ${sessionFile}`);

    console.log("╔══════════════════════════════════════════╗");
    console.log("║  ✓ デモ実行完了！                        ║");
    console.log("╚══════════════════════════════════════════╝");
    console.log(`  ジョブID: ${jobId}`);

    await browser.close();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n[demo] ✗ 失敗: ${message}`);
    await updateJobStatus(jobId, "FAILED");

    // スクリーンショット保存
    try {
      const { saveScreenshot } = await import(
        "../apps/runner/src/artifact-writer.js"
      );
      await saveScreenshot(page, jobId, "demo-error");
      console.log("[demo] エラー時スクリーンショットを保存しました");
    } catch {
      // ignore
    }

    await browser.close();
  }
}

main().catch((err) => {
  console.error("[demo] Unexpected error:", err);
  process.exit(2);
});
