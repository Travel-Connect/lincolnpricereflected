/**
 * STEPC helper functions — output xlsx parsing and rank verification.
 *
 * Parses the Lincoln 5070 output xlsx to extract actual rank data,
 * then compares against expected ranks from Supabase.
 *
 * Output xlsx structure (per plan block = 5 rows):
 *   Row N+0: 月日 header + date values (MM/DD)
 *   Row N+1: 販売状態 (sell status)
 *   Row N+2: 販売室数 (room count)
 *   Row N+3: ランク (rank codes)
 *   Row N+4: empty separator
 *
 * Merged cells:
 *   Column A: ネット室タイプグループ (room type group)
 *   Column B: プラングループ (plan group name)
 *
 * Reference: docs/requirements.md §3.5, docs/design.md §3.8
 */

import XLSX from "xlsx";
import type { RankMap } from "./step0-helpers.js";

/** Single rank entry extracted from the output xlsx */
export interface ActualRankEntry {
  date: string; // YYYY-MM-DD
  roomType: string; // mapped input Excel room_type
  rankCode: string; // single letter rank code
}

/** Result of parsing the output xlsx */
export interface ParsedOutputXlsx {
  periodFrom: string; // YYYY-MM-DD
  periodTo: string; // YYYY-MM-DD
  entries: ActualRankEntry[];
  planBlocks: PlanBlock[];
}

/** A single plan block in the output xlsx */
interface PlanBlock {
  roomTypeGroup: string; // e.g. "和室コンド"
  planGroupName: string; // e.g. "【+40%】海外ラック単泊_素泊まり"
  mappedRoomType: string; // e.g. "和室コンド(単泊)"
  dates: string[]; // YYYY-MM-DD[]
  ranks: string[]; // rank codes parallel to dates
}

/** Verification result */
export interface VerificationResult {
  totalChecked: number;
  matchCount: number;
  mismatchCount: number;
  missingInExpected: number;
  missingInActual: number;
  mismatches: MismatchDetail[];
  summary: string;
}

export interface MismatchDetail {
  date: string;
  roomType: string;
  expected: string;
  actual: string;
}

/**
 * Room type mapping: output xlsx name → input Excel room_type.
 *
 * Key = "roomTypeGroup" from output xlsx (col A)
 * The stay type (単泊/連泊) is derived from the plan group name (col B).
 *
 * Each facility needs its own mapping config.
 * Format: { outputName: inputBaseName }
 * The final room_type = inputBaseName + "(単泊)" or "(連泊)"
 */
export interface RoomTypeMapping {
  [outputRoomTypeName: string]: string; // e.g. "和室コンド ～5名仕様～" → "和室コンド5名"
}

/** Default mapping for 畳の宿 那覇壺屋 */
export const DEFAULT_ROOM_TYPE_MAPPING: RoomTypeMapping = {
  "和室コンド": "和室コンド",
  "和室コンド ～5名仕様～": "和室コンド5名",
};

/**
 * Determine stay type from plan group name.
 * Returns "単泊" or "連泊" based on keywords in the plan name.
 */
function extractStayType(planGroupName: string): "単泊" | "連泊" {
  if (planGroupName.includes("連泊")) return "連泊";
  return "単泊"; // default to 単泊
}

/**
 * Map output xlsx room type + plan name to input Excel room_type.
 *
 * Stay type is determined by:
 *   1. stayTypeOverrides (from process_b_rows copy_source) — highest priority
 *   2. extractStayType(planGroupName) — fallback (keyword matching)
 */
function mapRoomType(
  roomTypeGroup: string,
  planGroupName: string,
  mapping: RoomTypeMapping,
  stayTypeOverrides?: Map<string, "単泊" | "連泊">,
): string {
  const baseName = mapping[roomTypeGroup];
  if (!baseName) {
    throw new Error(
      `[STEPC] Unknown room type group: "${roomTypeGroup}". ` +
        `Add it to the room type mapping.`,
    );
  }
  const stayType = stayTypeOverrides?.get(planGroupName) ?? extractStayType(planGroupName);
  return `${baseName}(${stayType})`;
}

/**
 * Parse the period header from Row 1 to extract year info.
 * Format: "出力期間:2026年02月19日～2026年04月30日"
 */
function parsePeriodHeader(header: string): {
  fromYear: number;
  fromMonth: number;
  fromDay: number;
  toYear: number;
  toMonth: number;
  toDay: number;
} {
  const match = header.match(
    /(\d{4})年(\d{2})月(\d{2})日～(\d{4})年(\d{2})月(\d{2})日/,
  );
  if (!match) {
    throw new Error(
      `[STEPC] Cannot parse period header: "${header}"`,
    );
  }
  return {
    fromYear: parseInt(match[1], 10),
    fromMonth: parseInt(match[2], 10),
    fromDay: parseInt(match[3], 10),
    toYear: parseInt(match[4], 10),
    toMonth: parseInt(match[5], 10),
    toDay: parseInt(match[6], 10),
  };
}

