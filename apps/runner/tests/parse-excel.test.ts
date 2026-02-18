/**
 * Tests for the Excel parser (Python subprocess via TypeScript wrapper).
 *
 * Test cases:
 * - Basic parse (all ranks filled)
 * - Blank rank cells (mid-range blanks)
 * - Boundary detection (right end, down end, placeholder rows)
 * - Empty sheet (no data)
 * - Missing sheet name
 * - Full-width / lowercase rank normalization
 * - Facility name extraction from filename
 */

import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { parseExcel } from "../src/parsers/excel-reader.js";

const FIXTURES = resolve(import.meta.dirname, "fixtures");
const fix = (name: string) => resolve(FIXTURES, name);

describe("parseExcel", () => {
  it("parses basic 3×2 matrix with all ranks filled", async () => {
    const result = await parseExcel(
      fix("【テスト施設様】料金変動案_20251201.xlsx"),
    );

    expect(result.facility_name_candidate).toBe("テスト施設");
    expect(result.sheet_name).toBe("横カレンダー");
    expect(result.dates).toEqual([
      "2025-12-01",
      "2025-12-02",
      "2025-12-03",
    ]);
    expect(result.room_types).toEqual([
      "スタンダード(単泊)",
      "デラックス(連泊)",
    ]);
    expect(result.ranks).toHaveLength(6);
    expect(result.meta.filled_cells).toBe(6);
    expect(result.meta.empty_cells).toBe(0);
    expect(result.warnings).toHaveLength(0);

    // Verify specific rank entries
    expect(result.ranks[0]).toEqual({
      date: "2025-12-01",
      room_type: "スタンダード(単泊)",
      rank_code: "H",
    });
    expect(result.ranks[5]).toEqual({
      date: "2025-12-03",
      room_type: "デラックス(連泊)",
      rank_code: "E",
    });
  }, 15_000);

  it("handles blank rank cells (mid-range blanks)", async () => {
    const result = await parseExcel(
      fix("【ブランク施設様】料金変動案_20251201.xlsx"),
    );

    expect(result.facility_name_candidate).toBe("ブランク施設");
    expect(result.dates).toHaveLength(3);
    expect(result.room_types).toHaveLength(2);

    // 6 total cells, some blank
    expect(result.meta.total_cells).toBe(6);
    expect(result.meta.filled_cells).toBe(3); // H, G, K
    expect(result.meta.empty_cells).toBe(3); // D4=None, C5=None, E5=""

    // Warnings for each blank cell
    expect(result.warnings.length).toBe(3);

    // Only filled ranks should be in the array
    expect(result.ranks).toHaveLength(3);
    const rankCodes = result.ranks.map((r) => r.rank_code);
    expect(rankCodes).toContain("H");
    expect(rankCodes).toContain("G");
    expect(rankCodes).toContain("K");
  }, 15_000);

  it("detects right and down boundaries correctly", async () => {
    const result = await parseExcel(
      fix("【境界テスト様】料金変動案_20260101.xlsx"),
    );

    expect(result.facility_name_candidate).toBe("境界テスト");
    // 5 dates (C3-G3), H3 is blank → right boundary at G
    expect(result.dates).toHaveLength(5);
    expect(result.dates[0]).toBe("2026-01-01");
    expect(result.dates[4]).toBe("2026-01-05");

    // 3 room types (B4-B6), B7=0 is not valid → down boundary at row 6
    expect(result.room_types).toHaveLength(3);
    expect(result.room_types).toEqual(["タイプ1", "タイプ2", "タイプ3"]);

    // 5 × 3 = 15 rank cells, all filled
    expect(result.meta.total_cells).toBe(15);
    expect(result.meta.filled_cells).toBe(15);
    expect(result.meta.down_boundary).toBe(6);
  }, 15_000);

  it("throws on empty sheet (no dates)", async () => {
    await expect(
      parseExcel(fix("【空施設様】料金変動案_20260101.xlsx")),
    ).rejects.toThrow(/No dates found/);
  }, 15_000);

  it("throws when sheet name does not exist", async () => {
    await expect(
      parseExcel(fix("【シートなし様】料金変動案_20260101.xlsx")),
    ).rejects.toThrow(/not found/);
  }, 15_000);

  it("normalizes full-width and lowercase rank codes", async () => {
    const result = await parseExcel(
      fix("【全角テスト様】料金変動案_20260101.xlsx"),
    );

    expect(result.ranks).toHaveLength(2);
    // Ａ → A, ｂ → B
    expect(result.ranks[0].rank_code).toBe("A");
    expect(result.ranks[1].rank_code).toBe("B");
  }, 15_000);

  it("extracts facility name from filename pattern", async () => {
    const result = await parseExcel(
      fix("【テスト施設様】料金変動案_20251201.xlsx"),
    );
    expect(result.facility_name_candidate).toBe("テスト施設");
  }, 15_000);

  it("parses the actual production Excel file", async () => {
    const prodFile = resolve(
      import.meta.dirname,
      "..",
      "..",
      "..",
      "docs",
      "【プールヴィラ古宇利島様】料金変動案_20251118.xlsx",
    );

    const result = await parseExcel(prodFile);

    expect(result.facility_name_candidate).toBe("プールヴィラ古宇利島");
    expect(result.dates.length).toBeGreaterThan(100);
    expect(result.room_types.length).toBe(4);
    expect(result.ranks.length).toBeGreaterThan(500);

    // All rank codes should be single uppercase letters
    for (const r of result.ranks) {
      expect(r.rank_code).toMatch(/^[A-Z]$/);
    }
  }, 30_000);
});
