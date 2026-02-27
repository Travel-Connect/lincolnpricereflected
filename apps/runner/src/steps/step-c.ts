/**
 * STEPC — Output & verification via 5070 page.
 *
 * 1. Navigate to 5070 (料金データ出力)
 * 2. Set output period: today → 2 months later end of month
 * 3. Click search
 * 4. Select target plans from dual-list (right → left)
 * 5. Check "ランクのみ出力"
 * 6. Click output → download xlsx
 * 7. Parse xlsx and verify ranks against expected (from input Excel)
 *
 * Reference: docs/requirements.md §3.5, docs/design.md §3.8
 */

import type { Page } from "playwright";
import type { Job } from "../job-state.js";
import { getJobConfig } from "../job-state.js";
import type { OutputPlan } from "../job-state.js";
import { getSelector } from "../selectors.js";
import { getFacilityLincolnId } from "../facility-lookup.js";
import { verifyFacilityId } from "../verify-facility.js";
import { VerificationFailedError } from "../errors.js";
import { saveScreenshot, saveText } from "../artifact-writer.js";
import { loadExpectedRanks } from "./step0-helpers.js";
import {
  parseOutputXlsx,
  verifyRanks,
  type RoomTypeMapping,
} from "./step-c-helpers.js";
import { resolve } from "node:path";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { LINCOLN_BASE } from "../constants.js";

/** Options for STEPC verification */
export interface StepCOptions {
  outputPlans?: OutputPlan[];
  roomTypeMapping?: RoomTypeMapping;
  skipVerification?: boolean; // skip verification (for testing output only)
}

/**
 * Default plans for 畳の宿 那覇壺屋 カレンダーテスト verification.
 */
const DEFAULT_OUTPUT_PLANS: OutputPlan[] = [
  { value: "6,46", label: "和室コンド / カレンダーテスト" },
  { value: "5,47", label: "和室コンド ～5名仕様～ / カレンダーテスト" },
];

