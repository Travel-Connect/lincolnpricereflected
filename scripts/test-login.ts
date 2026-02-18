/**
 * Lincoln ログインテスト（非対話式）
 *
 * .env の LINCOLN_LOGIN_ID / LINCOLN_LOGIN_PW を使って自動ログインする。
 * 2FA 画面が出たらブラウザ上でユーザーが手動入力 → URL 変化で自動検知して続行。
 * ターミナルの Enter 入力は不要。
 *
 * Usage:
 *   cd apps/runner
 *   npx tsx ../../scripts/test-login.ts
 */

import { config } from "dotenv";
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..");

// Load .env from project root
config({ path: resolve(PROJECT_ROOT, ".env") });

const OUT_DIR = resolve(PROJECT_ROOT, "data", "artifacts", "login-test");
mkdirSync(OUT_DIR, { recursive: true });

/** Save page info: screenshot + HTML + elements JSON */
async function savePage(
  page: import("playwright").Page,
  label: string,
) {
  const ssPath = resolve(OUT_DIR, `${label}.png`);
  await page.screenshot({ path: ssPath, fullPage: true });
  console.log(`  Screenshot: ${ssPath}`);

  const htmlPath = resolve(OUT_DIR, `${label}.html`);
  writeFileSync(htmlPath, await page.content(), "utf-8");

  const elements = await page.evaluate(() => {
    const results: Record<string, unknown>[] = [];

    document.querySelectorAll("input").forEach((el) => {
      results.push({
        tag: "input",
        type: el.type,
        name: el.name || null,
        id: el.id || null,
        placeholder: el.placeholder || null,
        className: el.className || null,
        value: el.type === "hidden" ? el.value?.slice(0, 100) : null,
      });
    });

    document.querySelectorAll("select").forEach((el) => {
      results.push({
        tag: "select",
        name: el.name || null,
        id: el.id || null,
        optionCount: el.options.length,
      });
    });

    document.querySelectorAll("a[onclick], button, input[type='submit']").forEach((el) => {
      results.push({
        tag: el.tagName.toLowerCase(),
        text: el.textContent?.trim().slice(0, 60),
        id: el.id || null,
        className: el.className || null,
        onclick: el.getAttribute("onclick")?.slice(0, 100) || null,
      });
    });

    return results;
  });

  const elemPath = resolve(OUT_DIR, `${label}_elements.json`);
  writeFileSync(elemPath, JSON.stringify(elements, null, 2), "utf-8");
  console.log(`  Elements: ${elemPath} (${elements.length} items)`);

  return elements;
}

