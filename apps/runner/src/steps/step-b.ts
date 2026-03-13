/**
 * STEPB — Bulk price rank settings via 5050 page.
 *
 * Loop order: copy source group → months (not months → copy sources).
 * This ensures the autocomplete input value is reused across months,
 * avoiding redundant autocomplete operations for months 2+.
 *
 * For each (copySource, planGroupSet) pair:
 *   For each month in the expected ranks date range:
 *     1. Navigate to the month (via select[name="targetYm"])
 *     2. Select the plan group set
 *     3. Set or verify copy source calendar (autocomplete only on first month)
 *     4. doCopy() to copy calendar ranks into the plan grid
 *     5. doSend(true) to send & continue, or doSend(false) for the very last send
 *
 * Key discovery: doCopy() compares #selectPlanGrpName (hidden) with
 * #copyPlanGrpName (visible input). Both must match for copy to proceed.
 * If they don't match, doCopy() shows alert() and returns without submitting.
 *
 * Reference: docs/requirements.md §3.4, docs/design.md §3.7
 */

import type { Page } from "playwright";
import type { Job } from "../job-state.js";
import { getJobConfig } from "../job-state.js";
import { getSelector } from "../selectors.js";
import { getFacilityLincolnId } from "../facility-lookup.js";
import { FacilityMismatchError } from "../errors.js";
import { loadMonthRange } from "./step0-helpers.js";
import { LINCOLN_BASE } from "../constants.js";

/**
 * Check for error messages on the 5050 page.
 * Returns the error text if found, null otherwise.
 */
async function checkPageError(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const selectors = [".c_txt-worning", ".c_txt-error", ".errorArea", ".error"];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = (el.textContent || "").trim();
        if (text.length > 0) return text;
      }
    }
    return null;
  });
}

/** Collect page diagnostic info for failure logging */
async function dumpPageState(page: Page, label: string): Promise<void> {
  try {
    const url = page.url();
    const title = await page.title().catch(() => "(title unavailable)");
    console.log(`[STEPB] [${label}] URL: ${url}`);
    console.log(`[STEPB] [${label}] Title: ${title}`);
    const errorText = await checkPageError(page).catch(() => null);
    if (errorText) {
      console.log(`[STEPB] [${label}] Page error: ${errorText}`);
    }
  } catch (e) {
    console.log(`[STEPB] [${label}] Could not dump page state: ${e instanceof Error ? e.message : e}`);
  }
}

/** Normalize half-width parentheses to full-width (Lincoln uses full-width) */
function toFullWidth(s: string): string {
  return s.replace(/\(/g, "（").replace(/\)/g, "）");
}

/** Normalize full-width parentheses to half-width for comparison */
function toHalfWidth(s: string): string {
  return s.replace(/（/g, "(").replace(/）/g, ")");
}

/**
 * Check if copy source is already set correctly (input value + hidden fields).
 * Returns true if autocomplete can be skipped.
 *
 * After doCopy() + doSend(true), Lincoln preserves the copy source input
 * value across months, so months 2+ within the same copy source group
 * can skip the autocomplete entirely.
 *
 * Comparison uses half-width normalization because Lincoln stores full-width
 * parentheses but config may use half-width.
 */
async function isCopySourceReady(
  page: Page,
  copyInputSelector: string,
  copySource: string,
): Promise<boolean> {
  try {
    const { inputVal, selectVal, selectCd } = await page.evaluate(
      ({ inputSel }) => {
        const input = document.querySelector(inputSel) as HTMLInputElement | null;
        const selectName = document.querySelector("#selectPlanGrpName") as HTMLInputElement | null;
        const selectCode = document.querySelector("#selectPlanGrpCd") as HTMLInputElement | null;
        return {
          inputVal: input?.value ?? "",
          selectVal: selectName?.value ?? "",
          selectCd: selectCode?.value ?? "",
        };
      },
      { inputSel: copyInputSelector },
    );

    const normalizedSource = toHalfWidth(copySource);
    const inputMatch = toHalfWidth(inputVal) === normalizedSource;
    const selectMatch = toHalfWidth(selectVal) === normalizedSource;

    if (inputMatch && selectMatch && selectCd) {
      console.log(
        `[STEPB] Copy source "${copySource}" already set (selectPlanGrpCd="${selectCd}") — skipping autocomplete`,
      );
      return true;
    }

    if (inputMatch) {
      console.log(
        `[STEPB] Copy input has "${inputVal}" but hidden fields not ready ` +
        `(selectPlanGrpName="${selectVal}", selectPlanGrpCd="${selectCd}") — need autocomplete`,
      );
    }

    return false;
  } catch {
    return false;
  }
}

