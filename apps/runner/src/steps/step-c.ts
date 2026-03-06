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
 * Match specific plan names from process_b_rows against the 5070 page's available plan list.
 *
 * process_b_rows.plan_name format: "--お部屋おまかせ--|【-10%】事前単泊_素泊まり"
 * 5070 DOM structure:
 *   <optgroup label="--お部屋おまかせ--">
 *     <option value="5,49">【-10%】事前単泊_素泊まり</option>
 */
async function matchPlansOnPage(
  page: Page,
  planNames: string[],
): Promise<OutputPlan[]> {
  // 1. Parse plan names: "--roomType--|planName" → {roomType, planName}
  const targetPlans = planNames.map((pn) => {
    const sepIdx = pn.indexOf("|");
    if (sepIdx < 0) return { roomType: "", planName: pn };
    return { roomType: pn.slice(0, sepIdx), planName: pn.slice(sepIdx + 1) };
  });

  // 2. Scrape 5070 page options with their optgroup labels
  const availableSelect = getSelector("stepC.availablePlanGroupSelect");
  const allOptions = await page.evaluate((sel) => {
    const select = document.querySelector(sel) as HTMLSelectElement | null;
    if (!select) return [];
    const results: { value: string; text: string; groupLabel: string }[] = [];
    for (const og of select.querySelectorAll("optgroup")) {
      const groupLabel = og.getAttribute("label") || "";
      for (const opt of og.querySelectorAll("option")) {
        results.push({ value: opt.value, text: opt.text.trim(), groupLabel });
      }
    }
    return results;
  }, availableSelect);

  console.log(`[STEPC] Available plans on 5070: ${allOptions.length} total`);

  // 3. Exact match: {roomType, planName} ↔ {groupLabel, text}
  const matched = allOptions.filter((opt) =>
    targetPlans.some(
      (tp: { roomType: string; planName: string }) =>
        tp.roomType === opt.groupLabel && tp.planName === opt.text,
    ),
  );

  console.log(`[STEPC] Matched ${matched.length}/${planNames.length} plans on 5070 page`);
  for (const m of matched) {
    console.log(`[STEPC]   ${m.groupLabel} > ${m.text} (${m.value})`);
  }

  return matched.map((opt) => ({
    value: opt.value,
    label: `${opt.groupLabel} > ${opt.text}`,
  }));
}

/**
 * Build room type mapping dynamically from process_b_rows + calendar_mappings chain.
 *
 * Chain: calendar_mappings → process_b_rows → output xlsx room type
 *   calendar_mappings: excel_calendar="ムーンスイート(単泊)" → lincoln_calendar_id="〇単泊カレンダー"
 *   process_b_rows:    copy_source="〇単泊カレンダー" → plan_name="--お部屋おまかせ--|..."
 *   output xlsx:       Col A = "お部屋おまかせ" (from plan's optgroup, stripped of "--")
 *
 * Result: { "お部屋おまかせ": "ムーンスイート" }
 *   + stay type from copy_source → final: "ムーンスイート(単泊)"
 */
function buildDynamicRoomTypeMapping(
  config: ReturnType<typeof getJobConfig>,
): RoomTypeMapping {
  const mapping: RoomTypeMapping = {};
  const calMappings = config.calendar_mappings ?? [];
  const pbRows = config.process_b_rows ?? [];

  // Build: copy_source → excel_calendar base name
  // calendar_mappings: { excel_calendar: "ムーンスイート(単泊)", lincoln_calendar_id: "〇単泊カレンダー" }
  const copySourceToExcelBase = new Map<string, string>();
  for (const cm of calMappings) {
    // Strip "(単泊)" or "(連泊)" suffix to get base name
    const baseName = cm.excel_calendar.replace(/\(単泊\)$|\(連泊\)$/, "");
    copySourceToExcelBase.set(cm.lincoln_calendar_id, baseName);
  }

  for (const row of pbRows) {
    if (!row.plan_name || !row.copy_source) continue;

    // Extract output room type from plan_name: "--お部屋おまかせ--|..." → "お部屋おまかせ"
    const roomTypePart = row.plan_name.split("|")[0];
    const outputRoomType = roomTypePart.replace(/^-+/, "").replace(/-+$/, "");
    if (!outputRoomType) continue;

    // Find Excel base name via copy_source
    const excelBase = copySourceToExcelBase.get(row.copy_source);
    if (!excelBase) continue;

    if (!mapping[outputRoomType]) {
      mapping[outputRoomType] = excelBase;
    }
  }

  console.log(
    `[STEPC] Dynamic room type mapping: ` +
    Object.entries(mapping).map(([k, v]) => `${k}→${v}`).join(", "),
  );

  return mapping;
}