async function main() {
  const loginId = process.env.LINCOLN_LOGIN_ID;
  const loginPw = process.env.LINCOLN_LOGIN_PW;

  if (!loginId || !loginPw) {
    console.error("ERROR: .env に LINCOLN_LOGIN_ID / LINCOLN_LOGIN_PW を設定してください");
    process.exit(1);
  }

  console.log("=== Lincoln ログインテスト（非対話式） ===");
  console.log(`Login ID: ${loginId}`);
  console.log(`Output: ${OUT_DIR}\n`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  try {
    // --- Step 1: ログインページ ---
    const loginUrl = "https://www.tl-lincoln.net/accomodation/Ascsc1000InitAction.do";
    console.log(`[1/5] ログインページを開く`);
    await page.goto(loginUrl, { waitUntil: "networkidle" });
    await savePage(page, "01_login_page");

    // --- Step 2: ID・PW 入力 + クリック ---
    console.log("[2/5] ID・PW を入力してログインボタンクリック");
    await page.locator("#txt_usrId").fill(loginId);
    await page.locator("input[type='password'][name='pwd']").fill(loginPw);
    console.log("  ✓ ID・PW 入力完了");

    await page.locator("#doLogin").click();
    console.log("  ✓ ログインボタンクリック");

    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    const afterClickUrl = page.url();
    console.log(`  遷移先: ${afterClickUrl}`);
    await savePage(page, "02_after_click");

    // --- 二重ログイン検知 → 強制ログイン ---
    const forceLoginBtn = page.locator("#doForceLogout");
    if (await forceLoginBtn.isVisible().catch(() => false)) {
      console.log("  ⚠ 二重ログイン検出 → 「強制ログイン」をクリック");
      await forceLoginBtn.click();
      // 強制ログイン後はリダイレクトが発生するので十分待つ
      await page.waitForLoadState("load", { timeout: 15000 }).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(2000);
      console.log(`  遷移先: ${page.url()}`);
      await savePage(page, "02b_after_force_login");
    }

    // --- Step 3: 2FA 検知 & 自動待機 ---
    const pageTitle = await page.title();
    const is2FA = pageTitle.includes("2段階認証") || pageTitle.includes("認証コード");
    console.log(`[3/5] 2FA 検知: ${is2FA ? "YES" : "NO"} (title: ${pageTitle})`);

    if (is2FA) {
      console.log("  ⏳ 2FA 画面を検出。ブラウザで認証コードを入力してください...");
      console.log("  ⏳ URL 変化を自動検知します（最大5分待機）");

      // 2FA 画面の要素を記録
      const twoFactorInfo = await page.evaluate(() => {
        const inputs = document.querySelectorAll("input:not([type='hidden'])");
        const buttons = document.querySelectorAll("button, input[type='submit'], a.c_btn, a[onclick]");
        return {
          inputs: Array.from(inputs).map((el) => ({
            type: (el as HTMLInputElement).type,
            name: (el as HTMLInputElement).name || null,
            id: el.id || null,
            placeholder: (el as HTMLInputElement).placeholder || null,
          })),
          buttons: Array.from(buttons).map((el) => ({
            tag: el.tagName.toLowerCase(),
            text: el.textContent?.trim().slice(0, 60),
            id: el.id || null,
            onclick: el.getAttribute("onclick")?.slice(0, 100) || null,
            className: el.className || null,
          })),
        };
      });
      writeFileSync(
        resolve(OUT_DIR, "02_two_factor_elements.json"),
        JSON.stringify(twoFactorInfo, null, 2),
        "utf-8",
      );
      console.log(`  2FA inputs: ${JSON.stringify(twoFactorInfo.inputs)}`);
      console.log(`  2FA buttons: ${JSON.stringify(twoFactorInfo.buttons)}`);

      // URL が変わるまでポーリング（2FA 完了 = 別ページに遷移）
      const twoFactorUrl = page.url();
      const timeout = 5 * 60 * 1000; // 5 minutes
      const start = Date.now();

      while (Date.now() - start < timeout) {
        await page.waitForTimeout(2000);
        const currentUrl = page.url();
        if (currentUrl !== twoFactorUrl) {
          console.log(`  ✓ 2FA 完了を検知！遷移先: ${currentUrl}`);
          break;
        }
        const elapsed = Math.round((Date.now() - start) / 1000);
        if (elapsed % 10 === 0) {
          console.log(`  ⏳ 待機中... (${elapsed}s)`);
        }
      }

      if (page.url() === twoFactorUrl) {
        console.error("  ✗ 2FA タイムアウト（5分）");
        await browser.close();
        process.exit(1);
      }

      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    }

    // --- Step 4: ログイン後の画面を解析 ---
    console.log("[4/5] ログイン後の画面を解析中...");
    console.log(`  URL: ${page.url()}`);
    console.log(`  Title: ${await page.title()}`);
    await savePage(page, "03_logged_in");

    // ヘッダー・ナビ・施設情報を詳しく解析
    const postLoginDetail = await page.evaluate(() => {
      const info: Record<string, unknown> = {};

      // ヘッダーリンク
      const headerLinks = document.querySelectorAll("header a, .g_header a, #header a, nav a, .c_header a");
      info.headerLinks = Array.from(headerLinks).map((el) => ({
        text: el.textContent?.trim().slice(0, 60),
        href: (el as HTMLAnchorElement).href || null,
        onclick: el.getAttribute("onclick")?.slice(0, 100) || null,
        id: el.id || null,
        className: el.className || null,
      }));

      // 施設名・ID 表示
      const allDl = document.querySelectorAll("dl");
      info.dlElements = Array.from(allDl).map((dl) => ({
        text: dl.textContent?.trim().slice(0, 120),
        className: dl.className || null,
        id: dl.id || null,
      }));

      // onclick がある全要素（ボタン・リンク）
      const allOnclick = document.querySelectorAll("[onclick]");
      info.allOnclickElements = Array.from(allOnclick).map((el) => ({
        tag: el.tagName.toLowerCase(),
        text: el.textContent?.trim().slice(0, 60),
        onclick: el.getAttribute("onclick")?.slice(0, 120),
        id: el.id || null,
        className: el.className || null,
      }));

      // iframe があるか
      const iframes = document.querySelectorAll("iframe");
      info.iframes = Array.from(iframes).map((el) => ({
        src: el.src || null,
        id: el.id || null,
        name: el.name || null,
      }));

      // ナビメニュー
      const navItems = document.querySelectorAll("nav a, .g_navi a, .c_navi a, .menu a, .sidebar a, li a");
      info.navItems = Array.from(navItems).map((el) => ({
        text: el.textContent?.trim().slice(0, 60),
        href: (el as HTMLAnchorElement).href || null,
        onclick: el.getAttribute("onclick")?.slice(0, 100) || null,
      }));

      return info;
    });

    writeFileSync(
      resolve(OUT_DIR, "03_logged_in_detail.json"),
      JSON.stringify(postLoginDetail, null, 2),
      "utf-8",
    );
    console.log(`  Header links: ${(postLoginDetail.headerLinks as unknown[]).length}`);
    console.log(`  DL elements: ${(postLoginDetail.dlElements as unknown[]).length}`);
    console.log(`  Onclick elements: ${(postLoginDetail.allOnclickElements as unknown[]).length}`);
    console.log(`  Nav items: ${(postLoginDetail.navItems as unknown[]).length}`);
    console.log(`  Iframes: ${(postLoginDetail.iframes as unknown[]).length}`);

    // --- Step 5: 30秒間ブラウザを開いたまま追加データ収集 ---
    console.log("[5/5] ブラウザを30秒間開いたまま維持（画面確認用）");
    console.log("  ※ この間にブラウザで別の画面に移動しても OK");

    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(5000);
      const currentUrl = page.url();
      console.log(`  [${(i + 1) * 5}s] URL: ${currentUrl}`);
    }

    // 最終状態を保存
    console.log("  最終状態を保存中...");
    await savePage(page, "04_final_state");

    console.log(`\n=== ログインテスト完了 ===`);
    console.log(`全結果: ${OUT_DIR}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
