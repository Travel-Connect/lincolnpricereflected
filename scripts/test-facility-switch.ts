/**
 * 施設切り替え → 6800ページ → テストカレンダー探索スクリプト (v2)
 *
 * 目的:
 * - 「畳の宿　那覇壺屋」へ施設切り替え
 * - 6800 ページでテストカレンダーを開く
 * - カレンダー詳細ページの要素を全キャプチャ（step0/stepA セレクタ確認）
 *
 * Usage:
 *   cd apps/runner
 *   npx tsx ../../scripts/test-facility-switch.ts
 */

import { config } from "dotenv";
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..");

config({ path: resolve(PROJECT_ROOT, ".env") });

const OUT_DIR = resolve(PROJECT_ROOT, "data", "artifacts", "facility-test");
mkdirSync(OUT_DIR, { recursive: true });

const TARGET_FACILITY = "畳の宿 那覇壺屋";
const TARGET_FACILITY_ID = "Y77131";

/** Capture full page state */
async function capturePage(
  page: import("playwright").Page,
  label: string,
) {
  await page.screenshot({
    path: resolve(OUT_DIR, `${label}.png`),
    fullPage: true,
  });

  writeFileSync(
    resolve(OUT_DIR, `${label}.html`),
    await page.content(),
    "utf-8",
  );

  const elements = await page.evaluate(() => {
    const results: Record<string, unknown>[] = [];

    document.querySelectorAll("input").forEach((el) => {
      results.push({
        tag: "input", type: el.type, name: el.name || null,
        id: el.id || null, placeholder: el.placeholder || null,
        className: el.className || null,
        value: el.value?.slice(0, 200) || null,
        hidden: el.type === "hidden" || el.style.display === "none",
      });
    });

    document.querySelectorAll("select").forEach((el) => {
      const opts = Array.from(el.options).map((o) => ({
        value: o.value, text: o.text?.slice(0, 60), selected: o.selected,
      }));
      results.push({
        tag: "select", name: el.name || null, id: el.id || null,
        className: el.className || null, optionCount: el.options.length,
        options: opts.slice(0, 30),
      });
    });

    document.querySelectorAll("a[onclick], a[href*='Action'], button, input[type='submit']").forEach((el) => {
      results.push({
        tag: el.tagName.toLowerCase(),
        text: el.textContent?.trim().slice(0, 80),
        id: el.id || null, className: el.className || null,
        onclick: el.getAttribute("onclick")?.slice(0, 150) || null,
        href: (el as HTMLAnchorElement).href || null,
      });
    });

    document.querySelectorAll("table").forEach((el) => {
      results.push({
        tag: "table", id: el.id || null, className: el.className || null,
        rows: el.rows.length,
      });
    });

    document.querySelectorAll("dl").forEach((el) => {
      results.push({
        tag: "dl", id: el.id || null, className: el.className || null,
        text: el.textContent?.trim().slice(0, 120),
      });
    });

    document.querySelectorAll("[class*='ui-'], [role='dialog'], [role='listbox']").forEach((el) => {
      results.push({
        tag: el.tagName.toLowerCase(), role: el.getAttribute("role"),
        id: el.id || null, className: el.className || null,
        text: el.textContent?.trim().slice(0, 120),
        childCount: el.children.length,
      });
    });

    return results;
  });

  const elemPath = resolve(OUT_DIR, `${label}_elements.json`);
  writeFileSync(elemPath, JSON.stringify(elements, null, 2), "utf-8");
  console.log(`  📸 ${label}: ${elements.length} elements`);
  return elements;
}

