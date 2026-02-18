/**
 * Tests for selectors.ts — TBD guard and normal retrieval.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getSelector, clearSelectorCache } from "../src/selectors.js";
import { SelectorTBDError, SelectorNotFoundError } from "../src/errors.js";

beforeEach(() => {
  clearSelectorCache();
});

describe("getSelector", () => {
  it("returns a defined selector value", () => {
    // stepA.facilityIdText is "dl.g_header_id dd" (not TBD)
    const value = getSelector("stepA.facilityIdText");
    expect(value).toBe("dl.g_header_id dd");
  });

  it("returns a nested selector value", () => {
    const value = getSelector("stepB.copyButton");
    expect(value).toBe('a[onclick="doCopy()"]');
  });

  it("throws SelectorTBDError for TBD values", () => {
    expect(() => getSelector("auth.loginIdInput")).toThrow(SelectorTBDError);
  });

  it("throws SelectorNotFoundError for missing paths", () => {
    expect(() => getSelector("nonexistent.path")).toThrow(
      SelectorNotFoundError,
    );
  });

  it("throws SelectorNotFoundError for partial paths pointing to objects", () => {
    // "auth" is an object, not a string
    expect(() => getSelector("auth")).toThrow(SelectorNotFoundError);
  });
});
