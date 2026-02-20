/**
 * Web Capture All - Figma prototype site crawl & screenshot
 *
 * Usage:  npx tsx scripts/web-capture-all.ts
 * Output: data/artifacts/web-capture/figma-page*.png
 */

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname_local = typeof __dirname !== "undefined" ? __dirname : dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname_local, "..");
const OUTPUT_DIR = resolve(PROJECT_ROOT, "data/artifacts/web-capture");
const BASE_URL = "https://raft-center-34934946.figma.site";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log("[capture-all] Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ja-JP" });
  const page = await context.newPage();

  try {
    console.log("[capture-all] Navigating to " + BASE_URL);
    await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(5000);
    console.log("[capture-all] Page loaded. Title: " + (await page.title()));

    // Landing page screenshot
    await page.screenshot({ path: resolve(OUTPUT_DIR, "figma-page0-landing.png"), fullPage: true });
    console.log("[capture-all] Saved: figma-page0-landing.png");

    const landingText = await page.evaluate(function () { return document.body.innerText.slice(0, 3000); });
    console.log("[capture-all] Landing text (first 1000):");
    console.log(landingText.slice(0, 1000));
    console.log("---");

    // Discover anchor links
    console.log("[capture-all] Discovering links...");
    var allLinks = await page.evaluate(function () {
      var anchors = document.querySelectorAll("a[href]");
      var results: Array<{ href: string; text: string }> = [];
      for (var i = 0; i < anchors.length; i++) {
        var a = anchors[i] as HTMLAnchorElement;
        results.push({ href: a.href, text: (a.textContent || "").trim().slice(0, 100) });
      }
      return results;
    });

    console.log("[capture-all] Found " + allLinks.length + " anchor elements:");
    for (var link of allLinks) {
      console.log("  - " + (link.text || "(no text)") + " => " + link.href);
    }

    // Discover clickable elements
    var clickables = await page.evaluate(function () {
      var elems = document.querySelectorAll("button, [role=link], [role=button], [data-href], nav a");
      var results: Array<{ tag: string; text: string; cls: string }> = [];
      for (var i = 0; i < elems.length; i++) {
        var el = elems[i] as HTMLElement;
        results.push({ tag: el.tagName, text: (el.textContent || "").trim().slice(0, 100), cls: el.className ? el.className.toString() : "" });
      }
      return results;
    });

    console.log("[capture-all] Found " + clickables.length + " clickable elements:");
    for (var cl of clickables) { console.log("  - <" + cl.tag + "> " + cl.text.slice(0, 60)); }

    // DOM structure
    var domStructure = await page.evaluate(function () {
      function walk(el: Element, d: number): string {
        if (d > 4) return "";
        var t = el.tagName.toLowerCase();
        var id = el.id ? "#" + el.id : "";
        var c = el.className ? "." + el.className.toString().split(" ").slice(0,3).join(".") : "";
        var n = el.children.length;
        var txt = n === 0 ? (el.textContent || "").trim().slice(0,50) : "";
        var pad = ""; for (var x=0;x<d;x++) pad += "  ";
        var r = pad + "<" + t + id + c + ">" + (txt ? " " + JSON.stringify(txt) : "") + (n > 0 ? " (" + n + ")" : "") + "\n";
        for (var i=0; i < Math.min(n, 20); i++) r += walk(el.children[i], d+1);
        return r;
      }
      return walk(document.body, 0);
    });
    writeFileSync(resolve(OUTPUT_DIR, "figma-dom-structure.txt"), domStructure);
    console.log("[capture-all] DOM structure saved. First 2000 chars:");
    console.log(domStructure.slice(0, 2000));

    // Collect unique same-origin pages
    var currentUrl = page.url();
    var baseOrigin = new URL(BASE_URL).origin;
    var uniqueUrls = new Map<string, string>();
    uniqueUrls.set(currentUrl, "landing");

    for (var lnk of allLinks) {
      try {
        var p = new URL(lnk.href);
        if (p.origin === baseOrigin) {
          var norm = p.origin + p.pathname.replace(//$/, "");
          if (!uniqueUrls.has(norm) && norm !== baseOrigin) uniqueUrls.set(norm, lnk.text || p.pathname);
        }
      } catch (e) {}
    }

    console.log("[capture-all] Unique same-origin pages: " + uniqueUrls.size);
    for (var [u, l] of uniqueUrls) console.log("  - " + l + " => " + u);

    // Navigate & screenshot each page
    var pageIndex = 1;
    var capturedUrls = new Set<string>();
    for (var [u2] of uniqueUrls) capturedUrls.add(u2);

    for (var [url, label] of uniqueUrls) {
      if (url === currentUrl) continue;
      var slug = slugify(label) || "page" + pageIndex;
      var fname = "figma-page" + pageIndex + "-" + slug + ".png";
      console.log("[capture-all] [" + pageIndex + "] => " + url + " (" + label + ")");
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
        await page.waitForTimeout(3000);
        await page.screenshot({ path: resolve(OUTPUT_DIR, fname), fullPage: true });
        console.log("[capture-all] Saved: " + fname);

        // Discover sub-links
        var subLinks = await page.evaluate(function () {
          var a = document.querySelectorAll("a[href]");
          var r: Array<{ href: string; text: string }> = [];
          for (var i = 0; i < a.length; i++) {
            var el = a[i] as HTMLAnchorElement;
            r.push({ href: el.href, text: (el.textContent || "").trim().slice(0, 100) });
          }
          return r;
        });
        for (var sl of subLinks) {
          try {
            var sp = new URL(sl.href);
            if (sp.origin === baseOrigin) {
              var sn = sp.origin + sp.pathname.replace(//$/, "");
              if (!uniqueUrls.has(sn) && sn !== baseOrigin && !capturedUrls.has(sn)) {
                uniqueUrls.set(sn, sl.text || sp.pathname);
                capturedUrls.add(sn);
                console.log("[capture-all] New link found: " + sl.text + " => " + sn);
              }
            }
          } catch (e) {}
        }

        var pt = await page.evaluate(function () { return document.body.innerText.slice(0, 300); });
        console.log("[capture-all] Page text: " + pt.slice(0, 200));
      } catch (err: any) {
        console.error("[capture-all] Error: " + url + " - " + err.message);
      }
      pageIndex++;
    }

    // SPA click-based navigation discovery
    console.log("[capture-all] Returning to home for SPA nav...");
    await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(5000);

    var navAnchors = await page.evaluate(function () {
      var anchors = document.querySelectorAll("a");
      var seen = new Set<string>();
      var results: Array<{ text: string; href: string }> = [];
      for (var i = 0; i < anchors.length; i++) {
        var a = anchors[i] as HTMLAnchorElement;
        var t = (a.textContent || "").trim();
        if (t && !seen.has(t) && t.length < 80) { seen.add(t); results.push({ text: t, href: a.href }); }
      }
      return results;
    });
    console.log("[capture-all] Unique anchors for click exploration: " + navAnchors.length);

    for (var nav of navAnchors) {
      try {
        var np = new URL(nav.href);
        var nn = np.origin + np.pathname.replace(//$/, "");
        if (capturedUrls.has(nn) || capturedUrls.has(nav.href)) continue;
      } catch (e) {}

      console.log("[capture-all] Clicking: " + nav.text);
      try {
        var el = page.locator("a").filter({ hasText: nav.text }).first();
        var vis = await el.isVisible({ timeout: 3000 }).catch(function () { return false; });
        if (vis) {
          await el.click({ timeout: 5000 });
          await page.waitForTimeout(3000);
          var nUrl = page.url();
          var nNorm = new URL(nUrl).origin + new URL(nUrl).pathname.replace(//$/, "");
          if (!capturedUrls.has(nNorm) && !capturedUrls.has(nUrl)) {
            capturedUrls.add(nNorm);
            var sSlug = slugify(nav.text) || "spa" + pageIndex;
            var sFn = "figma-page" + pageIndex + "-" + sSlug + ".png";
            await page.screenshot({ path: resolve(OUTPUT_DIR, sFn), fullPage: true });
            console.log("[capture-all] Saved: " + sFn + " (URL: " + nUrl + ")");
            var st = await page.evaluate(function () { return document.body.innerText.slice(0, 300); });
            console.log("[capture-all] Page text: " + st.slice(0, 200));
            pageIndex++;
          } else {
            console.log("[capture-all] Already captured: " + nUrl);
          }
          if (page.url() !== BASE_URL) {
            await page.goBack({ waitUntil: "networkidle", timeout: 15000 }).catch(function () {});
            await page.waitForTimeout(2000);
          }
        }
      } catch (err: any) {
        console.error("[capture-all] Click error " + nav.text + ": " + err.message);
        await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 15000 }).catch(function () {});
        await page.waitForTimeout(2000);
      }
    }

    // Summary
    console.log("============================================================");
    console.log("[capture-all] DONE! Captured " + pageIndex + " pages total.");
    console.log("[capture-all] Screenshots saved to: " + OUTPUT_DIR);
    console.log("============================================================");

    writeFileSync(resolve(OUTPUT_DIR, "figma-capture-manifest.json"), JSON.stringify({
      timestamp: new Date().toISOString(),
      baseUrl: BASE_URL,
      totalPages: pageIndex,
      outputDir: OUTPUT_DIR,
      pages: Array.from(capturedUrls),
    }, null, 2));

  } finally {
    await browser.close();
  }
}

main().catch(function (err) {
  console.error("[capture-all] Fatal error:", err.message);
  console.error(err.stack);
  process.exit(1);
});