/** Login with 2FA + force-login handling */
async function doLogin(page: import("playwright").Page) {
  const loginId = process.env.LINCOLN_LOGIN_ID!;
  const loginPw = process.env.LINCOLN_LOGIN_PW!;

  console.log("[LOGIN] ログインページへ...");
  await page.goto(
    "https://www.tl-lincoln.net/accomodation/Ascsc1000InitAction.do",
    { waitUntil: "networkidle" },
  );

  await page.locator("#txt_usrId").fill(loginId);
  await page.locator("input[type='password'][name='pwd']").fill(loginPw);
  await page.locator("#doLogin").click();
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  // Force login
  const forceLoginBtn = page.locator("#doForceLogout");
  if (await forceLoginBtn.isVisible().catch(() => false)) {
    console.log("[LOGIN] 二重ログイン → 強制ログイン");
    await forceLoginBtn.click();
    await page.waitForLoadState("load", { timeout: 15000 }).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }

  // 2FA
  const title = await page.title();
  if (title.includes("2段階認証") || title.includes("認証コード")) {
    console.log("[LOGIN] ⏳ 2FA 検出 — ブラウザで認証コードを入力してください...");
    const twoFactorUrl = page.url();
    const start = Date.now();
    const timeout = 5 * 60 * 1000;

    while (Date.now() - start < timeout) {
      await page.waitForTimeout(2000);
      if (page.url() !== twoFactorUrl) {
        console.log("[LOGIN] ✓ 2FA 完了");
        break;
      }
      const elapsed = Math.round((Date.now() - start) / 1000);
      if (elapsed % 15 === 0 && elapsed > 0) console.log(`[LOGIN] ⏳ ${elapsed}s...`);
    }
    if (page.url() === twoFactorUrl) throw new Error("2FA タイムアウト");
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  }

  console.log(`[LOGIN] ✓ ログイン完了 — ${await page.title()}`);
}

