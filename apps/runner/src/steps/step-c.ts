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
 * Scrape available plans from the 5070 page's right select (sectionTableSelect2)
 * and filter by the plan group set names used in STEPB.
 *
 * Option text format: "roomType / planGroupSetName" (e.g. "和室コンド / カレンダーテスト")
 * Option value format: "roomTypeId,planGroupId" (e.g. "6,46")
 */
async function deriveOutputPlansFromPage(
  page: Page,
  targetPlanGroupSets: string[],
): Promise<OutputPlan[]> {
  const availableSelect = getSelector("stepC.availablePlanGroupSelect");

  const allOptions = await page.evaluate((sel) => {
    const select = document.querySelector(sel) as HTMLSelectElement | null;
    if (!select) return [];
    return Array.from(select.options).map((o) => ({
      value: o.value,
      text: o.text.trim(),
    }));
  }, availableSelect);

  console.log(`[STEPC] Available plans on 5070: ${allOptions.length} total`);

  // Filter: option text must contain one of the target plan group set names after " / "
  const matched = allOptions.filter((opt) => {
    const slashIdx = opt.text.lastIndexOf(" / ");
    if (slashIdx < 0) return false;
    const planGroupSetName = opt.text.slice(slashIdx + 3);
    return targetPlanGroupSets.includes(planGroupSetName);
  });

  console.log(
    `[STEPC] Matched ${matched.length} plans for plan group sets: ${targetPlanGroupSets.join(", ")}`,
  );

  return matched.map((opt) => ({ value: opt.value, label: opt.text }));
}

/**
 * Resolve output plans for STEPC.
 * Priority: config_json.output_plans > options.outputPlans > dynamic derivation from 5070 page.
 *
 * Dynamic derivation: uses process_b_rows plan group set names to filter
 * the available plans list on the 5070 page.
 */
async function resolveOutputPlans(
  page: Page,
  config: ReturnType<typeof getJobConfig>,
  options?: StepCOptions,
): Promise<OutputPlan[]> {
  // 1. Explicit config_json.output_plans (highest priority)
  if (config.output_plans && config.output_plans.length > 0) {
    console.log(`[STEPC] Plan source: config_json (${config.output_plans.length} plans)`);
    return config.output_plans;
  }

  // 2. Options passed programmatically
  if (options?.outputPlans && options.outputPlans.length > 0) {
    console.log(`[STEPC] Plan source: options (${options.outputPlans.length} plans)`);
    return options.outputPlans;
  }

  // 3. Dynamic: derive from process_b_rows + 5070 available plan list
  const processBRows = config.process_b_rows;
  if (!processBRows || processBRows.length === 0) {
    throw new Error(
      "[STEPC] Cannot determine output plans: no output_plans in config_json and no process_b_rows. " +
      "A_only mode requires explicit output_plans in job config.",
    );
  }

  const targetSets = [...new Set(processBRows.map((r) => r.plan_group_set).filter(Boolean))];
  if (targetSets.length === 0) {
    throw new Error("[STEPC] process_b_rows has no valid plan_group_set values");
  }

  console.log(`[STEPC] Plan source: dynamic (from process_b_rows plan group sets: ${targetSets.join(", ")})`);
  const plans = await deriveOutputPlansFromPage(page, targetSets);

  if (plans.length === 0) {
    throw new Error(
      `[STEPC] No matching plans found on 5070 page for plan group sets: ${targetSets.join(", ")}. ` +
      `Ensure the facility has these plan group sets configured in Lincoln.`,
    );
  }

  return plans;
}

export async function run(
  jobId: string,
  page: Page,
  job: Job,
  options?: StepCOptions,
): Promise<string> {
  console.log("[STEPC] Output & verification — start");

  const config = getJobConfig(job);

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

  // 5. Resolve output plans: config_json > options > dynamic derivation from page
  // Must happen AFTER search, because the available plan list is populated by search results.
  const plans = await resolveOutputPlans(page, config, options);

  // 6. Select plans from dual-list
  // Right select (available plans) → select target options → click move-left button
  const availableSelectSel = getSelector("stepC.availablePlanGroupSelect");
  const moveToOutputBtn = getSelector("stepC.moveToOutputButton");

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
  }, availableSelectSel);

  // Select only target plans
  const planValues = plans.map((p: OutputPlan) => p.value);
  await page.locator(availableSelectSel).selectOption(planValues);
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

  // Build stay type overrides from process_b_rows copy_source.
  // The copy source name (e.g. "テストカレンダー（連泊）") indicates the stay type
  // more reliably than the plan group name in the output xlsx (e.g. "カレンダーテスト"
  // which contains no stay type keyword).
  const processBRows = config.process_b_rows;
  let stayTypeOverrides: Map<string, "単泊" | "連泊"> | undefined;
  if (processBRows && processBRows.length > 0) {
    stayTypeOverrides = new Map();
    for (const row of processBRows) {
      if (row.copy_source && row.plan_group_set) {
        const stayType = row.copy_source.includes("連泊") ? "連泊" : "単泊";
        stayTypeOverrides.set(row.plan_group_set, stayType);
      }
    }
    if (stayTypeOverrides.size > 0) {
      console.log(
        `[STEPC] Stay type overrides from copy source: ` +
        [...stayTypeOverrides.entries()].map(([k, v]) => `${k}→${v}`).join(", "),
      );
    } else {
      stayTypeOverrides = undefined;
    }
  }

  // Parse the output xlsx
  const parsed = parseOutputXlsx(savedPath, options?.roomTypeMapping, stayTypeOverrides);

  // Load expected ranks from Supabase
  const { rankMap: expectedRankMap } = await loadExpectedRanks(jobId);

  // Determine which room types to verify based on Process B plan selections.
  // process_b_rows plan_name format: "--和室コンド--|カレンダーテスト"
  // Extract room type group: strip "--" markers → "和室コンド"
  // Then match against output xlsx planBlock.roomTypeGroup to find mapped room types.
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