/** Maximum retries for autocomplete when exact match not found */
const AUTOCOMPLETE_MAX_RETRIES = 3;

/**
 * Trigger autocomplete dropdown using a 3-strategy approach.
 * Returns true if the dropdown appeared, false otherwise.
 *
 * 1. fill() + End key (fast path — triggers jQuery autocomplete via keydown)
 * 2. jQuery autocomplete("search") API (direct widget call)
 * 3. pressSequentially fallback (proven reliable, slowest)
 */
async function triggerAutocomplete(
  page: Page,
  inputLocator: ReturnType<Page["locator"]>,
  copyInputSelector: string,
  typingValue: string,
  attempt: number,
): Promise<boolean> {
  // Attempt 1: fill() + End key (fast path)
  console.log(`[STEPB] [fast] fill("${typingValue}") + press End`);
  await inputLocator.click();
  await inputLocator.fill(typingValue);

  const fillVal = await inputLocator.inputValue();
  console.log(`[STEPB] [fast] Input value after fill: "${fillVal}"`);

  if (fillVal === typingValue) {
    await inputLocator.press("End");
    try {
      await page.waitForSelector(
        "ul.ui-autocomplete li.ui-menu-item",
        { state: "visible", timeout: 3000 },
      );
      console.log("[STEPB] [fast] Autocomplete appeared via fill + End");
      return true;
    } catch {
      console.log("[STEPB] [fast] No dropdown — trying jQuery API");
    }
  }

  // Attempt 2: jQuery autocomplete("search") API
  const jqResult = await page.evaluate((sel) => {
    try {
      const $ = (window as any).jQuery || (window as any).$;
      if (!$) return "no-jquery";
      const $el = $(sel);
      if (!$el.length) return "no-element";
      if (!$el.data("ui-autocomplete") && !$el.data("autocomplete"))
        return "no-widget";
      $el.autocomplete("search", $el.val() as string);
      return "triggered";
    } catch (e) {
      return "error:" + String(e);
    }
  }, copyInputSelector);
  console.log(`[STEPB] [jq] autocomplete search: ${jqResult}`);

  if (jqResult === "triggered") {
    try {
      await page.waitForSelector(
        "ul.ui-autocomplete li.ui-menu-item",
        { state: "visible", timeout: 3000 },
      );
      console.log("[STEPB] [jq] Autocomplete appeared via jQuery API");
      return true;
    } catch {
      console.log("[STEPB] [jq] No dropdown — falling back to typing");
    }
  }

  // Attempt 3: pressSequentially fallback (proven reliable)
  // Use increasing delay on retries to improve headless stability
  const charDelay = attempt === 0 ? 50 : attempt === 1 ? 80 : 120;
  console.log(`[STEPB] [fallback] pressSequentially("${typingValue}", delay=${charDelay}ms)`);
  await inputLocator.click({ clickCount: 3 });
  await page.waitForTimeout(200);
  await inputLocator.press("Backspace");
  await page.waitForTimeout(200);
  await inputLocator.pressSequentially(typingValue, { delay: charDelay });

  // Wait longer for suggestions to appear in headless mode
  const waitTime = attempt === 0 ? 8000 : 12000;
  try {
    await page.waitForSelector(
      "ul.ui-autocomplete li.ui-menu-item",
      { state: "visible", timeout: waitTime },
    );
    console.log("[STEPB] [fallback] Autocomplete appeared via typing");
    return true;
  } catch {
    return false;
  }
}

/**
 * Collect visible autocomplete suggestions and find exact match.
 * Returns { clicked: true } if exact match was found and clicked,
 * or { clicked: false, suggestions } if no exact match.
 */
