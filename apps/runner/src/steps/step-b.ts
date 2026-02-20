/**
 * STEPB — Bulk price rank settings via 5050 page.
 *
 * For each month in the expected ranks date range:
 *   1. Navigate to the month (via select[name="targetYm"])
 *   2. Select the plan group set (カレンダーテスト)
 *   3. Select copy source calendar via autocomplete → doCopy()
 *   4. doSend(true) to send & continue, or doSend(false) for the last month
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
const COPY_SOURCE_CALENDAR = "テストカレンダー";

export async function run(
  jobId: string,
  page: Page,
  job: Job,
  planGroupSetNames?: string[],
): Promise<void> {
  console.log("[STEPB] Bulk price rank settings — start");

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

  // 3. Set up confirm dialog handler — accept for actual registration
  const dialogHandler = async (dialog: import("playwright").Dialog) => {
    console.log(`[STEPB] Dialog: "${dialog.message()}" — accepting`);
    await dialog.accept();
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
  const targetSets = planGroupSetNames || ["カレンダーテスト"];
  const planGroupSetSelector = getSelector("stepB.planGroupSetItem");
  const copyInput = getSelector("stepB.autoCompleteInput");
  const autoItem = getSelector("stepB.autoCompleteItem");
  const copyBtn = getSelector("stepB.copyButton");
  const sendContinueBtn = getSelector("stepB.sendContinueButton");
  const sendCloseBtn = getSelector("stepB.sendCloseButton");
  const monthSelect = getSelector("stepB.monthSelect");
  const nextMonthBtn = getSelector("stepB.nextMonthButton");

  // 5. Loop: for each month → select month → select plan group → copy → send
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

    // Select the month (triggers doDisplay())
    if (mi === 0) {
      // First month: use select dropdown
      await monthSelectLocator.selectOption(monthOptionValue);
      await page.waitForLoadState("networkidle", { timeout: 15000 });
      await page.waitForTimeout(1000);
    } else {
      // After doSend(true), page reloads — use next month button or select
      // Check current month first
      const currentVal = await monthSelectLocator.inputValue();
      if (currentVal !== monthOptionValue) {
        await monthSelectLocator.selectOption(monthOptionValue);
        await page.waitForLoadState("networkidle", { timeout: 15000 });
        await page.waitForTimeout(1000);
      }
    }

    console.log(`[STEPB] On month: ${monthLabel}`);

    // 5b. Select the plan group set
    for (const setName of targetSets) {
      const setItem = page
        .locator(planGroupSetSelector)
        .filter({ hasText: setName })
        .first();

      if (!(await setItem.isVisible({ timeout: 5000 }).catch(() => false))) {
        console.warn(
          `[STEPB] Plan group set "${setName}" not found — skipping`,
        );
        continue;
      }

      // Check if already selected (highlighted) — if not, click
      const isAlreadySelected = await setItem.evaluate((el) =>
        el.classList.contains("active") ||
        el.classList.contains("selected") ||
        el.getAttribute("style")?.includes("font-weight") ||
        false,
      );

      if (!isAlreadySelected) {
        await setItem.click();
        await page.waitForTimeout(1000);
      }
      console.log(`[STEPB] Plan group set: ${setName}`);
    }

    // 5c. Set copy source via autocomplete
    console.log(`[STEPB] Setting copy source: ${COPY_SOURCE_CALENDAR}`);
    await page.locator(copyInput).clear();
    await page.locator(copyInput).fill(COPY_SOURCE_CALENDAR);
    await page.waitForTimeout(1000);

    // Click autocomplete suggestion
    const suggestion = page.locator(autoItem).first();
    if (await suggestion.isVisible({ timeout: 5000 }).catch(() => false)) {
      const text = await suggestion.textContent();
      console.log(`[STEPB] Selecting autocomplete: "${text?.trim()}"`);
      await suggestion.click();
      await page.waitForTimeout(500);
    } else {
      console.warn("[STEPB] No autocomplete suggestion — pressing Enter");
      await page.locator(copyInput).press("Enter");
      await page.waitForTimeout(500);
    }

    // 5d. Click copy (doCopy)
    console.log("[STEPB] Clicking copy (doCopy)...");
    await Promise.all([
      page.waitForLoadState("networkidle", { timeout: 30000 }),
      page.locator(copyBtn).click(),
    ]);
    await page.waitForTimeout(1000);

    // Check for errors after copy
    const copyMsg = await page.evaluate(() => {
      const el = document.querySelector(".c_txt-worning");
      return el ? (el.textContent || "").trim() : null;
    });
    if (copyMsg) {
      console.log(`[STEPB] Copy message: ${copyMsg}`);
    }
    console.log("[STEPB] Copy done");

    // 5e. Send: doSend(true) for all but last month, doSend(false) for last
    const sendBtn = isLastMonth ? sendCloseBtn : sendContinueBtn;
    const sendLabel = isLastMonth ? "送信して閉じる" : "送信して続ける";
    console.log(`[STEPB] Clicking ${sendLabel}...`);

    await Promise.all([
      page.waitForLoadState("networkidle", { timeout: 60000 }),
      page.locator(sendBtn).click(),
    ]);
    await page.waitForTimeout(2000);

    // Check for errors after send
    const sendMsg = await page.evaluate(() => {
      const el = document.querySelector(".c_txt-worning, .c_txt-error");
      const text = el ? (el.textContent || "").trim() : null;
      if (text && text.includes("MASC")) return text;
      return null;
    });
    if (sendMsg) {
      console.warn(`[STEPB] Post-send message: ${sendMsg}`);
    }

    console.log(`[STEPB] ✓ ${monthLabel} — done`);
  }

  page.off("dialog", dialogHandler);
  page.off("popup", popupHandler);

  console.log(
    `\n[STEPB] Bulk price rank settings complete — ${months.length} month(s) processed`,
  );
}
