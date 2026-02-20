/**
 * Web Capture — Playwright でクライアントサイドレンダリングのページをキャプチャ。
 *
 * Usage:
 *   npx tsx scripts/web-capture.ts <url> [--full] [--wait <ms>] [--scroll]
 *
 * Options:
 *   --full     フルページスクリーンショット (default: viewport only)
 *   --wait     レンダリング待機時間 ms (default: 3000)
 *   --scroll   ページをスクロールして全セクションを読み込む
 *
 * Output:
 *   data/artifacts/web-capture/<timestamp>.png
 *   data/artifacts/web-capture/<timestamp>.md  (テキスト抽出)
 */

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename_local = typeof __filename !== "undefined" ? __filename : fileURLToPath(import.meta.url);
const __dirname_local = dirname(__filename_local);
const PROJECT_ROOT = resolve(__dirname_local, "..");
const OUTPUT_DIR = resolve(PROJECT_ROOT, "data/artifacts/web-capture");

async function main() {
  const args = process.argv.slice(2);
  const url = args.find((a) => !a.startsWith("--"));

  if (!url) {
    console.error("Usage: npx tsx scripts/web-capture.ts <url> [--full] [--wait <ms>] [--scroll]");
    process.exit(1);
  }

  const fullPage = args.includes("--full");
  const scrollMode = args.includes("--scroll");
  const waitIdx = args.indexOf("--wait");
  const waitMs = waitIdx >= 0 ? parseInt(args[waitIdx + 1], 10) : 3000;

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const screenshotPath = resolve(OUTPUT_DIR, `${timestamp}.png`);
  const textPath = resolve(OUTPUT_DIR, `${timestamp}.md`);

  console.log(`[capture] URL: ${url}`);
  console.log(`[capture] Full page: ${fullPage}, Wait: ${waitMs}ms, Scroll: ${scrollMode}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "ja-JP",
  });
  const page = await context.newPage();

  try {
    // Navigate and wait for initial render
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(waitMs);

    // Scroll to trigger lazy-loaded content
    if (scrollMode) {
      console.log("[capture] Scrolling page...");
      await autoScroll(page);
      await page.waitForTimeout(1000);
    }

    // Take screenshot
    await page.screenshot({
      path: screenshotPath,
      fullPage,
    });
    console.log(`[capture] Screenshot: ${screenshotPath}`);

    // Extract visible text
    const textContent = await page.evaluate(() => {
      const walk = (el: Element, depth: number): string[] => {
        const lines: string[] = [];
        const tag = el.tagName?.toLowerCase() || "";
        const text = el.childNodes.length === 1 && el.childNodes[0].nodeType === 3
          ? (el.textContent || "").trim()
          : "";

        if (text && !["script", "style", "noscript"].includes(tag)) {
          const prefix = ["h1", "h2", "h3", "h4", "h5", "h6"].includes(tag)
            ? "#".repeat(parseInt(tag[1])) + " "
            : "";
          lines.push(prefix + text);
        }

        for (const child of el.children) {
          lines.push(...walk(child, depth + 1));
        }
        return lines;
      };

      return walk(document.body, 0)
        .filter((l) => l.length > 0)
        .join("\n");
    });

    writeFileSync(textPath, `# Captured: ${url}\n\n${textContent}\n`);
    console.log(`[capture] Text: ${textPath}`);

    // Page info
    const title = await page.title();
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    }));
    console.log(`[capture] Title: ${title}`);
    console.log(`[capture] Page size: ${dimensions.scrollWidth}x${dimensions.scrollHeight}`);

  } finally {
    await browser.close();
  }

  console.log("[capture] Done!");
}

async function autoScroll(page: import("playwright").Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 100);
    });
  });
}

main().catch((err) => {
  console.error("[capture] Error:", err.message);
  process.exit(1);
});
