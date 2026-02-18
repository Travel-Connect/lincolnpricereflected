/**
 * Lincoln セレクタ探索スクリプト
 *
 * headful で Lincoln にアクセスし、各画面の DOM を調査する。
 * スクショ + HTML + フォーム要素一覧を artifacts に保存。
 *
 * Usage:
 *   cd apps/runner
 *   npx tsx ../../scripts/explore-selectors.ts
 *
 * 動作:
 *   1. ログインページを開く → DOM 解析 → スクショ
 *   2. ユーザーが手動でログイン + 2FA を完了するのを待つ
 *   3. ログイン後の画面を解析 → スクショ
 *   4. ユーザーがカレンダー画面に移動するのを待つ
 *   5. カレンダー画面を解析 → スクショ
 */

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as readline from "node:readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(PROJECT_ROOT, "data", "artifacts", "selector-exploration");
mkdirSync(OUT_DIR, { recursive: true });

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function analyzePageForms(page: import("playwright").Page, label: string) {
  console.log(`\n=== ${label} ===`);
  console.log(`URL: ${page.url()}`);

  // Save screenshot
  const ssPath = resolve(OUT_DIR, `${label}.png`);
  await page.screenshot({ path: ssPath, fullPage: true });
  console.log(`Screenshot: ${ssPath}`);

  // Save HTML
  const htmlPath = resolve(OUT_DIR, `${label}.html`);
  const html = await page.content();
  writeFileSync(htmlPath, html, "utf-8");
  console.log(`HTML: ${htmlPath}`);

  // Extract all form elements
  const formInfo = await page.evaluate(() => {
    const results: Record<string, unknown>[] = [];

    // Inputs
    document.querySelectorAll("input").forEach((el) => {
      results.push({
        tag: "input",
        type: el.type,
        name: el.name || null,
        id: el.id || null,
        placeholder: el.placeholder || null,
        className: el.className || null,
        value: el.type === "hidden" ? el.value : null,
      });
    });

    // Selects
    document.querySelectorAll("select").forEach((el) => {
      results.push({
        tag: "select",
        name: el.name || null,
        id: el.id || null,
        className: el.className || null,
        optionCount: el.options.length,
      });
    });

    // Buttons and submit links
    document.querySelectorAll("button, input[type='submit'], a[onclick]").forEach((el) => {
      results.push({
        tag: el.tagName.toLowerCase(),
        type: (el as HTMLInputElement).type || null,
        id: el.id || null,
        className: el.className || null,
        text: el.textContent?.trim().slice(0, 50) || null,
        onclick: el.getAttribute("onclick")?.slice(0, 80) || null,
        href: (el as HTMLAnchorElement).href || null,
      });
    });

    // Forms
    document.querySelectorAll("form").forEach((el) => {
      results.push({
        tag: "form",
        action: el.action || null,
        method: el.method || null,
        id: el.id || null,
        name: el.name || null,
      });
    });

    return results;
  });

  // Save form info
  const infoPath = resolve(OUT_DIR, `${label}_elements.json`);
  writeFileSync(infoPath, JSON.stringify(formInfo, null, 2), "utf-8");
  console.log(`Elements: ${infoPath} (${formInfo.length} elements)`);

  // Print summary
  const inputs = formInfo.filter((e) => e.tag === "input");
  const buttons = formInfo.filter(
    (e) => e.tag === "button" || e.tag === "a" || (e.tag === "input" && e.type === "submit"),
  );
  console.log(`  Inputs: ${inputs.length}, Buttons/Links: ${buttons.length}`);

  for (const el of inputs) {
    if (el.type !== "hidden") {
      console.log(
        `  [input] type=${el.type} name=${el.name} id=${el.id} placeholder=${el.placeholder}`,
      );
    }
  }
  for (const el of buttons) {
    console.log(
      `  [${el.tag}] text="${el.text}" id=${el.id} onclick=${el.onclick}`,
    );
  }
}