async function main() {
  if (!process.env.LINCOLN_LOGIN_ID || !process.env.LINCOLN_LOGIN_PW) {
    console.error("ERROR: .env に LINCOLN_LOGIN_ID / LINCOLN_LOGIN_PW を設定してください");
    process.exit(1);
  }

  console.log("=== 施設切り替え & 6800ページ探索 v2 ===");
  console.log(`Target: ${TARGET_FACILITY}`);
  console.log(`Output: ${OUT_DIR}\n`);

  const sessionPath = resolve(PROJECT_ROOT, "data", "artifacts", "lincoln-session.json");
  const hasSession = existsSync(sessionPath);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    ...(hasSession ? { storageState: sessionPath } : {}),
  });
  const page = await context.newPage();

  try {
    // --- Login / Session restore ---
    if (hasSession) {
      console.log("[SESSION] セッション復元を試行...");
      await page.goto(
        "https://www.tl-lincoln.net/accomodation/Ascsc1010InitAction.do",
        { waitUntil: "networkidle", timeout: 15000 },
      ).catch(() => {});

      const title = await page.title();
      if (title.includes("トップページ") || title.includes("メニュー")) {
        console.log("[SESSION] ✓ セッション復元成功");
      } else {
        console.log("[SESSION] セッション期限切れ → フレッシュログイン");
        await doLogin(page);
      }
    } else {
      await doLogin(page);
    }

    // Save session
    const storageState = await context.storageState();
    mkdirSync(dirname(sessionPath), { recursive: true });
    writeFileSync(sessionPath, JSON.stringify(storageState, null, 2), "utf-8");

    // ==========================================================
    // PHASE 1: 施設切り替え → 「畳の宿　那覇壺屋」
    // ==========================================================
    console.log("\n=== PHASE 1: 施設切り替え ===");
    const currentFacility = await page.evaluate(() => {
      const dlId = document.querySelector("dl.g_header_id dd");
      return dlId?.textContent?.trim() || "unknown";
    });
    console.log(`  現在の施設ID: ${currentFacility}`);

    // Open facility switch
    console.log(`  「${TARGET_FACILITY}」に切り替え...`);
    await page.locator("a.cFormTextBtn3Switch").click();
    await page.waitForTimeout(1000);

    // Type full facility name
    const searchInput = page.locator("input.cFormTextInputSwitch");
    await searchInput.clear();
    await searchInput.fill(TARGET_FACILITY);
    await page.waitForTimeout(2000); // Wait for autocomplete

    // Capture autocomplete state
    await capturePage(page, "01_autocomplete");

    const autocompleteItems = await page.evaluate(() => {
      const items = document.querySelectorAll("ul.ui-autocomplete li, ul.ui-menu li");
      return Array.from(items).map((li) => ({
        text: li.textContent?.trim().slice(0, 80),
        className: li.className,
        visible: (li as HTMLElement).style.display !== "none",
        aText: li.querySelector("a")?.textContent?.trim() || null,
      }));
    });
    console.log(`  Autocomplete 候補: ${autocompleteItems.length}件`);
    autocompleteItems.forEach((item, i) => {
      console.log(`    [${i}] "${item.text}" visible=${item.visible}`);
    });

    // Select matching item — wait for page reload after selection
    const targetItem = page.locator("ul.ui-autocomplete li a, ul.ui-menu li a")
      .filter({ hasText: /畳の宿/ });
    const matchCount = await targetItem.count();

    if (matchCount > 0) {
      const itemText = await targetItem.first().textContent();
      console.log(`  ✓ 候補発見 (${matchCount}件): "${itemText?.trim()}"`);

      // Click and wait for page reload (autocomplete select triggers form submit)
      console.log("  候補をクリック → ページリロードを待機...");
      await Promise.all([
        page.waitForLoadState("load", { timeout: 15000 }).catch(() => {}),
        targetItem.first().click(),
      ]);
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(3000);
    } else {
      // Fall back to first visible item
      const firstItem = page.locator("ul.ui-autocomplete li a, ul.ui-menu li a").first();
      if (await firstItem.isVisible().catch(() => false)) {
        const text = await firstItem.textContent();
        console.log(`  最初の候補を選択: "${text?.trim()}"`);
        await Promise.all([
          page.waitForLoadState("load", { timeout: 15000 }).catch(() => {}),
          firstItem.click(),
        ]);
        await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(3000);
      } else {
        console.log("  ⚠ 候補が見つかりません");
      }
    }

    // Check facility after reload
    console.log(`  URL: ${page.url()}`);
    console.log(`  Title: ${await page.title()}`);
    const afterSwitch = await page.evaluate(() => {
      return {
        hiddenFacilityId: (document.querySelector("#changeLincolnInnId") as HTMLInputElement)?.value || "not found",
        searchValue: (document.querySelector("input.cFormTextInputSwitch") as HTMLInputElement)?.value || "not found",
        headerFacilityId: document.querySelector("dl.g_header_id dd")?.textContent?.trim() || "not found",
      };
    });
    console.log(`  Hidden facility ID: ${afterSwitch.hiddenFacilityId}`);
    console.log(`  Search input value: ${afterSwitch.searchValue}`);
    console.log(`  Header facility ID: ${afterSwitch.headerFacilityId}`);
    await capturePage(page, "02_after_switch");

    // Verify the switch succeeded
    if (afterSwitch.headerFacilityId === TARGET_FACILITY_ID) {
      console.log(`  ✓ 施設切り替え成功！(${TARGET_FACILITY_ID})`);
    } else {
      // Check for double-login error message (MASC1042)
      const errorMsg = await page.evaluate(() => {
        const msg = document.querySelector(".c_message, .c_txt-worning, [class*='message']");
        return msg?.textContent?.trim()?.slice(0, 200) || "";
      });
      console.log(`  ⚠ 施設切り替え未完了 (expected ${TARGET_FACILITY_ID}, got ${afterSwitch.headerFacilityId})`);
      if (errorMsg) {
        console.log(`  エラー: ${errorMsg.slice(0, 150)}`);
      }

      // Retry: "再度施設を選択して強制切り替え"
      console.log("  → 強制切り替えを試行（2回目の選択）...");

      const switchBtn2 = page.locator("a.cFormTextBtn3Switch");
      if (await switchBtn2.isVisible().catch(() => false)) {
        await switchBtn2.click();
        await page.waitForTimeout(1000);
      }

      const searchInput2 = page.locator("input.cFormTextInputSwitch");
      await searchInput2.clear();
      await searchInput2.fill(TARGET_FACILITY);
      await page.waitForTimeout(2000);

      const targetItem2 = page.locator("ul.ui-autocomplete li a, ul.ui-menu li a")
        .filter({ hasText: /畳の宿/ });
      if (await targetItem2.count() > 0) {
        const text2 = await targetItem2.first().textContent();
        console.log(`  候補: "${text2?.trim()}" → クリック（強制切り替え）`);
        await Promise.all([
          page.waitForLoadState("load", { timeout: 15000 }).catch(() => {}),
          targetItem2.first().click(),
        ]);
        await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(3000);

        const retry = await page.evaluate(() => {
          return {
            facilityId: document.querySelector("dl.g_header_id dd")?.textContent?.trim() || "unknown",
            errorMsg: document.querySelector(".c_message, .c_txt-worning")?.textContent?.trim()?.slice(0, 200) || "",
          };
        });
        console.log(`  再試行後: 施設ID = ${retry.facilityId}`);
        if (retry.errorMsg) console.log(`  メッセージ: ${retry.errorMsg.slice(0, 150)}`);
        await capturePage(page, "02b_after_force_switch");

        if (retry.facilityId === TARGET_FACILITY_ID) {
          console.log(`  ✓ 強制切り替え成功！(${TARGET_FACILITY_ID})`);
        } else {
          console.log("  ⚠ 強制切り替えも失敗。3回目を試行...");

          // 3rd attempt
          const switchBtn3 = page.locator("a.cFormTextBtn3Switch");
          if (await switchBtn3.isVisible().catch(() => false)) {
            await switchBtn3.click();
            await page.waitForTimeout(1000);
          }
          const searchInput3 = page.locator("input.cFormTextInputSwitch");
          await searchInput3.clear();
          await searchInput3.fill(TARGET_FACILITY);
          await page.waitForTimeout(2000);

          const targetItem3 = page.locator("ul.ui-autocomplete li a, ul.ui-menu li a")
            .filter({ hasText: /畳の宿/ });
          if (await targetItem3.count() > 0) {
            await Promise.all([
              page.waitForLoadState("load", { timeout: 15000 }).catch(() => {}),
              targetItem3.first().click(),
            ]);
            await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
            await page.waitForTimeout(3000);

            const retry3 = await page.evaluate(() => {
              return document.querySelector("dl.g_header_id dd")?.textContent?.trim() || "unknown";
            });
            console.log(`  3回目後: 施設ID = ${retry3}`);
            await capturePage(page, "02c_after_3rd_switch");
          }
        }
      }
    }

    // ==========================================================
    // PHASE 2: 6800ページ → カレンダー一覧
    // ==========================================================
    console.log("\n=== PHASE 2: 6800ページ（カレンダー一覧） ===");
    await page.goto(
      "https://www.tl-lincoln.net/accomodation/Ascsc6800InitAction.do",
      { waitUntil: "networkidle", timeout: 15000 },
    );
    console.log(`  URL: ${page.url()}`);
    console.log(`  Title: ${await page.title()}`);

    const facilityId6800 = await page.evaluate(() => {
      return document.querySelector("dl.g_header_id dd")?.textContent?.trim() || "not found";
    });
    console.log(`  施設ID: ${facilityId6800}`);
    await capturePage(page, "04_6800_list");

    // List all calendars
    const calendarList = await page.evaluate(() => {
      const links = document.querySelectorAll("a[onclick*='doDetail']");
      return Array.from(links).map((a) => ({
        text: a.textContent?.trim(),
        onclick: a.getAttribute("onclick"),
      }));
    });
    console.log(`  カレンダー一覧 (${calendarList.length}件):`);
    calendarList.forEach((cal) => {
      console.log(`    - "${cal.text}" → ${cal.onclick}`);
    });

    // Find テストカレンダー
    const testCalBtn = page.locator("a[onclick*='doDetail']").filter({ hasText: "テストカレンダー" });
    if (await testCalBtn.count() > 0) {
      const onclick = await testCalBtn.first().getAttribute("onclick");
      console.log(`\n  ✓ テストカレンダー発見！ onclick=${onclick}`);
      console.log("  テストカレンダーを開きます...");
      await testCalBtn.first().click();
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1000);
    } else {
      console.log("\n  ⚠ テストカレンダーが見つかりません。最初のカレンダーを開きます...");
      const firstCal = page.locator("a[onclick*='doDetail']").first();
      if (await firstCal.count() > 0) {
        await firstCal.click();
        await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(1000);
      }
    }

    // ==========================================================
    // PHASE 3: カレンダー詳細ページ
    // ==========================================================
    console.log("\n=== PHASE 3: カレンダー詳細ページ ===");
    console.log(`  URL: ${page.url()}`);
    console.log(`  Title: ${await page.title()}`);
    await capturePage(page, "05_calendar_detail");

    // Detailed calendar element analysis
    const calDetail = await page.evaluate(() => {
      const info: Record<string, unknown> = {};

      // Calendar tables
      info.calendarTables = Array.from(document.querySelectorAll("table")).map((t) => ({
        id: t.id || null,
        className: t.className || null,
        rows: t.rows.length,
        cells: t.querySelectorAll("td").length,
      })).filter((t) => t.rows > 2);

      // Rank cells (.calendarTableRank)
      info.rankCells = Array.from(document.querySelectorAll(".calendarTableRank")).map((el) => ({
        text: el.textContent?.trim(),
      })).slice(0, 20);

      // Day cells (.calendar_table_day)
      info.dayCells = Array.from(document.querySelectorAll(".calendar_table_day")).map((el) => ({
        text: el.textContent?.trim(),
      })).slice(0, 20);

      // Rank anchors (a.calendarTableBtn)
      info.rankAnchors = Array.from(document.querySelectorAll("a.calendarTableBtn")).map((el) => ({
        className: el.className,
        onclick: el.getAttribute("onclick")?.slice(0, 150),
        style: (el as HTMLElement).style.cssText?.slice(0, 100),
      })).slice(0, 10);

      // Room type titles (.calendarTableTitle)
      info.roomTypeTitles = Array.from(document.querySelectorAll(".calendarTableTitle")).map((el) => ({
        text: el.textContent?.trim().slice(0, 80),
      })).slice(0, 20);

      // Hidden rank inputs
      info.rankInputs_PriceRankCd = Array.from(document.querySelectorAll("input[name='inputPriceRankCd']")).map((el) => ({
        value: (el as HTMLInputElement).value,
      })).slice(0, 10);

      info.rankInputs_Default = Array.from(document.querySelectorAll("input[name='defaultInputPriceRankCd']")).map((el) => ({
        value: (el as HTMLInputElement).value,
      })).slice(0, 10);

      info.rankInputs_Nm = Array.from(document.querySelectorAll("input[name='inputPriceRankNm']")).map((el) => ({
        value: (el as HTMLInputElement).value,
      })).slice(0, 10);

      info.rankInputs_Style = Array.from(document.querySelectorAll("input[name='inputRankStyleText']")).map((el) => ({
        value: (el as HTMLInputElement).value?.slice(0, 80),
      })).slice(0, 10);

      // Save button candidates
      info.allActions = Array.from(document.querySelectorAll("a[onclick], button[onclick], input[type='submit'], input[type='button']")).map((el) => ({
        tag: el.tagName.toLowerCase(),
        text: el.textContent?.trim().slice(0, 80),
        onclick: el.getAttribute("onclick")?.slice(0, 150),
        id: el.id || null,
        className: el.className || null,
      }));

      // Calendar name / select
      info.calendarSelects = Array.from(document.querySelectorAll("select")).map((el) => ({
        name: el.name || null,
        id: el.id || null,
        optionCount: el.options.length,
        options: Array.from(el.options).slice(0, 20).map((o) => ({
          value: o.value, text: o.text?.slice(0, 60), selected: o.selected,
        })),
      }));

      // Calendar name text inputs
      info.textInputs = Array.from(document.querySelectorAll("input[type='text'], input:not([type])")).map((el) => ({
        name: (el as HTMLInputElement).name || null,
        id: el.id || null,
        value: (el as HTMLInputElement).value?.slice(0, 100) || null,
        className: el.className || null,
        placeholder: (el as HTMLInputElement).placeholder || null,
      }));

      // Month navigation
      info.monthNav = Array.from(document.querySelectorAll("a[onclick*='Month'], a[onclick*='month'], a[onclick*='doNext'], a[onclick*='doPrev']")).map((el) => ({
        text: el.textContent?.trim(),
        onclick: el.getAttribute("onclick")?.slice(0, 100),
      }));

      // All forms
      info.forms = Array.from(document.querySelectorAll("form")).map((f) => ({
        action: f.action || null,
        method: f.method || null,
        id: f.id || null,
        name: f.name || null,
        hiddenInputs: Array.from(f.querySelectorAll("input[type='hidden']")).map((h) => ({
          name: (h as HTMLInputElement).name,
          value: (h as HTMLInputElement).value?.slice(0, 80),
        })),
      }));

      return info;
    });

    writeFileSync(
      resolve(OUT_DIR, "05_calendar_detail_analysis.json"),
      JSON.stringify(calDetail, null, 2),
      "utf-8",
    );

    console.log(`  Calendar tables (rows>2): ${(calDetail.calendarTables as unknown[]).length}`);
    console.log(`  Rank cells: ${(calDetail.rankCells as unknown[]).length}`);
    console.log(`  Day cells: ${(calDetail.dayCells as unknown[]).length}`);
    console.log(`  Rank anchors: ${(calDetail.rankAnchors as unknown[]).length}`);
    console.log(`  Room type titles: ${(calDetail.roomTypeTitles as unknown[]).length}`);
    console.log(`  PriceRankCd inputs: ${(calDetail.rankInputs_PriceRankCd as unknown[]).length}`);
    console.log(`  Default rank inputs: ${(calDetail.rankInputs_Default as unknown[]).length}`);
    console.log(`  RankNm inputs: ${(calDetail.rankInputs_Nm as unknown[]).length}`);
    console.log(`  RankStyle inputs: ${(calDetail.rankInputs_Style as unknown[]).length}`);
    console.log(`  All actions: ${(calDetail.allActions as unknown[]).length}`);
    console.log(`  Selects: ${(calDetail.calendarSelects as unknown[]).length}`);
    console.log(`  Text inputs: ${(calDetail.textInputs as unknown[]).length}`);
    console.log(`  Month nav: ${(calDetail.monthNav as unknown[]).length}`);
    console.log(`  Forms: ${(calDetail.forms as unknown[]).length}`);

    // Print all action buttons for manual review
    console.log("\n  === アクションボタン一覧 ===");
    (calDetail.allActions as Array<Record<string, string>>).forEach((a) => {
      console.log(`    [${a.tag}] "${a.text}" onclick=${a.onclick} id=${a.id} class=${a.className}`);
    });

    console.log("\n  === セレクトボックス一覧 ===");
    (calDetail.calendarSelects as Array<Record<string, unknown>>).forEach((s) => {
      console.log(`    name=${s.name} id=${s.id} options=${s.optionCount}`);
      (s.options as Array<Record<string, string>>)?.slice(0, 5).forEach((o) => {
        console.log(`      ${o.selected ? "→" : " "} [${o.value}] ${o.text}`);
      });
    });

    console.log("\n  === テキスト入力一覧 ===");
    (calDetail.textInputs as Array<Record<string, string>>).forEach((t) => {
      console.log(`    name=${t.name} id=${t.id} value="${t.value}" class=${t.className}`);
    });

    console.log("\n  === Room types ===");
    (calDetail.roomTypeTitles as Array<Record<string, string>>).forEach((r) => {
      console.log(`    ${r.text}`);
    });

    // ==========================================================
    // PHASE 4: ブラウザ維持（手動確認用）
    // ==========================================================
    console.log("\n=== PHASE 4: 60秒間ブラウザ維持 ===");
    console.log("  ブラウザで自由に操作できます。");

    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(5000);
      console.log(`  [${(i + 1) * 5}s] URL: ${page.url()}`);
    }

    console.log("  最終状態を保存...");
    await capturePage(page, "99_final_state");

    console.log(`\n=== テスト完了 ===`);
    console.log(`全結果: ${OUT_DIR}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
