/**
 * STEP0 — Calendar rank injection (DOM update).
 *
 * Reads calendar_mappings from job config_json, then for each mapped
 * Lincoln calendar on the 6800 screen, updates cells with expected ranks
 * from the corresponding Excel room types.
 *
 * The 6800 calendar is day-level (one rank per date), not room-type-level.
 *
 * Reference: docs/requirements.md §3.3, docs/design.md §3.6
 */

import type { Page } from "playwright";
import type { Job } from "../job-state.js";
import { getJobConfig } from "../job-state.js";
import type { CalendarMapping } from "../job-state.js";
import { getSelector } from "../selectors.js";
import {
  loadExpectedRanks,
  rankMapToDateRank,
  rankMapToDateRankForRoomTypes,
  collectRankStyles,
  updateCalendarCells,
  type RankMap,
  type DomSelectors,
} from "./step0-helpers.js";
import { LINCOLN_BASE } from "../constants.js";

/** Group mappings by lincoln_calendar_id → list of excel room types */
function groupMappingsByCalendar(
  mappings: CalendarMapping[],
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const m of mappings) {
    if (!m.lincoln_calendar_id) continue; // skip unmapped
    const existing = grouped.get(m.lincoln_calendar_id) ?? [];
    existing.push(m.excel_calendar);
    grouped.set(m.lincoln_calendar_id, existing);
  }
  return grouped;
}

export async function run(
  jobId: string,
  page: Page,
  job: Job,
): Promise<void> {
  console.log("[STEP0] Calendar rank injection — start");

  // 1. Read calendar_mappings from job config
  const config = getJobConfig(job);
  const mappings = config.calendar_mappings ?? [];
  const calendarGroups = groupMappingsByCalendar(mappings);

  if (calendarGroups.size === 0) {
    throw new Error(
      "[STEP0] No calendar mappings configured. Set mappings in Step 1 of the wizard.",
    );
  }

  console.log(
    `[STEP0] Calendar mappings: ${calendarGroups.size} calendar(s) to update`,
  );
  for (const [calName, roomTypes] of calendarGroups) {
    console.log(`[STEP0]   ${calName} ← ${roomTypes.join(", ")}`);
  }

  // 2. Load expected ranks from Supabase
  const { rankMap, maxDate } = await loadExpectedRanks(jobId);
  console.log(
    `[STEP0] Rank data: ${rankMap.size} dates, max date: ${maxDate}`,
  );

  // 3. Process each calendar
  let totalUpdated = 0;
  let calendarIndex = 0;

  for (const [calendarName, roomTypes] of calendarGroups) {
    calendarIndex++;
    console.log(
      `[STEP0] === Calendar ${calendarIndex}/${calendarGroups.size}: ${calendarName} ===`,
    );

    // Build date→rank for this calendar's room types
    const dateRanks = rankMapToDateRankForRoomTypes(rankMap, roomTypes);
    const dateCount = Object.keys(dateRanks).length;
    console.log(`[STEP0] ${dateCount} dates with rank data for: ${roomTypes.join(", ")}`);

    if (dateCount === 0) {
      console.warn(`[STEP0] No rank data for ${calendarName} — skipping`);
      continue;
    }

    const updated = await processOneCalendar(
      page,
      calendarName,
      dateRanks,
      maxDate,
    );
    totalUpdated += updated;
  }

  console.log(
    `[STEP0] Calendar rank injection complete — ${totalUpdated} total cells updated across ${calendarGroups.size} calendar(s)`,
  );
}

