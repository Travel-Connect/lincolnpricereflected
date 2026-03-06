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
  getUserCredentials,
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
import { LINCOLN_BASE, TOP_PAGE_URL, MAX_SWITCH_ATTEMPTS } from "./constants.js";

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

/** Thrown when 2FA is required but browser is in headless mode */
class Needs2FAHeadlessError extends Error {
  constructor() {
    super("2FA required — headless mode cannot handle interactive 2FA");
    this.name = "Needs2FAHeadlessError";
  }
}

/** Execute a single sync request — scrapes both calendars and plan group sets */
async function executeSyncRequest(req: CalendarSyncRequest): Promise<void> {
  const { lincoln_id, name: facilityName } = await getFacilityInfo(req.facility_id);
  console.log(`[sync] Target facility: ${facilityName} (${lincoln_id})`);

  // Resolve credentials — per-user if user_id is set, otherwise env vars
  const creds = await getSyncCredentials(req.user_id);
  console.log(`[sync] Using credentials for: ${creds.lincoln_login_id}`);

  // Launch browser
  const headless = process.env.PLAYWRIGHT_HEADLESS === "true";

  async function launchBrowser(useHeadless: boolean, withSession: boolean) {
    const b = await chromium.launch({ headless: useHeadless });
    const opts = withSession && hasSavedSession() ? { storageState: getSessionPath() } : {};
    const c = await b.newContext(opts);
    const p = await c.newPage();
    return { browser: b, context: c, page: p };
  }

  let { browser, context, page } = await launchBrowser(headless, true);

  try {
    // Auth — with 2FA headful fallback
    try {
      await performSyncAuth(page, context, headless, creds);
    } catch (err) {
      if (err instanceof Needs2FAHeadlessError) {
        console.log("[sync] 2FA 検出 — ヘッド付きモードで再起動します");
        await browser.close();

        ({ browser, context, page } = await launchBrowser(false, false));
        await performSyncAuth(page, context, false, creds);
      } else {
        throw err;
      }
    }

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

interface SyncCredentials {
  lincoln_login_id: string;
  lincoln_login_pw: string;
}

/** Resolve credentials — per-user from DB if user_id is set, otherwise env vars */
async function getSyncCredentials(userId: string | null): Promise<SyncCredentials> {
  if (userId) {
    return await getUserCredentials(userId);
  }

  const loginId = process.env.LINCOLN_LOGIN_ID;
  const loginPw = process.env.LINCOLN_LOGIN_PW;
  if (!loginId || !loginPw) {
    throw new Error("Missing LINCOLN_LOGIN_ID/PW env vars and no user_id on sync request");
  }
  return { lincoln_login_id: loginId, lincoln_login_pw: loginPw };
}

/**
 * Auth for sync — similar to main.ts performAuth but without job logging.
 *
 * @param isHeadless - If true and 2FA is required, throws Needs2FAHeadlessError
 *   so the caller can restart in headful mode.
 */
async function performSyncAuth(
  page: Page,
  context: BrowserContext,
  isHeadless = false,
  creds: SyncCredentials = { lincoln_login_id: "", lincoln_login_pw: "" },
): Promise<void> {
  // Try saved session
  if (hasSavedSession()) {
    console.log("[sync] Attempting session restore...");
    await page
      .goto(TOP_PAGE_URL, { waitUntil: "networkidle", timeout: 15000 })
      .catch((err) => {
        console.log(`[sync] Session restore navigation failed: ${err instanceof Error ? err.message : err}`);
      });

    const title = await page.title();
    if (title.includes("トップページ") || title.includes("メニュー")) {
      console.log("[sync] Session restored");
      return;
    }
    console.log("[sync] Session expired — fresh login needed");
    clearSession();
  }

  // Fresh login using resolved credentials
  console.log("[sync] Logging in...");
  const result = await login(page, creds.lincoln_login_id, creds.lincoln_login_pw);

  if (result.needs2FA) {
    if (isHeadless) {
      throw new Needs2FAHeadlessError();
    }
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

/**
 * Scrape plan group set names from the 5050 page via popup.
 *
 * The 5050 page only shows up to 3 plan group sets as direct links.
 * For 4+ sets, we must open the "プラングループセットの保存・呼出" popup
 * which contains the full list in #cPlanGroupSetWindow_groupset_list.
 *
 * Returns: Array of { name, dataId } for each plan group set.
 */
interface PlanGroupSetInfo {
  name: string;
  dataId: string;
}

async function scrapePlanGroupSetNames(page: Page): Promise<string[]> {
  const sets = await scrapePlanGroupSetInfoFromPopup(page);
  return sets.map((s) => s.name);
}

async function scrapePlanGroupSetInfoFromPopup(page: Page): Promise<PlanGroupSetInfo[]> {
  const popupBtnSel = getSelector("stepB.planGroupSetPopupBtn");
  const popupListSel = getSelector("stepB.planGroupSetPopupList");

  // Click popup button to open the plan group set list
  const popupBtn = page.locator(popupBtnSel);
  const hasBtnVisible = await popupBtn.isVisible().catch(() => false);
  if (!hasBtnVisible) {
    console.log("[sync] Popup button not visible — falling back to direct links");
    // Fallback to direct links for facilities with <= 3 sets
    const directSel = getSelector("stepB.planGroupSetItem");
    const names = await page.$$eval(directSel, (links) =>
      links
        .map((a) => ({ name: (a.textContent || "").trim(), dataId: "" }))
        .filter((x) => x.name.length > 0),
    );
    return names;
  }

  await popupBtn.click();
  await page.waitForTimeout(500);

  // Read all items from popup list
  const items = await page.$$eval(popupListSel, (lis) =>
    lis.map((li) => ({
      name: (li.querySelector("a")?.textContent || "").trim(),
      dataId: li.getAttribute("data-id") || "",
    })).filter((x) => x.name.length > 0),
  );

  console.log(`[sync] Popup list: ${items.length} plan group sets`);

  // Close popup by clicking the button again (toggle)
  await popupBtn.click().catch(() => {});
  await page.waitForTimeout(300);

  return items;
}

export interface PlanGroupSetPlanNames {
  planGroupSetName: string;
  names: string[];
}

/**
 * Scrape plan names per plan group set from the 5050 page.
 *
 * Uses selectPlanGroupSet(data-id) JS call for each set, then reads
 * plan names from LEFT select (select#sectionGroupSelect).
 *
 * The popup provides data-id for all sets (including 4+ that aren't
 * visible as direct links). selectPlanGroupSet() fires an AJAX call
 * and populates the LEFT select with plans for that set.
 */
async function scrapePlanNamesPerSet(page: Page): Promise<PlanGroupSetPlanNames[]> {
  // Get all plan group sets with data-id from popup
  const sets = await scrapePlanGroupSetInfoFromPopup(page);

  if (sets.length === 0) return [];

  const planSelectLeft = getSelector("stepB.planGroupSelectLeft");
  const results: PlanGroupSetPlanNames[] = [];

  for (let i = 0; i < sets.length; i++) {
    const { name: setName, dataId } = sets[i];
    console.log(`[sync] Selecting plan group set [${i + 1}/${sets.length}]: ${setName} (id=${dataId})`);

    // Call selectPlanGroupSet(dataId) via JS — triggers AJAX to load plans
    await Promise.all([
      page.waitForResponse(
        (resp) => resp.url().includes("PlanGroupSetConfigSelectPlanGroupAction.do"),
        { timeout: 15000 },
      ),
      page.evaluate((id) => (window as any).selectPlanGroupSet(id), dataId),
    ]);

    await page.waitForTimeout(300);

    // Read plan names from LEFT select optgroups.
    // Optgroup label = room type (e.g. "--和室コンド--"), option text = plan name.
    // Format: "--和室コンド--|【+40%】海外ラック単泊_素泊まり"
    const planNames = await page.$$eval(
      `${planSelectLeft} optgroup`,
      (optgroups) => {
        const results: string[] = [];
        for (const og of optgroups) {
          const roomType = (og.getAttribute("label") || "").trim();
          if (!roomType) continue;

          for (const opt of og.querySelectorAll("option")) {
            const planName = (opt.textContent || "").trim();
            if (planName) {
              results.push(`${roomType}|${planName}`);
            }
          }
        }
        return results;
      },
    );

    console.log(`[sync]   → ${planNames.length} plan entries: ${planNames.slice(0, 3).join(", ")}${planNames.length > 3 ? "..." : ""}`);
    results.push({ planGroupSetName: setName, names: planNames });
  }

  return results;
}
