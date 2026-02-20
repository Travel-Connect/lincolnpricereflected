/**
 * Explore: 5010 → 5050 page navigation discovery.
 * Navigates to the 料金管理 page, captures it, then tries to find 5050.
 *
 * Usage:
 *   cd apps/runner
 *   npx tsx ../../scripts/explore-5050.ts
 */

import "dotenv/config";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, "..", ".env") });

const LINCOLN_BASE = "https://www.tl-lincoln.net/accomodation/";
const OUTPUT_DIR = resolve(__dirname, "..", "data", "artifacts", "explore-5050");

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Login
    const { login, waitFor2FA } = await import("../apps/runner/src/auth/index.js");
    const loginId = process.env.LINCOLN_LOGIN_ID!;
    const loginPw = process.env.LINCOLN_LOGIN_PW!;

    const result = await login(page, loginId, loginPw);
    if (result.needs2FA) {
      console.log("[explore] 2FA required — enter code in browser...");
      await waitFor2FA(page);
    }
    console.log("[explore] Logged in");

    // Switch facility
    const { switchFacility } = await import("../apps/runner/src/auth/facility-switch.js");
    await switchFacility(page, "畳の宿", "Y77131");
    console.log("[explore] Facility switched");

    // Navigate to 5010 (料金管理)
    console.log("[explore] Navigating to 5010 (料金管理)...");
    await page.goto(LINCOLN_BASE + "Ascsc5010InitAction.do", {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    await page.screenshot({
      path: resolve(OUTPUT_DIR, "01_5010_price_management.png"),
      fullPage: true,
    });
    console.log(`[explore] 5010 URL: ${page.url()}`);
    console.log(`[explore] 5010 title: ${await page.title()}`);

    // Find all links that might lead to 5050 or contain "doLink"
    const links = await page.evaluate(() => {
      const results: string[] = [];
      document.querySelectorAll("a[onclick]").forEach((a) => {
        const onclick = a.getAttribute("onclick") || "";
        const text = (a.textContent || "").trim();
        if (onclick.includes("doLink") || onclick.includes("5050") || text.includes("一括")) {
          results.push(`${text} → ${onclick}`);
        }
      });
      // Also check all tab links
      document.querySelectorAll(".c_tab a, .c_nav a, [class*=tab] a").forEach((a) => {
        const onclick = a.getAttribute("onclick") || "";
        const href = a.getAttribute("href") || "";
        const text = (a.textContent || "").trim();
        results.push(`[tab/nav] ${text} → onclick="${onclick}" href="${href}"`);
      });
      return results;
    });

    console.log("[explore] Links found on 5010:");
    links.forEach((l) => console.log(`  ${l}`));

    // Try to navigate to 5050 directly
    console.log("\n[explore] Trying direct navigation to Ascsc5050InitAction.do...");
    await page.goto(LINCOLN_BASE + "Ascsc5050InitAction.do", {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    await page.screenshot({
      path: resolve(OUTPUT_DIR, "02_5050_direct.png"),
      fullPage: true,
    });
    console.log(`[explore] 5050 URL: ${page.url()}`);
    console.log(`[explore] 5050 title: ${await page.title()}`);

    // Check what's on this page
    const pageInfo = await page.evaluate(() => {
      const body = document.body;
      const screenId = (document.querySelector("input[name='screenId']") as HTMLInputElement)?.value;
      const title = document.querySelector(".c_ttl")?.textContent?.trim();
      const forms = Array.from(document.querySelectorAll("form")).map(f => f.name);
      const inputs = Array.from(document.querySelectorAll("input[id]")).map(i => `${i.id}: ${(i as HTMLInputElement).type}`).slice(0, 20);
      const buttons = Array.from(document.querySelectorAll("a[onclick]")).map(a => {
        return `${(a.textContent || "").trim()} → ${a.getAttribute("onclick")}`;
      }).slice(0, 20);
      const errors = Array.from(document.querySelectorAll(".c_txt-worning, .c_txt-error")).map(e => (e.textContent || "").trim());
      return { screenId, title, forms, inputs, buttons, errors };
    });

    console.log("[explore] 5050 page info:", JSON.stringify(pageInfo, null, 2));

    // Save HTML
    const html = await page.content();
    const { writeFileSync } = await import("fs");
    writeFileSync(resolve(OUTPUT_DIR, "02_5050_direct.html"), html);

    console.log("\n[explore] Done! Check data/artifacts/explore-5050/");
    console.log("Browser is open for manual inspection. Ctrl+C to exit.");
    await new Promise(() => {});

  } catch (err) {
    console.error("[explore] Error:", err instanceof Error ? err.message : err);
    await page.screenshot({ path: resolve(OUTPUT_DIR, "error.png") }).catch(() => {});
    console.log("Browser is open. Ctrl+C to exit.");
    await new Promise(() => {});
  }
}

main().catch((err) => {
  console.error("[explore] Unexpected:", err);
  process.exit(2);
});
