/**
 * Artifact writer — saves screenshots, HTML snapshots, and text files.
 * All artifacts are stored under C:\lincolnpricereflected\data\artifacts\job-{id}\
 * Reference: docs/design.md §7.2
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "playwright";

const PROJECT_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const ARTIFACTS_BASE = resolve(PROJECT_ROOT, "data", "artifacts");

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function jobDir(jobId: string): string {
  const dir = resolve(ARTIFACTS_BASE, `job-${jobId}`);
  ensureDir(dir);
  return dir;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/** Save a full-page screenshot */
export async function saveScreenshot(
  page: Page,
  jobId: string,
  step: string,
): Promise<string> {
  const filename = `${step}_${timestamp()}.png`;
  const filepath = resolve(jobDir(jobId), filename);
  await page.screenshot({ path: filepath, fullPage: true });
  return filepath;
}

/** Save the current page HTML */
export async function saveHtml(
  page: Page,
  jobId: string,
  step: string,
): Promise<string> {
  const filename = `${step}_${timestamp()}.html`;
  const filepath = resolve(jobDir(jobId), filename);
  const html = await page.content();
  writeFileSync(filepath, html, "utf-8");
  return filepath;
}

/** Save arbitrary text content */
export function saveText(
  jobId: string,
  filename: string,
  content: string,
): string {
  const filepath = resolve(jobDir(jobId), filename);
  writeFileSync(filepath, content, "utf-8");
  return filepath;
}