/** Process a single Lincoln calendar: navigate, update cells, save */
async function processOneCalendar(
  page: Page,
  calendarName: string,
  dateRanks: Record<string, string>,
  maxDate: string,
): Promise<number> {
  // Navigate to 6800 calendar list
  const calendarSettingsUrl =
    LINCOLN_BASE + getSelector("navigation.calendarSettings");
  console.log(`[STEP0] Navigating to calendar list`);
  await page.goto(calendarSettingsUrl, {
    waitUntil: "networkidle",
    timeout: 30000,
  });

  // Find calendar in the list and click into detail
  const listItemSelector = getSelector("step0.calendarListItem");

  console.log(`[STEP0] Looking for: ${calendarName}`);
  const calendarLink = page
    .locator(listItemSelector)
    .filter({ hasText: calendarName })
    .first();

  if (!(await calendarLink.isVisible({ timeout: 10000 }).catch(() => false))) {
    throw new Error(
      `[STEP0] Calendar "${calendarName}" not found in list`,
    );
  }

  console.log(`[STEP0] Found "${calendarName}" — clicking...`);
  await Promise.all([
    page.waitForLoadState("networkidle", { timeout: 15000 }),
    calendarLink.click(),
  ]);
  console.log("[STEP0] Entered calendar detail page");

  // Set period end date
  await setPeriodEndDate(page, maxDate);

  // Collect rank styles from the rank palette buttons
  const rankPaletteBtnSelector = getSelector("step0.rankPaletteBtn");
  const styleMap = await page.evaluate(
    collectRankStyles,
    rankPaletteBtnSelector,
  );
  const styleCount = Object.keys(styleMap).length;
  console.log(`[STEP0] Collected ${styleCount} rank styles from palette`);

  if (styleCount === 0) {
    console.warn(
      "[STEP0] Warning: No rank styles found in palette. DOM may have changed.",
    );
  }

  // Build selector config for DOM update
  const domSelectors: DomSelectors = {
    rankAnchor: getSelector("step0.rankAnchor"),
    rankText: getSelector("step0.rankText"),
    inputPriceRankCd: getSelector("step0.inputPriceRankCd"),
    defaultInputPriceRankCd: getSelector("step0.defaultInputPriceRankCd"),
    inputPriceRankNm: getSelector("step0.inputPriceRankNm"),
    inputRankStyleText: getSelector("step0.inputRankStyleText"),
  };

  // Update calendar cells in the DOM
  const result = await page.evaluate(updateCalendarCells, {
    dateRanks,
    styleMap,
    sel: domSelectors,
  });

  console.log(
    `[STEP0] DOM update: ${result.updated} updated, ${result.skipped} skipped`,
  );

  if (result.notFound.length > 0) {
    console.warn(
      `[STEP0] Ranks without style (${result.notFound.length}): ${result.notFound.slice(0, 10).join(", ")}`,
    );
  }

  if (result.updated === 0) {
    throw new Error(
      `[STEP0] No cells were updated for "${calendarName}". Check date range or rank data.`,
    );
  }

  // Save — click doUpdate()
  const dialogMessages: string[] = [];
  const dialogHandler = async (dialog: import("playwright").Dialog) => {
    console.log(`[STEP0] Dialog: "${dialog.message()}" — accepting`);
    dialogMessages.push(dialog.message());
    await dialog.accept();
  };
  page.on("dialog", dialogHandler);

  const saveButtonSelector = getSelector("step0.saveButton");
  console.log("[STEP0] Clicking save button...");

  await Promise.all([
    page.waitForLoadState("networkidle", { timeout: 30000 }),
    page.locator(saveButtonSelector).click(),
  ]);

  page.off("dialog", dialogHandler);
  if (dialogMessages.length > 0) {
    console.log(`[STEP0] Accepted ${dialogMessages.length} dialog(s)`);
  }

  // Verify save result
  await page.waitForTimeout(1000);
  const errorMessage = await page.evaluate(() => {
    const errEl = document.querySelector(".c_txt-worning, .c_txt-error");
    return errEl ? (errEl.textContent || "").trim() : null;
  });

  if (errorMessage) {
    throw new Error(`[STEP0] Save failed for "${calendarName}": ${errorMessage}`);
  }

  console.log(
    `[STEP0] "${calendarName}" — ${result.updated} cells updated ✓`,
  );

  return result.updated;
}

/**
 * Set the period end date on the calendar detail page.
 * Only changes the end date; start date stays at default.
 */
async function setPeriodEndDate(
  page: Page,
  maxDate: string,
): Promise<void> {
  const [year, month, day] = maxDate.split("-");

  const toYearSelector = getSelector("step0.periodToYear");
  const toMonthSelector = getSelector("step0.periodToMonth");
  const toDaySelector = getSelector("step0.periodToDay");
  const redrawSelector = getSelector("step0.periodRedrawButton");

  console.log(`[STEP0] Setting period end date to: ${maxDate}`);

  await page.locator(toYearSelector).selectOption(year);
  await page.locator(toMonthSelector).selectOption(month);
  await page.locator(toDaySelector).selectOption(day);

  // Redraw calendar with new period (triggers full page reload)
  await Promise.all([
    page.waitForLoadState("networkidle", { timeout: 15000 }),
    page.locator(redrawSelector).click(),
  ]);

  // Wait for DOM to stabilize after navigation (avoid "Execution context destroyed")
  await page.waitForLoadState("domcontentloaded", { timeout: 10000 });
  await page.waitForTimeout(1000);

  console.log("[STEP0] Period redraw complete");
}