/**
 * Resolve output plans for STEPC.
 * Priority: config_json.output_plans > options.outputPlans > dynamic from process_b_rows.plan_name.
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

  // 3. Dynamic: use specific plan names from process_b_rows
  const processBRows = config.process_b_rows;
  if (!processBRows || processBRows.length === 0) {
    throw new Error(
      "[STEPC] Cannot determine output plans: no output_plans in config_json and no process_b_rows. " +
      "A_only mode requires explicit output_plans in job config.",
    );
  }

  const planNames = [...new Set(processBRows.map((r) => r.plan_name).filter(Boolean))];
  if (planNames.length === 0) {
    throw new Error("[STEPC] process_b_rows has no plan_name values");
  }

  console.log(`[STEPC] Plan source: process_b_rows plan_name (${planNames.length} plans)`);
  for (const pn of planNames) {
    console.log(`[STEPC]   target: ${pn}`);
  }

  const plans = await matchPlansOnPage(page, planNames);

  if (plans.length === 0) {
    throw new Error(
      `[STEPC] No matching plans found on 5070 page for: ${planNames.join(", ")}. ` +
      `Check that plan names match the 5070 page exactly.`,
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

  // Select target plans via jQuery (Lincoln uses jQuery for event binding)
  const planValues = plans.map((p: OutputPlan) => p.value);
  await page.evaluate(
    ({ sel, values }) => {
      const $ = (window as any).$;
      // Deselect all, then select only target plans by value
      $(`${sel} option`).prop("selected", false);
      for (const val of values) {
        $(`${sel} option[value="${val}"]`).prop("selected", true);
      }
    },
    { sel: availableSelectSel, values: planValues },
  );
  await page.waitForTimeout(500);

  // Click move-to-output button (← button) via jQuery trigger
  // Lincoln binds click handlers via jQuery .on() — vanilla click() doesn't fire them.
  console.log("[STEPC] Moving selected plans to output...");
  await page.evaluate((btnSel) => {
    const $ = (window as any).$;
    $(btnSel).trigger("click");
  }, moveToOutputBtn);
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

  // 6b. Close "プラングループセットの新規登録" modal if it appears
  try {
    const modalCloseBtn = await page.locator("#cPlanGroupSetRecommendation_closeBtn").elementHandle({ timeout: 2000 });
    if (modalCloseBtn) {
      console.log("[STEPC] Closing 'プラングループセットの新規登録' modal");
      await modalCloseBtn.click();
      await page.waitForTimeout(500);
    }
  } catch {
    // Modal didn't appear — normal case
  }

  // 7. Click output and wait for download
  console.log("[STEPC] Clicking output (doOutput)...");
  const outputBtn = getSelector("stepC.outputButton");

  // doOutput() triggers window.confirm("出力します。") — must accept or download silently fails
  page.once("dialog", (d) => d.accept());

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

  // Parse the output xlsx — use dynamic room type mapping from process_b_rows chain
  const roomTypeMapping = options?.roomTypeMapping || buildDynamicRoomTypeMapping(config);
  const parsed = parseOutputXlsx(savedPath, roomTypeMapping, stayTypeOverrides);

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