export async function run(
  jobId: string,
  page: Page,
  job: Job,
  options?: StepCOptions,
): Promise<string> {
  console.log("[STEPC] Output & verification — start");

  // Resolve output plans: config_json > options > defaults
  const config = getJobConfig(job);
  const configPlans = config.output_plans;
  const plans = configPlans || options?.outputPlans || DEFAULT_OUTPUT_PLANS;
  console.log(`[STEPC] Plan source: ${configPlans ? "config_json" : options?.outputPlans ? "options" : "defaults"}`);

  // --- Safety: verify facility ID ---
  const expectedId = await getFacilityLincolnId(job.facility_id);

  // 1. Navigate to 5070
  const url5070 = LINCOLN_BASE + "Ascsc5070InitAction.do";
  console.log("[STEPC] Navigating to 5070 (料金データ出力)");
  await page.goto(url5070, { waitUntil: "networkidle", timeout: 30000 });
  console.log(`[STEPC] On page: ${await page.title()}`);

  // 2. Verify facility ID via header
  await verifyFacilityId(page, expectedId, "STEPC");

  // 3. Set output period: end date = 2 months later, end of month
  const now = new Date();
  const endMonth = new Date(now.getFullYear(), now.getMonth() + 3, 0); // last day of month+2
  const toYear = String(endMonth.getFullYear());
  const toMonth = String(endMonth.getMonth() + 1).padStart(2, "0");
  const toDay = String(endMonth.getDate()).padStart(2, "0");

  console.log(`[STEPC] Setting end date: ${toYear}-${toMonth}-${toDay}`);
  await page
    .locator(getSelector("stepC.toYear"))
    .selectOption(toYear);
  await page
    .locator(getSelector("stepC.toMonth"))
    .selectOption(toMonth);
  await page
    .locator(getSelector("stepC.toDay"))
    .selectOption(toDay);
  await page.waitForTimeout(500);

  // 4. Click search
  console.log("[STEPC] Clicking search...");
  await Promise.all([
    page.waitForLoadState("networkidle", { timeout: 30000 }),
    page.locator(getSelector("stepC.searchButton")).click(),
  ]);
  await page.waitForTimeout(2000);
  console.log("[STEPC] Search complete");

  // 5. Select plans from dual-list
  // Right select (available plans) → select target options → click move-left button
  const availableSelect = getSelector("stepC.availablePlanGroupSelect");
  const moveToOutputBtn = getSelector("stepC.moveToOutputButton");

  // First deselect all in right select, then select only target plans
  console.log(`[STEPC] Selecting ${plans.length} plans for output:`);
  for (const plan of plans) {
    console.log(`  - ${plan.label} (${plan.value})`);
  }

  // Deselect all options first via page.evaluate
  await page.evaluate((sel) => {
    const select = document.querySelector(sel) as HTMLSelectElement | null;
    if (select) {
      for (const opt of select.options) {
        opt.selected = false;
      }
    }
  }, availableSelect);

  // Select only target plans
  const planValues = plans.map((p) => p.value);
  await page.locator(availableSelect).selectOption(planValues);
  await page.waitForTimeout(500);

  // Click move-to-output button (← button)
  console.log("[STEPC] Moving selected plans to output...");
  await page.locator(moveToOutputBtn).click();
  await page.waitForTimeout(1000);

  // Verify plans moved to output select
  const outputSelectSel = getSelector("stepC.outputPlanGroupSelect");
  const movedCount = await page.evaluate((sel) => {
    const select = document.querySelector(sel) as HTMLSelectElement | null;
    return select ? select.options.length : 0;
  }, outputSelectSel);
  console.log(`[STEPC] Plans in output list: ${movedCount}`);

  if (movedCount === 0) {
    console.warn("[STEPC] WARNING: No plans moved to output list!");
  }

  // 6. Check "ランクのみ出力"
  // The checkbox may be hidden (custom styled) — use JS to check it
  const rankOnlyCheckboxSel = getSelector("stepC.rankOnlyCheckbox");
  const rankOnlyHiddenSel = getSelector("stepC.rankOnlyHidden");
  const wasChecked = await page.evaluate(
    ({ cbSel, hidSel }) => {
      const cb = document.querySelector(cbSel) as HTMLInputElement | null;
      const hid = document.querySelector(hidSel) as HTMLInputElement | null;
      if (!cb) return false;
      const already = cb.checked;
      if (!already) {
        cb.checked = true;
        cb.dispatchEvent(new Event("change", { bubbles: true }));
        cb.dispatchEvent(new Event("click", { bubbles: true }));
        if (hid) hid.value = "1";
      }
      return already;
    },
    { cbSel: rankOnlyCheckboxSel, hidSel: rankOnlyHiddenSel },
  );
  if (wasChecked) {
    console.log("[STEPC] 'ランクのみ出力' already checked");
  } else {
    console.log("[STEPC] Checked 'ランクのみ出力' via JS");
  }
  await page.waitForTimeout(500);

  // 7. Click output and wait for download
  console.log("[STEPC] Clicking output (doOutput)...");
  const outputBtn = getSelector("stepC.outputButton");

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    page.locator(outputBtn).click(),
  ]);

  const suggestedName = download.suggestedFilename();
  console.log(`[STEPC] Download started: ${suggestedName}`);

  // Wait for download to complete
  const downloadPath = await download.path();
  if (!downloadPath) {
    throw new Error("[STEPC] Download failed — no file path");
  }
  console.log(`[STEPC] Download complete: ${downloadPath}`);

  // 8. Save to artifacts
  const PROJECT_ROOT = resolve(
    import.meta.dirname,
    "..",
    "..",
    "..",
    "..",
  );
  const artifactDir = resolve(
    PROJECT_ROOT,
    "data",
    "artifacts",
    `job-${jobId}`,
  );
  mkdirSync(artifactDir, { recursive: true });
  const savedPath = resolve(artifactDir, suggestedName);
  copyFileSync(downloadPath, savedPath);
  console.log(`[STEPC] File saved: ${savedPath}`);

  // 9. Log file info
  const fileBuffer = readFileSync(savedPath);
  console.log(`[STEPC] File size: ${fileBuffer.length} bytes`);
  console.log(`[STEPC] File extension: ${suggestedName.split(".").pop()}`);

  // Take a screenshot for reference
  await saveScreenshot(page, jobId, "STEPC-output");

  console.log(`\n[STEPC] Output complete — file: ${savedPath}`);

  // 10. Verify ranks if not skipped
  if (options?.skipVerification) {
    console.log("[STEPC] Verification skipped (skipVerification=true)");
    return savedPath;
  }

  console.log("\n[STEPC] === 突合検証開始 ===");

  // Parse the output xlsx
  const parsed = parseOutputXlsx(savedPath, options?.roomTypeMapping);

  // Load expected ranks from Supabase
  const { rankMap: expectedRankMap } = await loadExpectedRanks(jobId);

  // Determine which room types to verify based on Process B plan selections.
  // process_b_rows plan_name format: "--和室コンド--|カレンダーテスト"
  // Extract room type group: strip "--" markers → "和室コンド"
  // Then match against output xlsx planBlock.roomTypeGroup to find mapped room types.
  const processBRows = config.process_b_rows;

  let verifyRoomTypes: string[] | undefined;
  if (processBRows && processBRows.length > 0) {
    const targetGroups = new Set<string>();
    for (const row of processBRows) {
      if (!row.plan_name) continue;
      const roomTypePart = row.plan_name.split("|")[0]; // "--和室コンド--"
      const stripped = roomTypePart.replace(/^-+/, "").replace(/-+$/, ""); // "和室コンド"
      if (stripped) targetGroups.add(stripped);
    }

    if (targetGroups.size > 0) {
      // Match output xlsx plan blocks by roomTypeGroup → collect their mappedRoomTypes
      verifyRoomTypes = [
        ...new Set(
          parsed.planBlocks
            .filter((block) => targetGroups.has(block.roomTypeGroup))
            .map((block) => block.mappedRoomType),
        ),
      ];
      console.log(
        `[STEPC] Verification scoped to Process B targets: ${[...targetGroups].join(", ")} → ${verifyRoomTypes.join(", ")}`,
      );
    }
  }

  // Run verification
  const result = verifyRanks(expectedRankMap, parsed, verifyRoomTypes);

  // Log and save the result
  console.log(`\n${result.summary}`);
  saveText(jobId, "STEPC-verification.txt", result.summary);

  if (result.mismatchCount > 0) {
    throw new VerificationFailedError(
      result.totalChecked,
      result.mismatchCount,
    );
  }

  console.log("\n[STEPC] 突合検証完了 — 完全一致 ✓");
  return savedPath;
}
