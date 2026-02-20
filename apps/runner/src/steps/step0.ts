/**
 * STEP0 — Calendar rank injection (DOM update).
 *
 * Navigates to the テストカレンダー on the 6800 screen, then updates
 * each calendar cell with the expected rank from job_expected_ranks.
 *
 * The 6800 calendar is day-level (one rank per date), not room-type-level.
 * We pick the first room type's rank for each date.
 *
 * Reference: docs/requirements.md §3.3, docs/design.md §3.6
 */

import type { Page } from "playwright";
import type { Job } from "../job-state.js";
import { getSelector } from "../selectors.js";
import {
  loadExpectedRanks,
  rankMapToDateRank,
  collectRankStyles,
  updateCalendarCells,
  type DomSelectors,
} from "./step0-helpers.js";

/** Target calendar name — always use test calendar for safety */
const TARGET_CALENDAR_NAME = "テストカレンダー";

/** Lincoln base URL */
const LINCOLN_BASE = "https://www.tl-lincoln.net/accomodation/";

export async function run(
  jobId: string,
  page: Page,
  _job: Job,
): Promise<void> {
  console.log("[STEP0] Calendar rank injection — start");

  // 1. Load expected ranks from Supabase
  const { rankMap, maxDate } = await loadExpectedRanks(jobId);
  const dateRanks = rankMapToDateRank(rankMap);
  console.log(
    `[STEP0] Rank data: ${rankMap.size} dates, max date: ${maxDate}`,
  );

  // 2. Navigate to 6800 calendar list
  const calendarSettingsUrl =
    LINCOLN_BASE + getSelector("navigation.calendarSettings");
  console.log(`[STEP0] Navigating to calendar list: ${calendarSettingsUrl}`);
  await page.goto(calendarSettingsUrl, {
    waitUntil: "networkidle",
    timeout: 30000,
  });

  // 3. Find テストカレンダー in the list and click into detail
  const listItemSelector = getSelector("step0.calendarListItem");

  console.log(`[STEP0] Looking for: ${TARGET_CALENDAR_NAME}`);
  const calendarLink = page
    .locator(listItemSelector)
    .filter({ hasText: TARGET_CALENDAR_NAME })
    .first();

  if (!(await calendarLink.isVisible({ timeout: 10000 }).catch(() => false))) {
    throw new Error(
      `[STEP0] Calendar "${TARGET_CALENDAR_NAME}" not found in list`,
    );
  }

  console.log(`[STEP0] Found "${TARGET_CALENDAR_NAME}" — clicking...`);
  await Promise.all([
    page.waitForLoadState("networkidle", { timeout: 15000 }),
    calendarLink.click(),
  ]);
  console.log("[STEP0] Entered calendar detail page");

  // 4. Set period end date from max(date) in expected ranks
  await setPeriodEndDate(page, maxDate);

  // 5. Collect rank styles from the rank palette buttons
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

  // 6. Build selector config for DOM update
  const domSelectors: DomSelectors = {
    rankAnchor: getSelector("step0.rankAnchor"),
    rankText: getSelector("step0.rankText"),
    inputPriceRankCd: getSelector("step0.inputPriceRankCd"),
    defaultInputPriceRankCd: getSelector("step0.defaultInputPriceRankCd"),
    inputPriceRankNm: getSelector("step0.inputPriceRankNm"),
    inputRankStyleText: getSelector("step0.inputRankStyleText"),
  };

  // 7. Update calendar cells in the DOM
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
      "[STEP0] No cells were updated. Check date range or rank data.",
    );
  }

  // 8. Save — click doUpdate()
  // doUpdate() may trigger window.confirm(); Playwright dismisses by default,
  // so we must explicitly accept it for the save to proceed.
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

  // 9. Verify save result — check for error messages
  await page.waitForTimeout(1000);
  const errorMessage = await page.evaluate(() => {
    const errEl = document.querySelector(".c_txt-worning, .c_txt-error");
    return errEl ? (errEl.textContent || "").trim() : null;
  });

  if (errorMessage) {
    throw new Error(`[STEP0] Save failed: ${errorMessage}`);
  }

  console.log(
    `[STEP0] Calendar rank injection complete — ${result.updated} cells updated`,
  );
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
