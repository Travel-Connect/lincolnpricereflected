/**
 * 5070 DOM Capture — 検索後のプラン選択 UI を解析するスクリプト。
 *
 * Usage:
 *   cd apps/runner
 *   npx tsx ../../scripts/web-capture-5070.ts
 *
 * Output:
 *   data/artifacts/page-test/5070_after_search.json
 *   data/artifacts/page-test/5070_after_search.png
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { chromium } from "playwright";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, "..", ".env") });

const FACILITY_LINCOLN_ID = "Y77131";
const LINCOLN_BASE = "https://www.tl-lincoln.net/accomodation/";
const SESSION_FILE = resolve(__dirname, "..", "data", "artifacts", "lincoln-session.json");
const OUTPUT_DIR = resolve(__dirname, "..", "data", "artifacts", "page-test");

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log("[5070-capture] Starting...");

  const hasSession = existsSync(SESSION_FILE);
  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const context = await browser.newContext(
    hasSession ? { storageState: SESSION_FILE } : {},
  );
  const page = await context.newPage();

  try {
    // --- Login ---
    const { login, waitFor2FA } = await import("../apps/runner/src/auth/index.js");
    const loginId = process.env.LINCOLN_LOGIN_ID!;
    const loginPw = process.env.LINCOLN_LOGIN_PW!;
    const loginResult = await login(page, loginId, loginPw);
    if (loginResult.needs2FA) {
      console.log("[5070-capture] 2FA required — please enter code in browser...");
      await waitFor2FA(page);
    }
    console.log("[5070-capture] Login OK");

    // --- Facility switch ---
    const { switchFacility } = await import("../apps/runner/src/auth/facility-switch.js");
    await switchFacility(page, "畳の宿", FACILITY_LINCOLN_ID);
    console.log("[5070-capture] Facility switch OK");

    // --- Navigate to 5070 ---
    const url5070 = LINCOLN_BASE + "Ascsc5070InitAction.do";
    console.log(`[5070-capture] Navigating to 5070: ${url5070}`);
    await page.goto(url5070, { waitUntil: "networkidle", timeout: 30000 });
    console.log(`[5070-capture] Page title: ${await page.title()}`);

    // --- Set end date: 2 months later, end of month ---
    const now = new Date();
    const endMonth = new Date(now.getFullYear(), now.getMonth() + 3, 0); // last day of month+2
    const toYear = String(endMonth.getFullYear());
    const toMonth = String(endMonth.getMonth() + 1).padStart(2, "0");
    const toDay = String(endMonth.getDate()).padStart(2, "0");

    console.log(`[5070-capture] Setting end date: ${toYear}-${toMonth}-${toDay}`);
    await page.locator('select[name="objectDateToYear"]').selectOption(toYear);
    await page.locator('select[name="objectDateToMonth"]').selectOption(toMonth);
    await page.locator('select[name="objectDateToDay"]').selectOption(toDay);
    await page.waitForTimeout(500);

    // --- Click search ---
    console.log("[5070-capture] Clicking search...");
    await Promise.all([
      page.waitForLoadState("networkidle", { timeout: 30000 }),
      page.locator('a[onclick="doSearch();"]').click(),
    ]);
    await page.waitForTimeout(2000);
    console.log("[5070-capture] Search complete");

    // --- Screenshot ---
    const screenshotPath = resolve(OUTPUT_DIR, "5070_after_search.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`[5070-capture] Screenshot: ${screenshotPath}`);

    // --- DOM Analysis ---
    console.log("[5070-capture] Analyzing DOM...");
    const domData = await page.evaluate(() => {
      const result: Record<string, unknown> = {};

      // 1. All select elements with their options
      const selects: Record<string, unknown>[] = [];
      document.querySelectorAll("select").forEach((sel) => {
        const options = Array.from(sel.options).map((opt) => ({
          value: opt.value,
          text: opt.text.trim(),
          selected: opt.selected,
        }));
        selects.push({
          name: sel.name || null,
          id: sel.id || null,
          className: sel.className || null,
          optionCount: options.length,
          options: options.slice(0, 50), // limit
          visible: sel.offsetParent !== null,
          parentId: sel.parentElement?.id || null,
          parentClass: sel.parentElement?.className || null,
        });
      });
      result.selects = selects;

      // 2. All buttons/links with onclick
      const actions: Record<string, unknown>[] = [];
      document.querySelectorAll("a[onclick], button[onclick], input[type=button]").forEach((el) => {
        const htmlEl = el as HTMLElement;
        actions.push({
          tag: el.tagName.toLowerCase(),
          text: htmlEl.textContent?.trim()?.substring(0, 100) || "",
          onclick: el.getAttribute("onclick") || "",
          id: el.id || null,
          className: el.className || null,
          title: el.getAttribute("title") || null,
          visible: htmlEl.offsetParent !== null,
          parentId: htmlEl.parentElement?.id || null,
        });
      });
      result.actions = actions;

      // 3. Checkboxes
      const checkboxes: Record<string, unknown>[] = [];
      document.querySelectorAll("input[type=checkbox]").forEach((cb) => {
        const input = cb as HTMLInputElement;
        checkboxes.push({
          name: input.name || null,
          id: input.id || null,
          checked: input.checked,
          value: input.value || null,
          visible: input.offsetParent !== null,
        });
      });
      result.checkboxes = checkboxes;

      // 4. Plan group area — look for dual-list structure
      // sectionTableSelect and sectionTableSelect2
      const planGroupArea: Record<string, unknown> = {};

      const stSelect = document.getElementById("sectionTableSelect") as HTMLSelectElement | null;
      if (stSelect) {
        planGroupArea.sectionTableSelect = {
          name: stSelect.name,
          optionCount: stSelect.options.length,
          options: Array.from(stSelect.options).map((o) => ({
            value: o.value,
            text: o.text.trim(),
            selected: o.selected,
          })),
          multiple: stSelect.multiple,
          size: stSelect.size,
        };
      }

      const stSelect2 = document.getElementById("sectionTableSelect2") as HTMLSelectElement | null;
      if (stSelect2) {
        planGroupArea.sectionTableSelect2 = {
          name: stSelect2.name,
          optionCount: stSelect2.options.length,
          options: Array.from(stSelect2.options).map((o) => ({
            value: o.value,
            text: o.text.trim(),
            selected: o.selected,
          })),
          multiple: stSelect2.multiple,
          size: stSelect2.size,
        };
      }

      // Buttons between the two selects (move left/right)
      const btn3 = document.getElementById("sectionTableBtn3");
      const btn2 = document.getElementById("sectionTableBtn2");
      planGroupArea.sectionTableBtn3 = btn3
        ? { id: btn3.id, className: btn3.className, onclick: btn3.getAttribute("onclick"), text: btn3.textContent?.trim(), title: btn3.getAttribute("title") }
        : null;
      planGroupArea.sectionTableBtn2 = btn2
        ? { id: btn2.id, className: btn2.className, onclick: btn2.getAttribute("onclick"), text: btn2.textContent?.trim(), title: btn2.getAttribute("title") }
        : null;

      // Look for the surrounding container structure
      const settingGroupBox = document.querySelector(".c_setting-group");
      if (settingGroupBox) {
        planGroupArea.settingGroupHTML = settingGroupBox.innerHTML.substring(0, 5000);
      }

      // arrNetRoomTypePlanGroup dropdown (room type / plan group filter)
      const roomTypeSel = document.querySelector('select[name="arrNetRoomTypePlanGroup"]') as HTMLSelectElement | null;
      if (roomTypeSel) {
        planGroupArea.arrNetRoomTypePlanGroup = {
          optionCount: roomTypeSel.options.length,
          options: Array.from(roomTypeSel.options).map((o) => ({
            value: o.value,
            text: o.text.trim(),
            selected: o.selected,
          })),
        };
      }

      result.planGroupArea = planGroupArea;

      // 5. Plan group set items (selectPlanGroupSet links)
      const pgSetItems: { text: string; onclick: string }[] = [];
      document.querySelectorAll('a[onclick*="selectPlanGroupSet"]').forEach((a) => {
        pgSetItems.push({
          text: (a.textContent || "").trim(),
          onclick: a.getAttribute("onclick") || "",
        });
      });
      result.planGroupSetItems = pgSetItems;

      // 6. Hidden inputs related to plan groups
      const hiddenInputs: Record<string, unknown>[] = [];
      document.querySelectorAll('input[type=hidden]').forEach((inp) => {
        const input = inp as HTMLInputElement;
        if (input.name && (
          input.name.includes("planGr") || input.name.includes("PlanGr") ||
          input.name.includes("planGrp") || input.name.includes("PlanGrp") ||
          input.name.includes("section") || input.name.includes("rank") ||
          input.name.includes("output")
        )) {
          hiddenInputs.push({
            name: input.name,
            id: input.id || null,
            value: input.value || null,
          });
        }
      });
      result.planGroupHiddenInputs = hiddenInputs;

      // 7. Free word search
      const freeWord = document.getElementById("freeWord") as HTMLInputElement | null;
      if (freeWord) {
        result.freeWordInput = {
          id: freeWord.id,
          name: freeWord.name,
          value: freeWord.value,
          placeholder: freeWord.placeholder,
        };
      }

      return result;
    });

    // --- Save JSON ---
    const jsonPath = resolve(OUTPUT_DIR, "5070_after_search.json");
    writeFileSync(jsonPath, JSON.stringify(domData, null, 2), "utf-8");
    console.log(`[5070-capture] DOM data: ${jsonPath}`);

    // --- Log summary ---
    const pgArea = domData.planGroupArea as Record<string, unknown>;
    const s1 = pgArea?.sectionTableSelect as Record<string, unknown>;
    const s2 = pgArea?.sectionTableSelect2 as Record<string, unknown>;
    console.log(`\n[5070-capture] === Plan Group Area Summary ===`);
    console.log(`  sectionTableSelect (arrPlanGroup): ${s1?.optionCount || 0} options`);
    console.log(`  sectionTableSelect2 (raPlanGroup): ${s2?.optionCount || 0} options`);
    console.log(`  planGroupSetItems: ${(domData.planGroupSetItems as unknown[])?.length || 0} items`);

    if (s1 && (s1.optionCount as number) > 0) {
      const opts = s1.options as { value: string; text: string }[];
      console.log(`\n  sectionTableSelect options (first 20):`);
      opts.slice(0, 20).forEach((o, i) => console.log(`    ${i + 1}. [${o.value}] ${o.text}`));
    }
    if (s2 && (s2.optionCount as number) > 0) {
      const opts = s2.options as { value: string; text: string }[];
      console.log(`\n  sectionTableSelect2 options (first 20):`);
      opts.slice(0, 20).forEach((o, i) => console.log(`    ${i + 1}. [${o.value}] ${o.text}`));
    }

    // Save session
    await context.storageState({ path: SESSION_FILE });
    console.log(`[5070-capture] Session saved: ${SESSION_FILE}`);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[5070-capture] Error: ${msg}`);
    try {
      await page.screenshot({ path: resolve(OUTPUT_DIR, "5070_error.png"), fullPage: true });
    } catch {}
  } finally {
    await browser.close();
  }

  console.log("[5070-capture] Done!");
}

main().catch((err) => {
  console.error("[5070-capture] Unexpected:", err);
  process.exit(2);
});
