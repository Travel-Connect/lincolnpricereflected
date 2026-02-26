/**
 * Facility sync: navigate to Lincoln and scrape calendar names + plan group sets + plan names.
 *
 * Flow:
 *   1. Launch browser + auth
 *   2. Switch to target facility (reuses STEPA logic)
 *   3. Navigate to 6800 calendar list → extract calendar names
 *   4. Navigate to 5050 plan group sets → extract plan group set names
 *   5. Click each plan group set → extract plan names from select
 *   6. Save all to Supabase
 */

import { chromium } from "playwright";
import type { Page, BrowserContext } from "playwright";
import {
  claimNextSyncRequest,
  completeSyncRequest,
  failSyncRequest,
  type CalendarSyncRequest,
} from "./job-state.js";
import { getFacilityInfo } from "./facility-lookup.js";
import { getSelector } from "./selectors.js";
import {
  login,
  waitFor2FA,
  hasSavedSession,
  getSessionPath,
  saveSession,
  clearSession,
} from "./auth/index.js";

const LINCOLN_BASE = "https://www.tl-lincoln.net/accomodation/";
const TOP_PAGE_URL = LINCOLN_BASE + "Ascsc1010InitAction.do";
const MAX_SWITCH_ATTEMPTS = 3;

/** Check for and process one pending calendar sync request. Returns true if one was processed. */
export async function processNextSyncRequest(): Promise<boolean> {
  const req = await claimNextSyncRequest();
  if (!req) return false;

  console.log(`[sync] Claimed sync request ${req.id} for facility ${req.facility_id}`);

  try {
    await executeSyncRequest(req);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[sync] Sync request ${req.id} failed: ${message}`);
    await failSyncRequest(req.id, message);
    return true;
  }
}

/** Execute a single sync request — scrapes both calendars and plan group sets */
async function executeSyncRequest(req: CalendarSyncRequest): Promise<void> {
  const { lincoln_id, name: facilityName } = await getFacilityInfo(req.facility_id);
  console.log(`[sync] Target facility: ${facilityName} (${lincoln_id})`);

  // Launch browser
  const headless = process.env.PLAYWRIGHT_HEADLESS === "true";
  const browser = await chromium.launch({ headless });
  const contextOptions = hasSavedSession()
    ? { storageState: getSessionPath() }
    : {};
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  try {
    // Auth
    await performSyncAuth(page, context);

    // Switch facility
    await switchToFacility(page, facilityName, lincoln_id);

    // --- Scrape 6800: Calendar names ---
    const calendarListUrl = LINCOLN_BASE + getSelector("navigation.calendarSettings");
    console.log(`[sync] Navigating to 6800 calendar list`);
    await page.goto(calendarListUrl, { waitUntil: "networkidle", timeout: 30000 });

    const calendars = await scrapeCalendarNames(page);
    console.log(`[sync] Found ${calendars.length} calendars: ${calendars.join(", ")}`);

    if (calendars.length === 0) {
      throw new Error("No calendars found on 6800 page");
    }

    // --- Scrape 5050: Plan group set names ---
    const url5050 = LINCOLN_BASE + "Ascsc5050InitAction.do";
    console.log(`[sync] Navigating to 5050 (plan group sets)`);
    await page.goto(url5050, { waitUntil: "networkidle", timeout: 30000 });

    const planGroupSets = await scrapePlanGroupSetNames(page);
    console.log(`[sync] Found ${planGroupSets.length} plan group sets: ${planGroupSets.join(", ")}`);

    // --- Scrape 5050: Plan names per plan group set ---
    const planNames = await scrapePlanNamesPerSet(page);
    const totalPlans = planNames.reduce((sum, pn) => sum + pn.names.length, 0);
    console.log(`[sync] Found ${totalPlans} plan names across ${planNames.length} plan group sets`);

    // --- Save all to DB ---
    await completeSyncRequest(req.id, calendars, req.facility_id, planGroupSets, planNames);
    console.log(`[sync] Sync request ${req.id} completed successfully`);
  } finally {
    await browser.close();
  }
}

/** Auth for sync — similar to main.ts performAuth but without job logging */
async function performSyncAuth(
  page: Page,
  context: BrowserContext,
): Promise<void> {
  // Try saved session
  if (hasSavedSession()) {
    console.log("[sync] Attempting session restore...");
    await page
      .goto(TOP_PAGE_URL, { waitUntil: "networkidle", timeout: 15000 })
      .catch(() => {});

    const title = await page.title();
    if (title.includes("トップページ") || title.includes("メニュー")) {
      console.log("[sync] Session restored");
      return;
    }
    console.log("[sync] Session expired — fresh login needed");
    clearSession();
  }

  // Fresh login using env credentials
  const loginId = process.env.LINCOLN_LOGIN_ID;
  const loginPw = process.env.LINCOLN_LOGIN_PW;
  if (!loginId || !loginPw) {
    throw new Error("Missing LINCOLN_LOGIN_ID/PW env vars for sync");
  }

  console.log("[sync] Logging in...");
  const result = await login(page, loginId, loginPw);

  if (result.needs2FA) {
    console.log("[sync] 2FA required — waiting for user input in browser...");
    await waitFor2FA(page);
  }

  // Verify login
  const title = await page.title();
  if (title.includes("ログイン") || title.includes("認証")) {
    throw new Error(`[sync] Login failed. Page title: ${title}`);
  }

  await saveSession(context);
  console.log("[sync] Auth completed");
}

/** Switch to target facility — reuses STEPA pattern */
async function switchToFacility(
  page: Page,
  facilityName: string,
  expectedId: string,
): Promise<void> {
  await page.goto(TOP_PAGE_URL, { waitUntil: "networkidle", timeout: 15000 });

  const facilityIdSelector = getSelector("stepA.facilityIdText");
  const currentId = (
    (await page.locator(facilityIdSelector).first().textContent()) ?? ""
  ).trim();
  console.log(`[sync] Current facility: ${currentId}`);

  if (currentId === expectedId) {
    console.log("[sync] Already on correct facility");
    return;
  }

  console.log(`[sync] Switching to ${facilityName} (${expectedId})`);
  const searchInputSelector = getSelector("facilitySwitch.searchInput");
  const autocompleteItemSelector = getSelector("facilitySwitch.selectItem");

  for (let attempt = 1; attempt <= MAX_SWITCH_ATTEMPTS; attempt++) {
    console.log(`[sync] Switch attempt ${attempt}/${MAX_SWITCH_ATTEMPTS}`);

    const input = page.locator(searchInputSelector);
    await input.click({ clickCount: 3 });
    await input.press("Backspace");
    await input.pressSequentially(facilityName, { delay: 50 });

    await page.waitForSelector(autocompleteItemSelector, {
      state: "visible",
      timeout: 5000,
    });

    await page.locator(autocompleteItemSelector).first().click();
    await page.waitForLoadState("networkidle", { timeout: 15000 });

    const newId = (
      (await page.locator(facilityIdSelector).first().textContent()) ?? ""
    ).trim();

    if (newId === expectedId) {
      console.log("[sync] Facility switch successful");
      return;
    }

    const pageContent = await page.content();
    if (pageContent.includes("MASC1042")) {
      console.log("[sync] Got MASC1042 — re-selecting for forced switch");
      continue;
    }

    await page.goto(TOP_PAGE_URL, { waitUntil: "networkidle", timeout: 15000 });
  }

  throw new Error(
    `Facility switch failed after ${MAX_SWITCH_ATTEMPTS} attempts`,
  );
}

/** Scrape calendar names from the 6800 list page */
async function scrapeCalendarNames(page: Page): Promise<string[]> {
  const listItemSelector = getSelector("step0.calendarListItem");

  await page.waitForSelector(listItemSelector, {
    state: "visible",
    timeout: 10000,
  });

  const names = await page.$$eval(listItemSelector, (links) =>
    links
      .map((a) => (a.textContent || "").trim())
      .filter((name) => name.length > 0),
  );

  return names;
}

/** Scrape plan group set names from the 5050 page */
async function scrapePlanGroupSetNames(page: Page): Promise<string[]> {
  const setSelector = getSelector("stepB.planGroupSetItem");

  // Plan group sets may not exist if the page structure differs
  const hasItems = await page
    .waitForSelector(setSelector, { state: "visible", timeout: 10000 })
    .then(() => true)
    .catch(() => false);

  if (!hasItems) {
    console.log("[sync] No plan group sets found on 5050 page");
    return [];
  }

  const names = await page.$$eval(setSelector, (links) =>
    links
      .map((a) => (a.textContent || "").trim())
      .filter((name) => name.length > 0),
  );

  return names;
}

export interface PlanGroupSetPlanNames {
  planGroupSetName: string;
  names: string[];
}

/**
 * Scrape plan names per plan group set from the 5050 page.
 * Clicks each plan group set link and reads plan names from select#sectionGroupSelect2.
 *
 * NOTE: selectPlanGroupSet() triggers a page reload, so element references
 * become stale after each click. We must re-query elements each iteration.
 */
async function scrapePlanNamesPerSet(page: Page): Promise<PlanGroupSetPlanNames[]> {
  const setSelector = getSelector("stepB.planGroupSetItem");
  const planSelectSelector = getSelector("stepB.planGroupSelect");

  // First, collect all set names (before any clicks cause reloads)
  const setNames = await page.$$eval(setSelector, (links) =>
    links
      .map((a) => (a.textContent || "").trim())
      .filter((name) => name.length > 0),
  );

  if (setNames.length === 0) return [];

  const results: PlanGroupSetPlanNames[] = [];

  for (let i = 0; i < setNames.length; i++) {
    const setName = setNames[i];
    console.log(`[sync] Clicking plan group set [${i + 1}/${setNames.length}]: ${setName}`);

    // Re-query links each time since page reloads after click
    const links = await page.$$(setSelector);
    if (i >= links.length) {
      console.log(`[sync]   → Link index ${i} out of bounds (only ${links.length} links), skipping`);
      continue;
    }

    await links[i].click();

    // Wait for page reload / network activity to settle
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    // Read plan names from select options (excluding empty/default options)
    const planNames = await page.$$eval(
      `${planSelectSelector} option`,
      (options) =>
        options
          .map((opt) => (opt.textContent || "").trim())
          .filter((name) => name.length > 0),
    );

    console.log(`[sync]   → ${planNames.length} plans: ${planNames.slice(0, 3).join(", ")}${planNames.length > 3 ? "..." : ""}`);
    results.push({ planGroupSetName: setName, names: planNames });
  }

  return results;
}
