/**
 * STEPB — Bulk price rank settings via 5050 page.
 *
 * For each month in the expected ranks date range:
 *   1. Navigate to the month (via select[name="targetYm"])
 *   2. Select the plan group set (カレンダーテスト)
 *   3. Select copy source calendar via autocomplete → doCopy()
 *   4. doSend(true) to send & continue, or doSend(false) for the last month
 *
 * Key discovery: doCopy() compares #selectPlanGrpName (hidden) with
 * #copyPlanGrpName (visible input). Both must match for copy to proceed.
 * If they don't match, doCopy() shows alert() and returns without submitting.
 *
 * Reference: docs/requirements.md §3.4, docs/design.md §3.7
 */

import type { Page } from "playwright";
import type { Job } from "../job-state.js";
import { getSelector } from "../selectors.js";
import { getFacilityLincolnId } from "../facility-lookup.js";
import { FacilityMismatchError } from "../errors.js";
import { loadMonthRange } from "./step0-helpers.js";

const LINCOLN_BASE = "https://www.tl-lincoln.net/accomodation/";

interface ProcessBRow {
  copy_source: string;
  plan_group_set: string;
  plan_name: string;
}

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

export async function run(
  jobId: string,
  page: Page,
  job: Job,
): Promise<void> {
  console.log("[STEPB] Bulk price rank settings — start");

  // --- Read process_b_rows from job config ---
  const configRows = (job.config_json?.process_b_rows ?? []) as ProcessBRow[];
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
  const dialogHandler = async (dialog: import("playwright").Dialog) => {
    lastDialogType = dialog.type() as "alert" | "confirm";
    lastDialogMessage = dialog.message();
    console.log(`[STEPB] Dialog [${lastDialogType}]: "${lastDialogMessage}" — accepting`);
    try {
      await dialog.accept();
    } catch {
      // Dialog already handled (e.g. auto-dismissed) — safe to ignore
      console.log(`[STEPB] Dialog already handled — ignoring`);
    }
  };
  page.on("dialog", dialogHandler);

  // 3b. Auto-close popup windows (doSend opens a popup after submission)
  const popupHandler = async (popup: import("playwright").Page) => {
    const popupUrl = popup.url();
    console.log(`[STEPB] Popup opened: ${popupUrl} — closing`);
    await popup.close().catch(() => {});
  };
  page.on("popup", popupHandler);
  page.context().on("page", async (newPage) => {
    if (newPage !== page) {
      console.log(`[STEPB] New page opened: ${newPage.url()} — closing`);
      await newPage.close().catch(() => {});
    }
  });

  // 4. Selectors
  const planGroupSetSelector = getSelector("stepB.planGroupSetItem");
  const copyInputSelector = getSelector("stepB.autoCompleteInput");
  const copyBtn = getSelector("stepB.copyButton");
  const sendContinueBtn = getSelector("stepB.sendContinueButton");
  const sendCloseBtn = getSelector("stepB.sendCloseButton");
  const monthSelect = getSelector("stepB.monthSelect");

  // Deduplicate rows by plan_group_set (group copy sources per set)
  const setToCopySources = new Map<string, string[]>();
  for (const r of rows) {
    const existing = setToCopySources.get(r.plan_group_set) ?? [];
    if (!existing.includes(r.copy_source)) {
      existing.push(r.copy_source);
    }
    setToCopySources.set(r.plan_group_set, existing);
  }

  // 5. Loop: for each month → for each mapping row → select set → copy → send
  for (let mi = 0; mi < months.length; mi++) {
    const month = months[mi];
    const isLastMonth = mi === months.length - 1;
    const monthLabel = `${month.substring(0, 4)}年${month.substring(4)}月`;

    console.log(
      `\n[STEPB] ═══ Month ${mi + 1}/${months.length}: ${monthLabel} ═══`,
    );

    // 5a. Navigate to the target month
    const monthOptionValue = `${month}_0`;
    const monthSelectLocator = page.locator(monthSelect);

    // Check if the month option exists
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

    // Select the month and trigger doDisplay()
    const currentVal = await monthSelectLocator.inputValue().catch(() => "");
    if (mi === 0 || currentVal !== monthOptionValue) {
      console.log(`[STEPB] Selecting month: ${monthOptionValue}`);
      await monthSelectLocator.selectOption(monthOptionValue);
      // Trigger doDisplay() explicitly via JavaScript
      await page.evaluate(() => {
        if (typeof (window as any).doDisplay === "function") {
          (window as any).doDisplay();
        }
      });
      await page.waitForLoadState("networkidle", { timeout: 30000 });
      await page.waitForTimeout(1000);
    }

    console.log(`[STEPB] On month: ${monthLabel}`);

    // 5b. For each plan group set: select set → set copy source → copy
    for (const [setName, copySources] of setToCopySources) {
      console.log(`[STEPB] --- Plan group set: ${setName} ---`);

      // Select the plan group set
      const setItem = page
        .locator(planGroupSetSelector)
        .filter({ hasText: setName })
        .first();

      if (!(await setItem.isVisible({ timeout: 5000 }).catch(() => false))) {
        throw new Error(
          `[STEPB] Plan group set "${setName}" not found on 5050 page`,
        );
      }

      await setItem.click();
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1000);
      console.log(`[STEPB] Plan group set selected: ${setName}`);

      // For each copy source calendar in this set
      for (const copySource of copySources) {
        console.log(`[STEPB] Setting copy source: ${copySource}`);

        // 5c. Set copy source via autocomplete
        const inputLocator = page.locator(copyInputSelector);
        await inputLocator.waitFor({ state: "visible", timeout: 5000 });

        // --- Strategy: fill() for speed + keydown to trigger jQuery autocomplete ---
        // Playwright fill() sets value instantly but doesn't fire keydown events.
        // jQuery UI autocomplete only triggers search on keydown events.
        // So: fill() → press End key → autocomplete fires with current input value.

        let autocompleteAppeared = false;

        // Attempt 1: fill() + End key (fast path)
        console.log(`[STEPB] [fast] fill("${copySource}") + press End`);
        await inputLocator.click();
        await inputLocator.fill(copySource);

        const fillVal = await inputLocator.inputValue();
        console.log(`[STEPB] [fast] Input value after fill: "${fillVal}"`);

        if (fillVal === copySource) {
          // Press End to fire a keydown event — triggers jQuery's search timer
          await inputLocator.press("End");
          try {
            await page.waitForSelector(
              "ul.ui-autocomplete li.ui-menu-item",
              { state: "visible", timeout: 3000 },
            );
            autocompleteAppeared = true;
            console.log("[STEPB] [fast] Autocomplete appeared via fill + End");
          } catch {
            console.log("[STEPB] [fast] No dropdown — trying jQuery API");
          }
        }

        // Attempt 2: jQuery autocomplete("search") API
        if (!autocompleteAppeared) {
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
              autocompleteAppeared = true;
              console.log("[STEPB] [jq] Autocomplete appeared via jQuery API");
            } catch {
              console.log("[STEPB] [jq] No dropdown — falling back to typing");
            }
          }
        }

        // Attempt 3: pressSequentially fallback (proven reliable)
        if (!autocompleteAppeared) {
          console.log(`[STEPB] [fallback] pressSequentially("${copySource}")`);
          await inputLocator.click({ clickCount: 3 });
          await page.waitForTimeout(100);
          await inputLocator.press("Backspace");
          await page.waitForTimeout(100);
          await inputLocator.pressSequentially(copySource, { delay: 50 });

          try {
            await page.waitForSelector(
              "ul.ui-autocomplete li.ui-menu-item",
              { state: "visible", timeout: 8000 },
            );
            console.log("[STEPB] [fallback] Autocomplete appeared via typing");
          } catch {
            throw new Error(
              `[STEPB] No autocomplete suggestions appeared for "${copySource}".`,
            );
          }
        }

        // Click the first visible autocomplete suggestion
        const acItems = page.locator("ul.ui-autocomplete li.ui-menu-item a");
        const count = await acItems.count();
        let clicked = false;
        for (let i = 0; i < count; i++) {
          if (await acItems.nth(i).isVisible()) {
            const text = await acItems.nth(i).textContent();
            console.log(`[STEPB] Clicking autocomplete suggestion: "${text?.trim()}"`);
            await acItems.nth(i).click();
            clicked = true;
            break;
          }
        }
        if (!clicked) {
          throw new Error("[STEPB] No visible autocomplete suggestion to click");
        }
        await page.waitForTimeout(300);

        // CRITICAL: Verify hidden fields are set (doCopy requires them)
        // selectPlanGrpName must match copyPlanGrpName (visible input)
        // selectPlanGrpCd must also be set (calendar code, e.g. "4")
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

        // 5d. Click copy (doCopy) — reset dialog tracker
        lastDialogType = null;
        lastDialogMessage = "";

        console.log("[STEPB] Clicking copy (doCopy)...");
        const copyButton = page.locator(copyBtn);
        await copyButton.waitFor({ state: "visible", timeout: 5000 });

        // Record URL before copy to detect navigation
        const urlBeforeCopy = page.url();

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
          const currentUrl = page.url();
          throw new Error(
            `[STEPB] doCopy() did not trigger form submission. ` +
            `selectPlanGrpName="${selectVal}", selectPlanGrpCd="${selectCd}", ` +
            `copyPlanGrpName="${copyVal}". URL stayed at: ${currentUrl}`,
          );
        }

        // Wait for page to fully load after successful copy
        await page.waitForLoadState("networkidle", { timeout: 30000 });
        await page.waitForTimeout(1000);
        console.log(`[STEPB] Copy navigated to: ${page.url()}`);

        // Check for errors after copy
        const copyError = await checkPageError(page);
        if (copyError) {
          console.log(`[STEPB] Post-copy message: ${copyError}`);
          if (copyError.match(/MSF[WE]\d{4}|MASC\d{4}/)) {
            throw new Error(`[STEPB] Copy failed: ${copyError}`);
          }
        }
        console.log(`[STEPB] Copy done: ${copySource} → ${setName}`);
      }
    }

    // 5e. Send: doSend(true) for all but last month, doSend(false) for last
    const sendBtn = isLastMonth ? sendCloseBtn : sendContinueBtn;
    const sendLabel = isLastMonth ? "送信して閉じる" : "送信して続ける";
    console.log(`[STEPB] Clicking ${sendLabel}...`);

    // Reset dialog tracker
    lastDialogType = null;
    lastDialogMessage = "";

    const sendButton = page.locator(sendBtn);
    await sendButton.waitFor({ state: "visible", timeout: 5000 });
    await Promise.all([
      page.waitForLoadState("networkidle", { timeout: 60000 }),
      sendButton.click(),
    ]);
    await page.waitForTimeout(2000);

    // Check for errors after send
    const sendError = await checkPageError(page);
    if (sendError) {
      console.log(`[STEPB] Post-send message: ${sendError}`);
      // MASC0155 = "変更内容がありません" — ranks already match, not an error
      if (sendError.includes("MASC0155")) {
        console.log(`[STEPB] MASC0155: No changes for ${monthLabel} — ranks already up to date`);
      } else if (sendError.match(/MSF[WE]\d{4}|MASC\d{4}/)) {
        throw new Error(
          `[STEPB] Send failed for ${monthLabel}: ${sendError}`,
        );
      }
    }

    console.log(`[STEPB] ✓ ${monthLabel} — done`);
  }

  page.off("dialog", dialogHandler);
  page.off("popup", popupHandler);

  console.log(
    `\n[STEPB] Bulk price rank settings complete — ${months.length} month(s) processed`,
  );
}