async function findAndClickExactMatch(
  page: Page,
  copySource: string,
): Promise<{ clicked: true } | { clicked: false; suggestions: string[] }> {
  const acItems = page.locator("ul.ui-autocomplete li.ui-menu-item a");
  const count = await acItems.count();

  // Collect all visible suggestions
  const suggestions: { index: number; text: string }[] = [];
  for (let i = 0; i < count; i++) {
    if (await acItems.nth(i).isVisible()) {
      const text = (await acItems.nth(i).textContent())?.trim() ?? "";
      suggestions.push({ index: i, text });
    }
  }
  console.log(
    `[STEPB] Autocomplete suggestions (${suggestions.length}): ` +
    suggestions.map((s) => `"${s.text}"`).join(", "),
  );

  // Exact match (handle half/full-width parentheses)
  const normalize = (s: string) => s.replace(/[（）]/g, (c) => c === "（" ? "(" : ")");
  const normalizedSource = normalize(copySource);
  for (const s of suggestions) {
    if (s.text === copySource || normalize(s.text) === normalizedSource) {
      console.log(`[STEPB] Clicking exact match: "${s.text}"`);
      await acItems.nth(s.index).click();
      return { clicked: true };
    }
  }

  return { clicked: false, suggestions: suggestions.map((s) => s.text) };
}

/**
 * Set copy source via autocomplete input with retry.
 *
 * Tries up to AUTOCOMPLETE_MAX_RETRIES times to trigger autocomplete and
 * find an exact match. If no exact match is found after all retries, throws
 * an error instead of selecting the wrong copy source (safety-critical).
 *
 * After the autocomplete suggestion is clicked, verifies that the hidden
 * fields (#selectPlanGrpName, #selectPlanGrpCd) are properly set.
 */
async function setCopySourceAutocomplete(
  page: Page,
  copyInputSelector: string,
  copySource: string,
): Promise<void> {
  const inputLocator = page.locator(copyInputSelector);
  await inputLocator.waitFor({ state: "visible", timeout: 5000 });

  // Use original value for autocomplete search — Lincoln's autocomplete
  // server matches against half-width parentheses (calendar names).
  // findAndClickExactMatch() handles both half/full-width for result matching.
  const typingValue = copySource;

  let lastSuggestions: string[] = [];

  for (let attempt = 0; attempt < AUTOCOMPLETE_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      console.log(
        `[STEPB] Autocomplete retry ${attempt}/${AUTOCOMPLETE_MAX_RETRIES - 1} ` +
        `for "${copySource}" — clearing input and waiting...`,
      );
      // Dismiss any open menu and clear input before retry
      await inputLocator.press("Escape").catch(() => {});
      await page.waitForTimeout(500);
      await inputLocator.click({ clickCount: 3 });
      await inputLocator.press("Backspace");
      await page.waitForTimeout(1000 * attempt); // Increasing backoff
    }

    const appeared = await triggerAutocomplete(
      page, inputLocator, copyInputSelector, typingValue, attempt,
    );

    if (!appeared) {
      if (attempt < AUTOCOMPLETE_MAX_RETRIES - 1) {
        console.log(`[STEPB] No suggestions appeared — will retry`);
        continue;
      }
      throw new Error(
        `[STEPB] No autocomplete suggestions appeared for "${typingValue}" ` +
        `(config: "${copySource}") after ${AUTOCOMPLETE_MAX_RETRIES} attempts.`,
      );
    }

    // Try to find and click exact match
    const result = await findAndClickExactMatch(page, copySource);

    if (result.clicked) {
      // Exact match found and clicked — proceed to verification
      await page.waitForTimeout(300);
      break;
    }

    // No exact match — record what we saw and retry
    lastSuggestions = result.suggestions;

    if (attempt < AUTOCOMPLETE_MAX_RETRIES - 1) {
      console.log(
        `[STEPB] No exact match for "${copySource}" — will retry ` +
        `(got: ${lastSuggestions.map((s) => `"${s}"`).join(", ")})`,
      );
      // Close the menu before retrying
      await inputLocator.press("Escape").catch(() => {});
      await page.waitForTimeout(500);
      continue;
    }

    // All retries exhausted — throw error (NEVER select wrong copy source)
    throw new Error(
      `[STEPB] No exact match for "${copySource}" after ${AUTOCOMPLETE_MAX_RETRIES} attempts. ` +
      `Suggestions were: ${lastSuggestions.map((s) => `"${s}"`).join(", ")}. ` +
      `Refusing to select wrong copy source — aborting to prevent incorrect data submission.`,
    );
  }

  // Verify hidden fields are set (doCopy requires them)
  const selectVal = await page.evaluate(() => {
    return (document.querySelector("#selectPlanGrpName") as HTMLInputElement)?.value ?? "";
  });
  const copyVal = await page.evaluate(() => {
    return (document.querySelector("#copyPlanGrpName") as HTMLInputElement)?.value ?? "";
  });
  const selectCd = await page.evaluate(() => {
    return (document.querySelector("#selectPlanGrpCd") as HTMLInputElement)?.value ?? "";
  });
  console.log(`[STEPB] selectPlanGrpName="${selectVal}", copyPlanGrpName="${copyVal}", selectPlanGrpCd="${selectCd}"`);

  if (selectVal !== copyVal) {
    console.log(`[STEPB] selectPlanGrpName mismatch — setting manually to "${copyVal}"`);
    await page.evaluate((val) => {
      const el = document.querySelector("#selectPlanGrpName") as HTMLInputElement;
      if (el) el.value = val;
    }, copyVal);
  }

  if (!selectCd) {
    console.warn(`[STEPB] selectPlanGrpCd is empty — autocomplete handler may not have fired properly`);
  }
}