async function analyzeCalendar(page: import("playwright").Page) {
  console.log("\n=== Calendar DOM Analysis ===");

  const calInfo = await page.evaluate(() => {
    const info: Record<string, unknown> = {};

    // Calendar tables
    const tables = document.querySelectorAll("table.calendarTable");
    info.calendarTableCount = tables.length;

    if (tables.length > 0) {
      const firstTable = tables[0];
      const cells = firstTable.querySelectorAll("td");
      info.firstTableCellCount = cells.length;

      // Sample first non-empty cell
      for (const cell of cells) {
        const day = cell.querySelector(".calendar_table_day");
        const rank = cell.querySelector(".calendarTableRank");
        const title = cell.querySelector(".calendarTableTitle");
        const anchor = cell.querySelector("a.calendarTableBtn");
        const hiddenInputs = cell.querySelectorAll("input[type='hidden']");

        if (day && rank) {
          info.sampleCell = {
            day: day.textContent?.trim(),
            rank: rank.textContent?.trim(),
            title: title?.textContent?.trim(),
            anchorClass: anchor?.className,
            anchorStyle: anchor?.getAttribute("style")?.slice(0, 100),
            hiddenInputs: Array.from(hiddenInputs).map((inp) => ({
              name: (inp as HTMLInputElement).name,
              value: (inp as HTMLInputElement).value,
            })),
          };
          break;
        }
      }
    }

    // Save button candidates
    const saveButtons = document.querySelectorAll(
      "a[onclick*='save'], a[onclick*='Save'], a[onclick*='submit'], a[onclick*='Submit'], " +
      "a[onclick*='doSave'], a[onclick*='doSubmit'], a[onclick*='doEntry'], " +
      "input[type='submit'], button[type='submit']"
    );
    info.saveButtonCandidates = Array.from(saveButtons).map((el) => ({
      tag: el.tagName.toLowerCase(),
      text: el.textContent?.trim().slice(0, 50),
      onclick: el.getAttribute("onclick")?.slice(0, 100),
      id: el.id || null,
      className: el.className || null,
    }));

    // All onclick links (for navigation discovery)
    const allOnclickLinks = document.querySelectorAll("a[onclick]");
    info.onclickLinks = Array.from(allOnclickLinks).map((el) => ({
      text: el.textContent?.trim().slice(0, 40),
      onclick: el.getAttribute("onclick")?.slice(0, 100),
    }));

    return info;
  });

  const calPath = resolve(OUT_DIR, "calendar_dom.json");
  writeFileSync(calPath, JSON.stringify(calInfo, null, 2), "utf-8");
  console.log(`Calendar DOM: ${calPath}`);
  console.log(`  Tables: ${calInfo.calendarTableCount}`);
  console.log(`  Save candidates: ${(calInfo.saveButtonCandidates as unknown[]).length}`);
  if (calInfo.sampleCell) {
    console.log(`  Sample cell:`, JSON.stringify(calInfo.sampleCell, null, 2));
  }
}

