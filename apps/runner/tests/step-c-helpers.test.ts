/**
 * Tests for step-c-helpers: output xlsx parsing and rank verification.
 *
 * Uses the actual downloaded xlsx from a previous STEPC run.
 */

import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import {
  parseOutputXlsx,
  verifyRanks,
  DEFAULT_ROOM_TYPE_MAPPING,
} from "../src/steps/step-c-helpers.js";
import type { RankMap } from "../src/steps/step0-helpers.js";

const SAMPLE_XLSX = resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "data",
  "artifacts",
  "job-acbdea10-4602-4298-8a92-8770f0d961e4",
  "PriceData_202602191627.xlsx",
);

const hasSample = existsSync(SAMPLE_XLSX);

describe.skipIf(!hasSample)("parseOutputXlsx", () => {
  it("should parse all 4 plan blocks", () => {
    const result = parseOutputXlsx(SAMPLE_XLSX);
    expect(result.planBlocks).toHaveLength(4);
  });

  it("should parse period from header", () => {
    const result = parseOutputXlsx(SAMPLE_XLSX);
    expect(result.periodFrom).toBe("2026-02-19");
    expect(result.periodTo).toBe("2026-04-30");
  });

  it("should map room types correctly", () => {
    const result = parseOutputXlsx(SAMPLE_XLSX);
    const roomTypes = result.planBlocks.map((b) => b.mappedRoomType);
    expect(roomTypes).toEqual([
      "和室コンド(単泊)",
      "和室コンド(連泊)",
      "和室コンド5名(単泊)",
      "和室コンド5名(連泊)",
    ]);
  });

  it("should extract correct date count (71 days: 02/19 ~ 04/30)", () => {
    const result = parseOutputXlsx(SAMPLE_XLSX);
    for (const block of result.planBlocks) {
      expect(block.dates).toHaveLength(71);
      expect(block.dates[0]).toBe("2026-02-19");
      expect(block.dates[block.dates.length - 1]).toBe("2026-04-30");
    }
  });

  it("should extract rank codes as single letters", () => {
    const result = parseOutputXlsx(SAMPLE_XLSX);
    for (const block of result.planBlocks) {
      expect(block.ranks).toHaveLength(71);
      for (const rank of block.ranks) {
        expect(rank).toMatch(/^[A-Z]$/);
      }
    }
  });

  it("should produce total entries = 4 blocks x 71 dates = 284", () => {
    const result = parseOutputXlsx(SAMPLE_XLSX);
    expect(result.entries).toHaveLength(284);
  });

  it("should have correct first few rank codes for block 1", () => {
    const result = parseOutputXlsx(SAMPLE_XLSX);
    const block1 = result.planBlocks[0];
    // From the xlsx data: R, W, Y, U, T, U, T, T, Q, W, S, ...
    expect(block1.ranks.slice(0, 10)).toEqual([
      "R", "W", "Y", "U", "T", "U", "T", "T", "Q", "W",
    ]);
  });
});

describe("verifyRanks", () => {
  it("should return perfect match when expected equals actual", () => {
    const rankMap: RankMap = new Map([
      [
        "2026-02-19",
        new Map([
          ["和室コンド(単泊)", "R"],
          ["和室コンド(連泊)", "R"],
        ]),
      ],
      [
        "2026-02-20",
        new Map([
          ["和室コンド(単泊)", "W"],
          ["和室コンド(連泊)", "W"],
        ]),
      ],
    ]);

    const actual = {
      periodFrom: "2026-02-19",
      periodTo: "2026-02-20",
      entries: [
        { date: "2026-02-19", roomType: "和室コンド(単泊)", rankCode: "R" },
        { date: "2026-02-19", roomType: "和室コンド(連泊)", rankCode: "R" },
        { date: "2026-02-20", roomType: "和室コンド(単泊)", rankCode: "W" },
        { date: "2026-02-20", roomType: "和室コンド(連泊)", rankCode: "W" },
      ],
      planBlocks: [],
    };

    const result = verifyRanks(rankMap, actual);
    expect(result.matchCount).toBe(4);
    expect(result.mismatchCount).toBe(0);
    expect(result.missingInExpected).toBe(0);
    expect(result.summary).toContain("完全一致");
  });

  it("should detect mismatches", () => {
    const rankMap: RankMap = new Map([
      [
        "2026-02-19",
        new Map([
          ["和室コンド(単泊)", "R"],
          ["和室コンド(連泊)", "S"], // mismatch: expected S, actual R
        ]),
      ],
    ]);

    const actual = {
      periodFrom: "2026-02-19",
      periodTo: "2026-02-19",
      entries: [
        { date: "2026-02-19", roomType: "和室コンド(単泊)", rankCode: "R" },
        { date: "2026-02-19", roomType: "和室コンド(連泊)", rankCode: "R" },
      ],
      planBlocks: [],
    };

    const result = verifyRanks(rankMap, actual);
    expect(result.matchCount).toBe(1);
    expect(result.mismatchCount).toBe(1);
    expect(result.mismatches[0]).toEqual({
      date: "2026-02-19",
      roomType: "和室コンド(連泊)",
      expected: "S",
      actual: "R",
    });
    expect(result.summary).toContain("不一致あり");
  });

  it("should count missing entries in expected", () => {
    const rankMap: RankMap = new Map(); // empty

    const actual = {
      periodFrom: "2026-02-19",
      periodTo: "2026-02-19",
      entries: [
        { date: "2026-02-19", roomType: "和室コンド(単泊)", rankCode: "R" },
      ],
      planBlocks: [],
    };

    const result = verifyRanks(rankMap, actual);
    expect(result.missingInExpected).toBe(1);
    expect(result.matchCount).toBe(0);
  });
});