/**
 * Track completed (group, month) pairs across retries within the same process.
 * Key format: `${jobId}::${copySource}::${planGroupSet}::${month}`
 * This allows retries to skip already-sent months, resuming from the failure point.
 */
const completedSends = new Set<string>();

export async function run(
  jobId: string,
  page: Page,
  job: Job,
): Promise<void> {
  console.log("[STEPB] Bulk price rank settings — start");

  // --- Read process_b_rows from job config ---
  const config = getJobConfig(job);
  const configRows = config.process_b_rows ?? [];
  const rows = configRows.filter((r) => r.copy_source && r.plan_group_set);
  if (rows.length === 0) {
    throw new Error("[STEPB] No process_b_rows configured in job config");
  }
  console.log(`[STEPB] ${rows.length} mapping row(s) from config:`);
  for (const r of rows) {
    console.log(`[STEPB]   ${r.copy_source} → ${r.plan_group_set}`);
  }

  // --- Load month range from expected ranks ---
  const months = await loadMonthRange(jobId);
  console.log(
    `[STEPB] Month range: ${months[0]} ~ ${months[months.length - 1]} (${months.length} months)`,
  );

  // --- Safety: verify facility ID before any data modification ---
  const expectedId = await getFacilityLincolnId(job.facility_id);

  // 1. Navigate directly to 5050 page
  const url5050 = LINCOLN_BASE + "Ascsc5050InitAction.do";
  console.log("[STEPB] Navigating to 5050 (料金ランク一括設定)");
  await page.goto(url5050, { waitUntil: "networkidle", timeout: 30000 });
  console.log(`[STEPB] On page: ${await page.title()}`);

  // 2. Verify facility ID (5050 uses hidden input, not header element)
  const actualId = await page
    .locator('input[name="displayLincolnInnId"]')
    .getAttribute("value");
  console.log(
    `[STEPB] Facility ID check: expected="${expectedId}", actual="${actualId}"`,
  );
  if (actualId !== expectedId) {
    throw new FacilityMismatchError(expectedId, actualId ?? "");
  }
  console.log("[STEPB] Facility ID verified OK");

  // 3. Set up dialog handler — distinguish alert (error) vs confirm (submission)
  let lastDialogType: "alert" | "confirm" | null = null;
  let lastDialogMessage = "";
  const dialogLog: string[] = []; // Full dialog history for diagnostics
  const dialogHandler = async (dialog: import("playwright").Dialog) => {
    lastDialogType = dialog.type() as "alert" | "confirm";
    lastDialogMessage = dialog.message();
    const ts = new Date().toISOString().slice(11, 23);
    const entry = `[${ts}] ${lastDialogType}: "${lastDialogMessage}"`;
    dialogLog.push(entry);
    console.log(`[STEPB] Dialog ${entry} — accepting`);
    try {
      await dialog.accept();
    } catch {
      // Dialog already handled (e.g. auto-dismissed) — safe to ignore
      console.log(`[STEPB] Dialog already handled — ignoring`);
    }
  };
  page.on("dialog", dialogHandler);

  // 3b. Keep send popup open for reuse — Lincoln's window.open() uses a named
  //     window, so keeping it open lets subsequent sends reuse it instead of
  //     opening new windows (reduces context.on("page") events and context
  //     destruction risk).
  let sendPopup: import("playwright").Page | null = null;
  const contextPageHandler = async (newPage: import("playwright").Page) => {
    if (newPage !== page) {
      if (!sendPopup) {
        sendPopup = newPage;
        console.log(`[STEPB] Send popup opened: ${newPage.url()} — keeping open for reuse`);
      } else {
        // Unexpected additional window → close it
        console.log(`[STEPB] Unexpected popup: ${newPage.url()} — closing`);
        await newPage.close().catch(() => {});
      }
    }
  };
  page.context().on("page", contextPageHandler);

  // 4. Selectors
  const copyInputSelector = getSelector("stepB.autoCompleteInput");
  const copyBtn = getSelector("stepB.copyButton");
  const sendContinueBtn = getSelector("stepB.sendContinueButton");
  const sendCloseBtn = getSelector("stepB.sendCloseButton");
  const monthSelect = getSelector("stepB.monthSelect");
  const popupBtnSel = getSelector("stepB.planGroupSetPopupBtn");
  const popupListSel = getSelector("stepB.planGroupSetPopupList");

  // 4b. Build name→dataId map from popup for plan group set selection
  //     The popup contains ALL sets (direct links only show up to 3).
  console.log("[STEPB] Reading plan group sets from popup...");
  await page.locator(popupBtnSel).click();
  await page.waitForTimeout(500);
  const planGroupSetMap = new Map<string, string>();
  const popupItems = await page.$$eval(popupListSel, (lis) =>
    lis.map((li) => ({
      name: (li.querySelector("a")?.textContent || "").trim(),
      dataId: li.getAttribute("data-id") || "",
    })).filter((x) => x.name.length > 0 && x.dataId.length > 0),
  );
  for (const item of popupItems) {
    planGroupSetMap.set(item.name, item.dataId);
    console.log(`[STEPB]   Plan group set: "${item.name}" (id=${item.dataId})`);
  }
  // Close popup
  await page.locator(popupBtnSel).click().catch(() => {});
  await page.waitForTimeout(300);

  // Build unique (copySource, planGroupSet) pairs in config order.
  // Outer loop iterates these groups; inner loop iterates months.
  // This way the autocomplete input value persists across months.
  const copySourceGroups: { copySource: string; planGroupSet: string }[] = [];
  const seenPairs = new Set<string>();
  for (const r of rows) {
    const key = `${r.copy_source}::${r.plan_group_set}`;
    if (!seenPairs.has(key)) {
      seenPairs.add(key);
      copySourceGroups.push({ copySource: r.copy_source, planGroupSet: r.plan_group_set });
    }
  }

  console.log(`[STEPB] ${copySourceGroups.length} copy source group(s):`);
  for (const g of copySourceGroups) {
    console.log(`[STEPB]   ${g.copySource} → ${g.planGroupSet}`);
  }

  // Track retries per send (for MBLK0012 — server busy processing previous send)
  const sendRetryCount = new Map<string, number>();
  const MAX_SEND_RETRIES = 3;

  // 5. Loop: for each copy source group → for each month → copy → send
  //    This order ensures the copy source input is reused across months,
  //    avoiding redundant autocomplete operations for months 2+.
  for (let gi = 0; gi < copySourceGroups.length; gi++) {
    const { copySource, planGroupSet } = copySourceGroups[gi];
    const isLastGroup = gi === copySourceGroups.length - 1;

    console.log(
      `\n[STEPB] ══════════════════════════════════════════`,
    );
    console.log(
      `[STEPB] Copy source group ${gi + 1}/${copySourceGroups.length}: ${copySource} → ${planGroupSet}`,
    );
    console.log(
      `[STEPB] ══════════════════════════════════════════`,
    );

    for (let mi = 0; mi < months.length; mi++) {
      const month = months[mi];
      const isLastMonth = mi === months.length - 1;
      const monthLabel = `${month.substring(0, 4)}年${month.substring(4)}月`;
      const retryKey = `${copySource}::${planGroupSet}::${month}`;

      // Skip already-completed sends (from previous retry within same process)
      const sendKey = `${jobId}::${copySource}::${planGroupSet}::${month}`;
      if (completedSends.has(sendKey)) {
        console.log(
          `[STEPB] Skipping ${copySource} — ${monthLabel} (already completed in previous attempt)`,
        );
        continue;
      }

      console.log(
        `\n[STEPB] ═══ ${copySource} — Month ${mi + 1}/${months.length}: ${monthLabel} ═══`,
      );

      // 5a. Navigate to the target month
      const monthOptionValue = `${month}_0`;
      const monthSelectLocator = page.locator(monthSelect);

      // Check if the month option exists (with stability wait)
      await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
      const optionExists = await page.evaluate(
        ({ sel, val }) => {
          const select = document.querySelector(sel) as HTMLSelectElement | null;
          if (!select) return false;
          return Array.from(select.options).some((o) => o.value === val);
        },
        { sel: monthSelect, val: monthOptionValue },
      );

      if (!optionExists) {
        console.warn(
          `[STEPB] Month option ${monthOptionValue} not available in dropdown — skipping`,
        );
        continue;
      }

      // Select the month and trigger doDisplay() only if needed
      const currentVal = await monthSelectLocator.inputValue().catch(() => "");
      if (currentVal !== monthOptionValue) {
        console.log(`[STEPB] Selecting month: ${monthOptionValue}`);

        // selectOption may trigger onchange→doDisplay() automatically,
        // starting a navigation. The explicit evaluate(doDisplay) is a
        // fallback in case onchange doesn't fire — but if the context is
        // already destroyed by the auto-navigation, we ignore the error.
        await Promise.all([
          page.waitForNavigation({ waitUntil: "networkidle", timeout: 30000 }),
          (async () => {
            await monthSelectLocator.selectOption(monthOptionValue);
            await page.evaluate(() => {
              if (typeof (window as any).doDisplay === "function") {
                (window as any).doDisplay();
              }
            }).catch(() => {
              // Context destroyed = onchange already triggered navigation — OK
            });
          })(),
        ]);
        await page.waitForSelector('input[name="displayLincolnInnId"]', {
          state: "attached",
          timeout: 10000,
        });
        await page.waitForFunction(
          () => typeof (window as any).selectPlanGroupSet === "function",
          { timeout: 10000 },
        );
      }

      console.log(`[STEPB] On month: ${monthLabel}`);

      // 5b. Select the plan group set via selectPlanGroupSet(data-id)
      //     Uses the popup-derived name→dataId map (supports 4+ sets).
      console.log(`[STEPB] --- Plan group set: ${planGroupSet} ---`);
      const dataId = planGroupSetMap.get(planGroupSet);
      if (!dataId) {
        throw new Error(
          `[STEPB] Plan group set "${planGroupSet}" not found. ` +
          `Available: ${[...planGroupSetMap.keys()].join(", ")}`,
        );
      }

      await page.evaluate((id) => (window as any).selectPlanGroupSet(id), dataId);
      // Wait for AJAX success callback to complete DOM updates + widget re-initialization
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(500);
      console.log(`[STEPB] Plan group set selected: ${planGroupSet} (id=${dataId})`);

      // 5c. Set copy source (with reuse optimization)
      //     After doCopy() + doSend(true), Lincoln preserves the copy source
      //     input. Months 2+ within the same copy source group can skip autocomplete.
      const alreadySet = await isCopySourceReady(page, copyInputSelector, copySource);
      if (!alreadySet) {
        console.log(`[STEPB] Setting copy source: ${copySource}`);
        await setCopySourceAutocomplete(page, copyInputSelector, copySource);
      }

      // 5d. Click copy (doCopy) — reset dialog tracker
      lastDialogType = null;
      lastDialogMessage = "";

      console.log("[STEPB] Clicking copy (doCopy)...");
      const copyButton = page.locator(copyBtn);
      await copyButton.waitFor({ state: "visible", timeout: 5000 });

      // Click and wait for either navigation (success) or alert (failure)
      // doCopy() success → POST to Ascsc5050CopyAction.do (page navigates)
      // doCopy() failure → alert() shown, no navigation
      let copyNavigated = false;
      try {
        await Promise.all([
          page.waitForURL("**/Ascsc5050CopyAction.do**", { timeout: 10000 }),
          copyButton.click(),
        ]);
        copyNavigated = true;
      } catch {
        // Navigation didn't happen — check why
        copyNavigated = false;
      }

      // Check if doCopy showed an alert (= validation failure, no form submitted)
      if (lastDialogType === "alert") {
        throw new Error(
          `[STEPB] doCopy() validation failed: "${lastDialogMessage}"`,
        );
      }

      // If no navigation and no alert, doCopy() silently failed
      if (!copyNavigated) {
        const selectVal = await page.evaluate(() =>
          (document.querySelector("#selectPlanGrpName") as HTMLInputElement)?.value ?? "",
        );
        const selectCd = await page.evaluate(() =>
          (document.querySelector("#selectPlanGrpCd") as HTMLInputElement)?.value ?? "",
        );
        const copyVal = await page.evaluate(() =>
          (document.querySelector("#copyPlanGrpName") as HTMLInputElement)?.value ?? "",
        );
        throw new Error(
          `[STEPB] doCopy() did not trigger form submission. ` +
          `selectPlanGrpName="${selectVal}", selectPlanGrpCd="${selectCd}", ` +
          `copyPlanGrpName="${copyVal}". URL stayed at: ${page.url()}`,
        );
      }

      // Wait for page to fully load after successful copy
      await page.waitForLoadState("networkidle", { timeout: 30000 });
      await page.waitForTimeout(500);
      console.log(`[STEPB] Copy navigated to: ${page.url()}`);

      // Check for errors after copy
      const copyError = await checkPageError(page);
      if (copyError) {
        console.log(`[STEPB] Post-copy message: ${copyError}`);
        if (copyError.match(/MSF[WE]\d{4}|MASC\d{4}/)) {
          throw new Error(`[STEPB] Copy failed: ${copyError}`);
        }
      }
      console.log(`[STEPB] Copy done: ${copySource} → ${planGroupSet}`);

      // 5e. Send: doSend(true) for all except the very last send → doSend(false)
      //     Dynamically check remaining sends (accounting for skipped completions)
      const hasRemainingSends = (() => {
        for (let rgi = gi; rgi < copySourceGroups.length; rgi++) {
          const rg = copySourceGroups[rgi];
          const startMi = rgi === gi ? mi + 1 : 0;
          for (let rmi = startMi; rmi < months.length; rmi++) {
            const rKey = `${jobId}::${rg.copySource}::${rg.planGroupSet}::${months[rmi]}`;
            if (!completedSends.has(rKey)) return true;
          }
        }
        return false;
      })();
      const isLastSendOverall = !hasRemainingSends;
      const sendBtn = isLastSendOverall ? sendCloseBtn : sendContinueBtn;
      const sendLabel = isLastSendOverall ? "送信して閉じる" : "送信して続ける";
      console.log(`[STEPB] Clicking ${sendLabel}...`);

      // Reset dialog tracker; keep dialogLog for cumulative history
      lastDialogType = null;
      lastDialogMessage = "";
      const dialogCountBefore = dialogLog.length;

      const sendButton = page.locator(sendBtn);
      await sendButton.waitFor({ state: "visible", timeout: 5000 });

      // doSend flow: confirm → accept → form POST → server processes →
      //   alert "処理を受け付けました。" → popup (Comsc0040InitAction) → page settles
      // networkidle resolves immediately because confirm blocks JS (0 pending requests).
      // Instead of fixed wait, poll for the server-response alert to arrive.
      const sendStartTime = Date.now();
      await sendButton.click();

      // Wait for alert dialog (signals server finished processing).
      // The confirm fires immediately; the alert arrives 1-4s later after POST.
      const SEND_ALERT_TIMEOUT = 30000;
      const alertPollStart = Date.now();
      while (Date.now() - alertPollStart < SEND_ALERT_TIMEOUT) {
        const postSendDialogs = dialogLog.slice(dialogCountBefore);
        const hasAlert = postSendDialogs.some((d) => d.includes("alert:"));
        if (hasAlert) break;
        await page.waitForTimeout(500);
      }

      // First send: wait for popup window to open (Lincoln opens it via window.open)
      // Subsequent sends: window.open reuses the existing popup — no new page event
      if (!sendPopup) {
        const popupWaitStart = Date.now();
        while (!sendPopup && Date.now() - popupWaitStart < 5000) {
          await page.waitForTimeout(300);
        }
        if (sendPopup) {
          console.log(`[STEPB] Send popup captured — will reuse for subsequent sends`);
        }
      } else {
        // Existing popup gets updated by window.open — short wait is enough
        await page.waitForTimeout(500);
      }
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

      // Log dialogs received during this send
      const newDialogs = dialogLog.slice(dialogCountBefore);
      if (newDialogs.length > 0) {
        console.log(`[STEPB] Dialogs during send (${newDialogs.length}):`);
        for (const d of newDialogs) console.log(`[STEPB]   ${d}`);
      } else {
        console.log(`[STEPB] No dialogs received during send — confirm may not have fired`);
      }

      // Check for errors after send
      let sendError: string | null = null;
      try {
        sendError = await checkPageError(page);
      } catch (evalErr) {
        const errMsg = evalErr instanceof Error ? evalErr.message : String(evalErr);
        console.log(`[STEPB] Post-send eval failed: ${errMsg}`);
        // Alert arrived but page context may still be settling — wait and retry
        await page.waitForTimeout(3000);
        await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
        try {
          sendError = await checkPageError(page);
        } catch (retryErr) {
          const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
          console.log(`[STEPB] Retry also failed: ${retryMsg}`);
          await dumpPageState(page, "retry-failed");
          throw new Error(
            `[STEPB] Cannot evaluate page after send for ${monthLabel}: ${retryMsg}`,
          );
        }
      }

      const totalSendTime = Date.now() - sendStartTime;
      console.log(`[STEPB] Send cycle completed in ${totalSendTime}ms`);

      if (sendError) {
        console.log(`[STEPB] Post-send message: ${sendError}`);
        // MASC0155 = "変更内容がありません" — ranks already match, not an error
        if (sendError.includes("MASC0155")) {
          console.log(`[STEPB] MASC0155: No changes for ${monthLabel} — ranks already up to date`);
        }
        // MBLK0012 = "選択された日が別の操作により更新処理中" — server still processing
        else if (sendError.includes("MBLK0012")) {
          const retries = sendRetryCount.get(retryKey) ?? 0;
          if (retries < MAX_SEND_RETRIES) {
            sendRetryCount.set(retryKey, retries + 1);
            console.log(
              `[STEPB] MBLK0012: Server busy — waiting 15s then retrying ` +
              `${monthLabel} (retry ${retries + 1}/${MAX_SEND_RETRIES})`,
            );
            await page.waitForTimeout(15000);
            // Re-navigate to 5050 to get a clean page state
            await page.goto(url5050, { waitUntil: "networkidle", timeout: 30000 });
            mi--; // Retry this month from the top of the loop
            continue;
          }
          await dumpPageState(page, "MBLK0012-exhausted");
          throw new Error(
            `[STEPB] Send failed for ${monthLabel} after ${MAX_SEND_RETRIES} retries: ${sendError}`,
          );
        }
        // Other Lincoln errors — fail
        else if (sendError.match(/MSF[WE]\d{4}|MASC\d{4}|MBLK\d{4}/)) {
          await dumpPageState(page, "send-error");
          throw new Error(
            `[STEPB] Send failed for ${monthLabel}: ${sendError}`,
          );
        }
      }

      console.log(`[STEPB] ✓ ${copySource} — ${monthLabel} — done`);
      completedSends.add(sendKey);

      // Inter-send delay: let the server finish processing before next send
      // Prevents MBLK0012 ("別の操作により更新処理中") on the next send
      if (!isLastSendOverall) {
        console.log(`[STEPB] Waiting 2s for server processing before next send...`);
        await page.waitForTimeout(2000);
      }
    }
  }

  page.off("dialog", dialogHandler);
  page.context().off("page", contextPageHandler);
  // Close the send popup now that STEPB is complete
  if (sendPopup) {
    console.log(`[STEPB] Closing send popup`);
    await (sendPopup as import("playwright").Page).close().catch(() => {});
  }

  const totalSends = copySourceGroups.length * months.length;
  console.log(
    `\n[STEPB] Bulk price rank settings complete — ` +
    `${copySourceGroups.length} group(s) x ${months.length} month(s) = ${totalSends} send(s)`,
  );
  console.log(`[STEPB] Total dialogs received: ${dialogLog.length}`);
  if (sendRetryCount.size > 0) {
    console.log(`[STEPB] Send retries: ${[...sendRetryCount.entries()].map(([k, c]) => `${k}(${c})`).join(", ")}`);
  }
}
