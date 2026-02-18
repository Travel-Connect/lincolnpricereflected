/**
 * Selector loader with TBD guard.
 * Reads config/selectors.json and provides type-safe access.
 * Reference: docs/design.md §3.2
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SelectorNotFoundError, SelectorTBDError } from "./errors.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const SELECTORS_PATH = resolve(PROJECT_ROOT, "config", "selectors.json");

type SelectorMap = Record<string, unknown>;

let cache: SelectorMap | null = null;

/** Load selectors.json (cached after first call) */
export function loadSelectors(): SelectorMap {
  if (cache) return cache;
  const raw = readFileSync(SELECTORS_PATH, "utf-8");
  cache = JSON.parse(raw) as SelectorMap;
  return cache;
}

/** Clear cached selectors (useful for tests) */
export function clearSelectorCache(): void {
  cache = null;
}

/**
 * Get a selector value by dot-separated path.
 * @example getSelector("stepB.copyButton") // => "a[onclick=\"doCopy()\"]"
 * @throws SelectorNotFoundError if path does not exist
 * @throws SelectorTBDError if value is "TBD"
 */
export function getSelector(path: string): string {
  const selectors = loadSelectors();
  const parts = path.split(".");
  let current: unknown = selectors;

  for (const part of parts) {
    if (current == null || typeof current !== "object") {
      throw new SelectorNotFoundError(path);
    }
    current = (current as Record<string, unknown>)[part];
  }

  if (current === undefined || current === null) {
    throw new SelectorNotFoundError(path);
  }

  if (typeof current !== "string") {
    throw new SelectorNotFoundError(path);
  }

  if (current === "TBD") {
    throw new SelectorTBDError(path);
  }

  return current;
}