/**
 * Convert MM/DD date string to YYYY-MM-DD using period context.
 * The year is inferred from the period header — dates that are
 * before the fromMonth belong to the toYear (year rollover).
 */
function resolveDateWithYear(
  mmdd: string,
  fromYear: number,
  fromMonth: number,
): string {
  const parts = mmdd.split("/");
  if (parts.length !== 2) {
    throw new Error(`[STEPC] Invalid date format: "${mmdd}"`);
  }
  const month = parseInt(parts[0], 10);
  const day = parseInt(parts[1], 10);

  // If the month is less than fromMonth, it's the next year
  let year = fromYear;
  if (month < fromMonth) {
    year = fromYear + 1;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Parse the output xlsx file and extract all actual rank data.
 *
 * @param filePath - Path to the downloaded xlsx file
 * @param roomTypeMapping - Optional room type mapping override
 * @param stayTypeOverrides - Optional stay type override per plan group name
 *   (derived from process_b_rows copy_source, e.g. "カレンダーテスト" → "連泊")
 * @returns Parsed rank entries with dates and room types
 */
export function parseOutputXlsx(
  filePath: string,
  roomTypeMapping: RoomTypeMapping = DEFAULT_ROOM_TYPE_MAPPING,
  stayTypeOverrides?: Map<string, "単泊" | "連泊">,
): ParsedOutputXlsx {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Get sheet range
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  const maxRow = range.e.r + 1; // 1-indexed
  const maxCol = range.e.c + 1;

  // Helper to read cell value
  function cellVal(row: number, col: number): string {
    const addr = XLSX.utils.encode_cell({ r: row - 1, c: col - 1 });
    const cell = sheet[addr];
    return cell ? String(cell.v ?? "") : "";
  }

  // 1. Parse period header (Row 1, Col A)
  const periodHeader = cellVal(1, 1);
  const period = parsePeriodHeader(periodHeader);
  const periodFrom = `${period.fromYear}-${String(period.fromMonth).padStart(2, "0")}-${String(period.fromDay).padStart(2, "0")}`;
  const periodTo = `${period.toYear}-${String(period.toMonth).padStart(2, "0")}-${String(period.toDay).padStart(2, "0")}`;

  // 2. Handle merged cells to resolve room type groups and plan names
  // Build a resolved value map for merged cells
  const mergedRegions = sheet["!merges"] || [];
  const mergedValues: Map<string, string> = new Map();
  for (const m of mergedRegions) {
    // Get the value from the top-left cell of the merge
    const topLeftAddr = XLSX.utils.encode_cell({ r: m.s.r, c: m.s.c });
    const topLeftCell = sheet[topLeftAddr];
    const val = topLeftCell ? String(topLeftCell.v ?? "") : "";
    // Apply to all cells in the merge range
    for (let r = m.s.r; r <= m.e.r; r++) {
      for (let c = m.s.c; c <= m.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        mergedValues.set(addr, val);
      }
    }
  }

  // Helper to get value considering merges
  function resolvedVal(row: number, col: number): string {
    const addr = XLSX.utils.encode_cell({ r: row - 1, c: col - 1 });
    return mergedValues.get(addr) ?? cellVal(row, col);
  }

  // 3. Scan for plan blocks (starting from row 4)
  // Each plan block starts with a row where col C = "月日"
  const planBlocks: PlanBlock[] = [];
  const entries: ActualRankEntry[] = [];

  let row = 4; // First data row
  while (row <= maxRow) {
    const colC = cellVal(row, 3);
    if (colC !== "月日") {
      row++;
      continue;
    }

    // This is the header row of a plan block
    const roomTypeGroup = resolvedVal(row, 1); // col A (may be merged)
    const planGroupName = resolvedVal(row, 2); // col B (may be merged)

    if (!roomTypeGroup || !planGroupName) {
      row++;
      continue;
    }

    // Map to input Excel room_type
    const mappedRoomType = mapRoomType(
      roomTypeGroup,
      planGroupName,
      roomTypeMapping,
      stayTypeOverrides,
    );

    // Extract dates from col D onwards
    const dates: string[] = [];
    for (let col = 4; col <= maxCol; col++) {
      const dateVal = cellVal(row, col);
      if (!dateVal) break;
      const resolvedDate = resolveDateWithYear(
        dateVal,
        period.fromYear,
        period.fromMonth,
      );
      dates.push(resolvedDate);
    }

    // Rank row is at row + 3 (月日=row, 販売状態=row+1, 販売室数=row+2, ランク=row+3)
    const rankRow = row + 3;
    const rankLabel = cellVal(rankRow, 3);

    if (rankLabel !== "ランク") {
      console.warn(
        `[STEPC] Expected "ランク" at row ${rankRow} col C, got "${rankLabel}"`,
      );
      row++;
      continue;
    }

    // Extract rank codes
    const ranks: string[] = [];
    for (let col = 4; col < 4 + dates.length; col++) {
      const rankVal = cellVal(rankRow, col);
      ranks.push(rankVal);
    }

    // Build entries
    for (let i = 0; i < dates.length; i++) {
      if (ranks[i]) {
        entries.push({
          date: dates[i],
          roomType: mappedRoomType,
          rankCode: ranks[i],
        });
      }
    }

    planBlocks.push({
      roomTypeGroup,
      planGroupName,
      mappedRoomType,
      dates,
      ranks,
    });

    // Skip to next block (current block = 5 rows)
    row += 5;
  }

  console.log(
    `[STEPC] Parsed output xlsx: ${planBlocks.length} plan blocks, ${entries.length} rank entries`,
  );
  console.log(
    `[STEPC] Period: ${periodFrom} ～ ${periodTo}`,
  );
  for (const block of planBlocks) {
    console.log(
      `  - ${block.roomTypeGroup} / ${block.planGroupName} → ${block.mappedRoomType} (${block.dates.length} dates)`,
    );
  }

  return { periodFrom, periodTo, entries, planBlocks };
}

/**
 * Verify actual ranks against expected ranks from Supabase.
 *
 * Only checks dates within the output xlsx's period.
 * The expected ranks (from input Excel) must cover the output period.
 *
 * @param expectedRankMap - Expected ranks from Supabase (date→roomType→rankCode)
 * @param actual - Parsed output xlsx data
 * @param mappedRoomTypes - If provided, only verify these room types (from calendar_mappings)
 * @returns Verification result with match/mismatch details
 */
export function verifyRanks(
  expectedRankMap: RankMap,
  actual: ParsedOutputXlsx,
  mappedRoomTypes?: string[],
): VerificationResult {
  // Build a Set for fast lookup if mappedRoomTypes is provided
  const roomTypeFilter = mappedRoomTypes
    ? new Set(mappedRoomTypes)
    : null;

  const mismatches: MismatchDetail[] = [];
  let matchCount = 0;
  let missingInExpected = 0;
  let missingInActual = 0;
  let skippedUnmapped = 0;

  // Check each actual entry against expected
  for (const entry of actual.entries) {
    // Skip room types not in calendar mappings
    if (roomTypeFilter && !roomTypeFilter.has(entry.roomType)) {
      skippedUnmapped++;
      continue;
    }

    const dateMap = expectedRankMap.get(entry.date);
    if (!dateMap) {
      missingInExpected++;
      continue;
    }

    const expectedRank = dateMap.get(entry.roomType);
    if (!expectedRank) {
      missingInExpected++;
      continue;
    }

    if (expectedRank === entry.rankCode) {
      matchCount++;
    } else {
      mismatches.push({
        date: entry.date,
        roomType: entry.roomType,
        expected: expectedRank,
        actual: entry.rankCode,
      });
    }
  }

  // Also check for expected entries missing in actual (within period)
  for (const [date, roomMap] of expectedRankMap) {
    if (date < actual.periodFrom || date > actual.periodTo) {
      continue; // Outside output period
    }
    for (const [roomType] of roomMap) {
      // Skip room types not in calendar mappings
      if (roomTypeFilter && !roomTypeFilter.has(roomType)) {
        continue;
      }
      const found = actual.entries.some(
        (e) => e.date === date && e.roomType === roomType,
      );
      if (!found) {
        missingInActual++;
      }
    }
  }

  if (skippedUnmapped > 0) {
    console.log(`[STEPC] Skipped ${skippedUnmapped} entries for unmapped room types`);
  }

  const totalChecked = matchCount + mismatches.length;
  const mismatchCount = mismatches.length;

  // Build summary
  const lines: string[] = [
    `=== STEPC 突合検証結果 ===`,
    `期間: ${actual.periodFrom} ～ ${actual.periodTo}`,
    `プランブロック数: ${actual.planBlocks.length}`,
    ``,
    `チェック対象: ${totalChecked} エントリ`,
    `一致: ${matchCount}`,
    `不一致: ${mismatchCount}`,
    `出力に存在するが入力になし: ${missingInExpected}`,
    `入力に存在するが出力になし: ${missingInActual}`,
    ``,
  ];

  if (mismatchCount === 0 && missingInExpected === 0) {
    lines.push(`結果: ✓ 完全一致`);
  } else {
    lines.push(`結果: ✗ 不一致あり`);
  }

  if (mismatches.length > 0) {
    lines.push(``);
    lines.push(`--- 不一致詳細 ---`);
    for (const m of mismatches.slice(0, 50)) {
      lines.push(
        `  ${m.date} | ${m.roomType} | 期待: ${m.expected} → 実際: ${m.actual}`,
      );
    }
    if (mismatches.length > 50) {
      lines.push(`  ... 他 ${mismatches.length - 50} 件`);
    }
  }

  const summary = lines.join("\n");

  return {
    totalChecked,
    matchCount,
    mismatchCount,
    missingInExpected,
    missingInActual,
    mismatches,
    summary,
  };
}
