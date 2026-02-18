/**
 * Browser session persistence — saves/loads cookies and storage
 * to avoid 2FA on subsequent runs.
 *
 * Storage state file: data/artifacts/lincoln-session.json
 */

import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { BrowserContext } from "playwright";

const PROJECT_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");
const ARTIFACTS_DIR = resolve(PROJECT_ROOT, "data", "artifacts");
const SESSION_FILE = resolve(ARTIFACTS_DIR, "lincoln-session.json");

/** Get the path to the session state file */
export function getSessionPath(): string {
  return SESSION_FILE;
}

/** Check if a saved session exists */
export function hasSavedSession(): boolean {
  return existsSync(SESSION_FILE);
}

/** Save browser context state (cookies + localStorage) after login */
export async function saveSession(context: BrowserContext): Promise<void> {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await context.storageState({ path: SESSION_FILE });
  console.log(`[auth] Session saved: ${SESSION_FILE}`);
}

/** Clear saved session (e.g., on auth failure) */
export function clearSession(): void {
  const { unlinkSync } = require("node:fs");
  try {
    unlinkSync(SESSION_FILE);
    console.log("[auth] Session cleared");
  } catch {
    // File didn't exist — fine
  }
}
