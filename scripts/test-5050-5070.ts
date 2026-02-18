/**
 * 5050ページ（料金ランク一括設定）+ 5070ページ（出力）セレクタ探索
 *
 * 目的:
 * - stepB.autoCompleteInput を発見 (5050)
 * - stepC.rankOnlyToggle, planGroupList, planGroupConfirm を発見 (5070)
 *
 * 前提: 畳の宿 那覇壺屋 に施設切り替え済み（セッション復元を試行）
 *
 * Usage:
 *   cd apps/runner
 *   npx tsx ../../scripts/test-5050-5070.ts
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

const OUT_DIR = resolve(PROJECT_ROOT, "data", "artifacts", "page-test");
mkdirSync(OUT_DIR, { recursive: true });

/** Capture page: screenshot + elements JSON */
async function capturePage(page: import("playwright").Page, label: string) {
  await page.screenshot({ path: resolve(OUT_DIR, `${label}.png`), fullPage: true });
  writeFileSync(resolve(OUT_DIR, `${label}.html`), await page.content(), "utf-8");

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
        options: opts.slice(0, 20),
      });
    });

    document.querySelectorAll("a[onclick], button[onclick], input[type='submit'], input[type='button'], input[type='checkbox']").forEach((el) => {
      results.push({
        tag: el.tagName.toLowerCase(),
        type: (el as HTMLInputElement).type || null,
        text: el.textContent?.trim().slice(0, 80),
        id: el.id || null, className: el.className || null,
        onclick: el.getAttribute("onclick")?.slice(0, 150) || null,
        name: (el as HTMLInputElement).name || null,
        checked: (el as HTMLInputElement).checked ?? null,
        href: (el as HTMLAnchorElement).href || null,
      });
    });

    document.querySelectorAll("table").forEach((el) => {
      results.push({
        tag: "table", id: el.id || null, className: el.className || null,
        rows: el.rows.length,
      });
    });

    document.querySelectorAll("[class*='ui-'], [role='dialog'], [role='listbox'], [class*='section'], [class*='modal']").forEach((el) => {
      results.push({
        tag: el.tagName.toLowerCase(), role: el.getAttribute("role"),
        id: el.id || null, className: el.className?.toString()?.slice(0, 120) || null,
        text: el.textContent?.trim().slice(0, 120),
        childCount: el.children.length,
        visible: (el as HTMLElement).offsetParent !== null || (el as HTMLElement).style.display !== "none",
      });
    });

    // Labels (often near checkboxes/toggles)
    document.querySelectorAll("label").forEach((el) => {
      results.push({
        tag: "label",
        for: el.htmlFor || null,
        text: el.textContent?.trim().slice(0, 80),
        className: el.className || null,
      });
    });

    return results;
  });

  writeFileSync(resolve(OUT_DIR, `${label}_elements.json`), JSON.stringify(elements, null, 2), "utf-8");
  console.log(`  📸 ${label}: ${elements.length} elements`);
  return elements;
}

/** Login + session restore */
async function ensureLoggedIn(page: import("playwright").Page, context: import("playwright").BrowserContext) {
  const loginId = process.env.LINCOLN_LOGIN_ID!;
  const loginPw = process.env.LINCOLN_LOGIN_PW!;

  const sessionPath = resolve(PROJECT_ROOT, "data", "artifacts", "lincoln-session.json");
  if (existsSync(sessionPath)) {
    // Session loaded via context options
    await page.goto(
      "https://www.tl-lincoln.net/accomodation/Ascsc1010InitAction.do",
      { waitUntil: "networkidle", timeout: 15000 },
    ).catch(() => {});
    const title = await page.title();
    if (title.includes("トップページ")) {
      console.log("[SESSION] ✓ セッション復元成功");
      return;
    }
  }

  // Fresh login
  console.log("[LOGIN] ログイン...");
  await page.goto("https://www.tl-lincoln.net/accomodation/Ascsc1000InitAction.do", { waitUntil: "networkidle" });
  await page.locator("#txt_usrId").fill(loginId);
  await page.locator("input[type='password'][name='pwd']").fill(loginPw);
  await page.locator("#doLogin").click();
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  // Force login
  if (await page.locator("#doForceLogout").isVisible().catch(() => false)) {
    await page.locator("#doForceLogout").click();
    await page.waitForLoadState("load", { timeout: 15000 }).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }

  // 2FA
  const title = await page.title();
  if (title.includes("2段階認証") || title.includes("認証コード")) {
    console.log("[LOGIN] ⏳ 2FA — ブラウザで認証してください...");
    const url2fa = page.url();
    const start = Date.now();
    while (Date.now() - start < 300000) {
      await page.waitForTimeout(2000);
      if (page.url() !== url2fa) break;
      const e = Math.round((Date.now() - start) / 1000);
      if (e % 15 === 0 && e > 0) console.log(`[LOGIN] ⏳ ${e}s...`);
    }
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  }

  // Save session
  const state = await context.storageState();
  writeFileSync(resolve(PROJECT_ROOT, "data", "artifacts", "lincoln-session.json"), JSON.stringify(state, null, 2));
  console.log("[LOGIN] ✓ ログイン完了\n");
}