async function main() {
  console.log("Lincoln Selector Explorer");
  console.log("========================");
  console.log(`Output: ${OUT_DIR}\n`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  // Step 1: Login page
  const loginUrl = "https://www.tl-lincoln.net/accomodation/Ascsc1000InitAction.do";
  console.log(`Opening: ${loginUrl}`);
  await page.goto(loginUrl, { waitUntil: "networkidle" });
  await analyzePageForms(page, "01_login_page");

  // Step 2: Wait for user to login + 2FA
  await ask(
    "\n>> ブラウザでログイン + 2FA を完了してください。完了したら Enter を押してください: ",
  );
  await page.waitForTimeout(2000);
  await analyzePageForms(page, "02_after_login");

  // Analyze specifically for facility switch and navigation elements
  const postLoginInfo = await page.evaluate(() => {
    const info: Record<string, unknown> = {};

    // Look for facility switch / header elements
    const headerLinks = document.querySelectorAll("header a, .g_header a, #header a, nav a");
    info.headerLinks = Array.from(headerLinks).map((el) => ({
      text: el.textContent?.trim().slice(0, 50),
      href: (el as HTMLAnchorElement).href || null,
      onclick: el.getAttribute("onclick")?.slice(0, 100) || null,
      id: el.id || null,
      className: el.className || null,
    }));

    // Look for facility name display
    const facilityElements = document.querySelectorAll(
      "dl.g_header_id, .facility-name, [class*='facility'], [class*='hotel'], [id*='facility']"
    );
    info.facilityElements = Array.from(facilityElements).map((el) => ({
      tag: el.tagName.toLowerCase(),
      text: el.textContent?.trim().slice(0, 100),
      id: el.id || null,
      className: el.className || null,
    }));

    // Look for any dialog / modal / popup triggers
    const dialogTriggers = document.querySelectorAll(
      "[onclick*='switch'], [onclick*='Switch'], [onclick*='change'], [onclick*='select'], " +
      "[onclick*='modal'], [onclick*='dialog'], [onclick*='popup'], [onclick*='open']"
    );
    info.dialogTriggers = Array.from(dialogTriggers).map((el) => ({
      tag: el.tagName.toLowerCase(),
      text: el.textContent?.trim().slice(0, 50),
      onclick: el.getAttribute("onclick")?.slice(0, 100),
      id: el.id || null,
      className: el.className || null,
    }));

    // Navigation / menu items
    const menuItems = document.querySelectorAll("nav li a, .menu a, .sidebar a, .g_navi a");
    info.menuItems = Array.from(menuItems).map((el) => ({
      text: el.textContent?.trim().slice(0, 50),
      href: (el as HTMLAnchorElement).href || null,
      onclick: el.getAttribute("onclick")?.slice(0, 100) || null,
    }));

    return info;
  });
  const postLoginPath = resolve(OUT_DIR, "02_after_login_detail.json");
  writeFileSync(postLoginPath, JSON.stringify(postLoginInfo, null, 2), "utf-8");
  console.log(`Post-login detail: ${postLoginPath}`);
  console.log(`  Header links: ${(postLoginInfo.headerLinks as unknown[]).length}`);
  console.log(`  Facility elements: ${(postLoginInfo.facilityElements as unknown[]).length}`);
  console.log(`  Dialog triggers: ${(postLoginInfo.dialogTriggers as unknown[]).length}`);
  console.log(`  Menu items: ${(postLoginInfo.menuItems as unknown[]).length}`);

  // Step 3: Wait for user to navigate to calendar
  await ask(
    "\n>> カレンダー画面（処理0の対象画面）に移動してください。移動したら Enter を押してください: ",
  );
  await page.waitForTimeout(1000);
  await analyzePageForms(page, "03_calendar_page");
  await analyzeCalendar(page);

  // Step 4: Optional — explore more screens
  let continueExploring = true;
  let screenNum = 4;
  while (continueExploring) {
    const answer = await ask(
      `\n>> 他の画面も調査しますか？ 移動して Enter、終了は "q" + Enter: `,
    );
    if (answer.toLowerCase() === "q") {
      continueExploring = false;
      break;
    }
    await page.waitForTimeout(500);
    const label = `${String(screenNum).padStart(2, "0")}_${page.url().split("/").pop()?.split("?")[0] || "page"}`;
    await analyzePageForms(page, label);

    // Check if it looks like a calendar page
    const hasCalendar = await page.evaluate(() =>
      document.querySelectorAll("table.calendarTable").length > 0,
    );
    if (hasCalendar) {
      await analyzeCalendar(page);
    }
    screenNum++;
  }

  console.log("\n=== Exploration complete ===");
  console.log(`All results saved to: ${OUT_DIR}`);
  await browser.close();
}

main().catch(console.error);