async function main() {
  if (!process.env.LINCOLN_LOGIN_ID || !process.env.LINCOLN_LOGIN_PW) {
    console.error("ERROR: .env に認証情報を設定してください");
    process.exit(1);
  }

  console.log("=== 5050 & 5070 ページ探索 ===");
  console.log(`Output: ${OUT_DIR}\n`);

  const sessionPath = resolve(PROJECT_ROOT, "data", "artifacts", "lincoln-session.json");
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    ...(existsSync(sessionPath) ? { storageState: sessionPath } : {}),
  });
  const page = await context.newPage();

  try {
    await ensureLoggedIn(page, context);

    // Check current facility
    const facilityId = await page.evaluate(() =>
      document.querySelector("dl.g_header_id dd")?.textContent?.trim() || "unknown"
    );
    console.log(`現在の施設ID: ${facilityId}\n`);

    // ==========================================================
    // PHASE 1: 5050ページ（料金ランク一括設定）
    // ==========================================================
    console.log("=== PHASE 1: 5050ページ ===");
    await page.goto(
      "https://www.tl-lincoln.net/accomodation/Ascsc5050InitAction.do",
      { waitUntil: "networkidle", timeout: 15000 },
    );
    console.log(`  URL: ${page.url()}`);
    console.log(`  Title: ${await page.title()}`);
    await capturePage(page, "01_5050_page");

    // Detailed analysis of 5050 page
    const info5050 = await page.evaluate(() => {
      const info: Record<string, unknown> = {};

      // All text/search inputs (looking for autoCompleteInput)
      info.textInputs = Array.from(document.querySelectorAll("input[type='text'], input:not([type]), input.ui-autocomplete-input")).map((el) => ({
        name: (el as HTMLInputElement).name || null,
        id: el.id || null,
        value: (el as HTMLInputElement).value?.slice(0, 100) || null,
        className: el.className || null,
        placeholder: (el as HTMLInputElement).placeholder || null,
        autocomplete: el.getAttribute("autocomplete"),
      }));

      // jQuery UI autocomplete elements
      info.autocompleteMenus = Array.from(document.querySelectorAll("ul.ui-autocomplete, ul.ui-menu, [role='listbox']")).map((m) => ({
        id: m.id || null,
        className: m.className,
        items: Array.from(m.querySelectorAll("li")).map((li) => li.textContent?.trim()?.slice(0, 60)).slice(0, 10),
      }));

      // All buttons/actions
      info.actions = Array.from(document.querySelectorAll("a[onclick], button[onclick], input[type='submit']")).map((el) => ({
        tag: el.tagName.toLowerCase(),
        text: el.textContent?.trim().slice(0, 60),
        onclick: el.getAttribute("onclick")?.slice(0, 150),
        id: el.id || null,
        className: el.className || null,
      }));

      // Forms
      info.forms = Array.from(document.querySelectorAll("form")).map((f) => ({
        name: f.name || null,
        id: f.id || null,
        action: f.action || null,
      }));

      return info;
    });

    writeFileSync(resolve(OUT_DIR, "01_5050_detail.json"), JSON.stringify(info5050, null, 2), "utf-8");

    console.log("\n  === Text inputs (autoCompleteInput候補) ===");
    (info5050.textInputs as Array<Record<string, string>>).forEach((t) => {
      console.log(`    name=${t.name} id=${t.id} class=${t.className} placeholder="${t.placeholder}" value="${t.value}"`);
    });

    console.log("\n  === Autocomplete menus ===");
    (info5050.autocompleteMenus as Array<Record<string, unknown>>).forEach((m) => {
      console.log(`    id=${m.id} class=${m.className}`);
    });

    console.log("\n  === Actions ===");
    (info5050.actions as Array<Record<string, string>>).forEach((a) => {
      console.log(`    [${a.tag}] "${a.text}" onclick=${a.onclick} id=${a.id}`);
    });

    // ==========================================================
    // PHASE 2: 5070ページ（出力・検証）
    // ==========================================================
    console.log("\n=== PHASE 2: 5070ページ ===");

    // Navigate via 料金管理 menu
    await page.goto(
      "https://www.tl-lincoln.net/accomodation/Ascsc5070InitAction.do",
      { waitUntil: "networkidle", timeout: 15000 },
    );
    console.log(`  URL: ${page.url()}`);
    console.log(`  Title: ${await page.title()}`);
    await capturePage(page, "02_5070_page");

    // Detailed analysis of 5070 page
    const info5070 = await page.evaluate(() => {
      const info: Record<string, unknown> = {};

      // All checkboxes (rankOnlyToggle candidate)
      info.checkboxes = Array.from(document.querySelectorAll("input[type='checkbox']")).map((el) => ({
        name: (el as HTMLInputElement).name || null,
        id: el.id || null,
        value: (el as HTMLInputElement).value || null,
        checked: (el as HTMLInputElement).checked,
        className: el.className || null,
        labelText: el.closest("label")?.textContent?.trim()?.slice(0, 60) || null,
        parentText: el.parentElement?.textContent?.trim()?.slice(0, 60) || null,
      }));

      // Radio buttons
      info.radios = Array.from(document.querySelectorAll("input[type='radio']")).map((el) => ({
        name: (el as HTMLInputElement).name || null,
        id: el.id || null,
        value: (el as HTMLInputElement).value || null,
        checked: (el as HTMLInputElement).checked,
        labelText: el.closest("label")?.textContent?.trim()?.slice(0, 60) || null,
      }));

      // All buttons/actions
      info.actions = Array.from(document.querySelectorAll("a[onclick], button[onclick], input[type='submit'], input[type='button']")).map((el) => ({
        tag: el.tagName.toLowerCase(),
        text: el.textContent?.trim().slice(0, 80),
        onclick: el.getAttribute("onclick")?.slice(0, 150),
        id: el.id || null,
        className: el.className || null,
      }));

      // Hidden inputs (especially rankOnlyHidden)
      info.hiddenInputs = Array.from(document.querySelectorAll("input[type='hidden']")).map((el) => ({
        name: (el as HTMLInputElement).name || null,
        id: el.id || null,
        value: (el as HTMLInputElement).value?.slice(0, 100) || null,
      })).filter((h) => h.id || (h.name && !h.name.includes("megen") && !h.name.includes("serialized")));

      // Section/panel elements (plan group picker)
      info.sectionElements = Array.from(document.querySelectorAll("[id*='section'], [class*='section'], [id*='Section'], [class*='Section']")).map((el) => ({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        className: el.className?.toString()?.slice(0, 120) || null,
        text: el.textContent?.trim().slice(0, 120),
        childCount: el.children.length,
        visible: (el as HTMLElement).offsetParent !== null,
      }));

      // Select boxes
      info.selects = Array.from(document.querySelectorAll("select")).map((el) => ({
        name: el.name || null,
        id: el.id || null,
        optionCount: el.options.length,
        firstOptions: Array.from(el.options).slice(0, 10).map((o) => ({
          value: o.value, text: o.text?.slice(0, 60), selected: o.selected,
        })),
      }));

      // Labels
      info.labels = Array.from(document.querySelectorAll("label")).map((el) => ({
        for: el.htmlFor || null,
        text: el.textContent?.trim().slice(0, 60),
        className: el.className || null,
      }));

      // All text inputs
      info.textInputs = Array.from(document.querySelectorAll("input[type='text'], input:not([type])")).map((el) => ({
        name: (el as HTMLInputElement).name || null,
        id: el.id || null,
        value: (el as HTMLInputElement).value?.slice(0, 100) || null,
        className: el.className || null,
      }));

      return info;
    });

    writeFileSync(resolve(OUT_DIR, "02_5070_detail.json"), JSON.stringify(info5070, null, 2), "utf-8");

    console.log("\n  === Checkboxes (rankOnlyToggle候補) ===");
    (info5070.checkboxes as Array<Record<string, unknown>>).forEach((c) => {
      console.log(`    name=${c.name} id=${c.id} checked=${c.checked} label="${c.labelText}" parent="${c.parentText}"`);
    });

    console.log("\n  === Radio buttons ===");
    (info5070.radios as Array<Record<string, unknown>>).forEach((r) => {
      console.log(`    name=${r.name} id=${r.id} value=${r.value} checked=${r.checked} label="${r.labelText}"`);
    });

    console.log("\n  === Actions ===");
    (info5070.actions as Array<Record<string, string>>).forEach((a) => {
      console.log(`    [${a.tag}] "${a.text}" onclick=${a.onclick} id=${a.id} class=${a.className}`);
    });

    console.log("\n  === Hidden inputs (filtered) ===");
    (info5070.hiddenInputs as Array<Record<string, string>>).forEach((h) => {
      console.log(`    name=${h.name} id=${h.id} value="${h.value}"`);
    });

    console.log("\n  === Section elements (plan group picker候補) ===");
    (info5070.sectionElements as Array<Record<string, unknown>>).forEach((s) => {
      console.log(`    id=${s.id} class=${(s.className as string)?.slice(0, 80)} children=${s.childCount} visible=${s.visible}`);
    });

    console.log("\n  === Selects ===");
    (info5070.selects as Array<Record<string, unknown>>).forEach((s) => {
      console.log(`    name=${s.name} id=${s.id} options=${s.optionCount}`);
    });

    console.log("\n  === Labels ===");
    (info5070.labels as Array<Record<string, string>>).forEach((l) => {
      console.log(`    for=${l.for} text="${l.text}"`);
    });

    // Try clicking planGroupPickerButton (#sectionTableBtn3) to see dialog
    console.log("\n  --- planGroupPickerButton (#sectionTableBtn3) クリック試行 ---");
    const pgBtn = page.locator("#sectionTableBtn3");
    if (await pgBtn.isVisible().catch(() => false)) {
      await pgBtn.click();
      await page.waitForTimeout(1500);
      console.log("  ✓ クリック成功");
      await capturePage(page, "03_5070_plangroup_dialog");

      // Capture dialog elements
      const dialogInfo = await page.evaluate(() => {
        const info: Record<string, unknown> = {};

        // Visible dialogs/modals
        info.dialogs = Array.from(document.querySelectorAll("[role='dialog'], .ui-dialog, .c_modal, [class*='modal'], [class*='dialog']"))
          .filter((el) => (el as HTMLElement).offsetParent !== null || (el as HTMLElement).style.display !== "none")
          .map((d) => ({
            id: d.id || null,
            className: d.className?.toString()?.slice(0, 120) || null,
            text: d.textContent?.trim().slice(0, 300),
            childCount: d.children.length,
          }));

        // Visible checkboxes within dialogs or sections
        info.visibleCheckboxes = Array.from(document.querySelectorAll("input[type='checkbox']"))
          .filter((el) => (el as HTMLElement).offsetParent !== null)
          .map((el) => ({
            name: (el as HTMLInputElement).name || null,
            id: el.id || null,
            value: (el as HTMLInputElement).value || null,
            checked: (el as HTMLInputElement).checked,
            parentText: el.parentElement?.textContent?.trim()?.slice(0, 80) || null,
          }));

        // Visible buttons
        info.visibleButtons = Array.from(document.querySelectorAll("a.c_btn, button.c_btn, a[onclick], button[onclick]"))
          .filter((el) => (el as HTMLElement).offsetParent !== null)
          .map((b) => ({
            tag: b.tagName.toLowerCase(),
            text: b.textContent?.trim().slice(0, 60),
            onclick: b.getAttribute("onclick")?.slice(0, 100),
            id: b.id || null,
            className: b.className || null,
          }));

        // Section box body items (plan groups)
        info.sectionBoxItems = Array.from(document.querySelectorAll("[class*='sectionBoxBody'] li, [class*='section_box_body'] li, .c_section_box_body li"))
          .map((li) => ({
            text: li.textContent?.trim().slice(0, 80),
            className: li.className || null,
            checkbox: li.querySelector("input[type='checkbox']") ? {
              name: (li.querySelector("input[type='checkbox']") as HTMLInputElement).name,
              id: li.querySelector("input[type='checkbox']")?.id || null,
              checked: (li.querySelector("input[type='checkbox']") as HTMLInputElement).checked,
            } : null,
          }));

        return info;
      });

      writeFileSync(resolve(OUT_DIR, "03_plangroup_detail.json"), JSON.stringify(dialogInfo, null, 2), "utf-8");

      console.log(`  Dialogs: ${(dialogInfo.dialogs as unknown[]).length}`);
      console.log(`  Visible checkboxes: ${(dialogInfo.visibleCheckboxes as unknown[]).length}`);
      console.log(`  Visible buttons: ${(dialogInfo.visibleButtons as unknown[]).length}`);
      console.log(`  Section box items: ${(dialogInfo.sectionBoxItems as unknown[]).length}`);

      console.log("\n  === Plan group dialog checkboxes ===");
      (dialogInfo.visibleCheckboxes as Array<Record<string, unknown>>).forEach((c) => {
        console.log(`    name=${c.name} id=${c.id} checked=${c.checked} parent="${c.parentText}"`);
      });

      console.log("\n  === Plan group dialog buttons ===");
      (dialogInfo.visibleButtons as Array<Record<string, string>>).forEach((b) => {
        console.log(`    [${b.tag}] "${b.text}" onclick=${b.onclick} id=${b.id}`);
      });
    } else {
      console.log("  ⚠ #sectionTableBtn3 が見つかりません");
    }

    // ==========================================================
    // PHASE 3: ブラウザ維持
    // ==========================================================
    console.log("\n=== PHASE 3: 30秒間ブラウザ維持 ===");
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(5000);
      console.log(`  [${(i + 1) * 5}s] URL: ${page.url()}`);
    }
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
