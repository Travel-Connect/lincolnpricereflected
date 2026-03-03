/**
 * Excel parser — reads 横カレンダー sheet and extracts rank matrix.
 * Uses SheetJS (xlsx) directly — no Python subprocess needed.
 *
 * Equivalent to parse_excel.py but runs in-process.
 */

import XLSX from "xlsx";
import { basename } from "node:path";

/** A single rank entry from the parsed Excel */
export interface RankEntry {
  date: string;
  room_type: string;
  rank_code: string;
}

/** Full result from the Excel parser */
export interface ParseResult {
  facility_name_candidate: string | null;
  sheet_name: string;
  dates: string[];
  room_types: string[];
  ranks: RankEntry[];
  warnings: string[];
  meta: {
    total_cells: number;
    filled_cells: number;
    empty_cells: number;
    right_boundary: string;
    down_boundary: number;
  };
}

// ---------------------------------------------------------------------------
// Constants (matching parse_excel.py)
// ---------------------------------------------------------------------------
const DEFAULT_SHEET_NAME = "横カレンダー";
const DATE_ROW = 3; // 1-indexed row where dates are
const ROOM_TYPE_COL = 2; // 1-indexed column B for room type names
const DATA_START_ROW = 4; // 1-indexed row where data starts
const DATA_START_COL = 3; // 1-indexed column C where data starts

const FACILITY_NAME_RE = /【(.+?)様】/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract facility name candidate from filename */
function extractFacilityName(filename: string): string | null {
  const m = FACILITY_NAME_RE.exec(filename);
  return m ? m[1] : null;
}

/**
 * Normalize a cell value to a rank code string.
 * - null / empty → null
 * - string → trim + fullwidth→halfwidth + uppercase
 */
function normalizeRank(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;

  let result = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0xff21 && cp <= 0xff3a) {
      // Ａ-Ｚ → A-Z
      result += String.fromCodePoint(cp - 0xff21 + 0x41);
    } else if (cp >= 0xff41 && cp <= 0xff5a) {
      // ａ-ｚ → A-Z
      result += String.fromCodePoint(cp - 0xff41 + 0x41);
    } else if (cp >= 0xff10 && cp <= 0xff19) {
      // ０-９ → 0-9
      result += String.fromCodePoint(cp - 0xff10 + 0x30);
    } else {
      result += ch;
    }
  }
  return result.toUpperCase();
}

/**
 * Format a cell value as YYYY-MM-DD.
 * SheetJS returns dates as JS Date objects (when cellDates is true)
 * or as serial numbers.
 */
function formatDate(value: unknown): string | null {
  if (value == null) return null;

  // JS Date object
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Number (Excel serial date)
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (date && date.y > 2000) {
      const y = date.y;
      const m = String(date.m).padStart(2, "0");
      const d = String(date.d).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    return null;
  }

  const s = String(value).trim();
  if (!s) return null;

  // Try common date formats
  for (const re of [
    /^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})$/, // YYYY/M/D or YYYY-M-D
    /^(\d{4})年(\d{1,2})月(\d{1,2})日$/, // YYYY年M月D日
  ]) {
    const match = re.exec(s);
    if (match) {
      const y = match[1];
      const m = match[2].padStart(2, "0");
      const d = match[3].padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }
  return null;
}

/** Check if a value is a valid room type name */
function isValidRoomType(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "number") return false;
  return String(value).trim().length > 0;
}

/** Convert 1-indexed column number to Excel column letter (1→A, 2→B, ...) */
function colLetter(col: number): string {
  return XLSX.utils.encode_col(col - 1); // encode_col is 0-indexed
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parse an Excel file and return the rank matrix.
 * @param filePath - Absolute path to the .xlsx file
 * @param sheetName - Target sheet name (default: "横カレンダー")
 */
export async function parseExcel(
  filePath: string,
  sheetName: string = DEFAULT_SHEET_NAME,
): Promise<ParseResult> {
  console.log(`[excel-reader] Parsing: ${filePath} (sheet: ${sheetName})`);

  const wb = XLSX.readFile(filePath, { cellDates: true });

  if (!wb.SheetNames.includes(sheetName)) {
    throw new Error(
      `Sheet "${sheetName}" not found. Available: ${wb.SheetNames.join(", ")}`,
    );
  }

  const ws = wb.Sheets[sheetName];
  const warnings: string[] = [];

  // Facility name from filename
  const facilityName = extractFacilityName(basename(filePath));

  // --- Right boundary: scan date row ---
  const dates: string[] = [];
  let col = DATA_START_COL;
  while (true) {
    const cell = ws[XLSX.utils.encode_cell({ r: DATE_ROW - 1, c: col - 1 })];
    const d = formatDate(cell?.v);
    if (d == null) break;
    dates.push(d);
    col++;
  }
  const rightCol = col - 1;

  if (dates.length === 0) {
    throw new Error(
      `No dates found in row ${DATE_ROW} starting from ${colLetter(DATA_START_COL)}${DATE_ROW}`,
    );
  }

  // --- Bottom boundary: scan room type column ---
  const roomTypes: string[] = [];
  let row = DATA_START_ROW;
  while (true) {
    const cell =
      ws[XLSX.utils.encode_cell({ r: row - 1, c: ROOM_TYPE_COL - 1 })];
    if (!isValidRoomType(cell?.v)) break;
    roomTypes.push(String(cell!.v).trim());
    row++;
  }
  const bottomRow = row - 1;

  if (roomTypes.length === 0) {
    throw new Error(
      `No room types found in column ${colLetter(ROOM_TYPE_COL)} starting from row ${DATA_START_ROW}`,
    );
  }

  // --- Extract rank data ---
  const ranks: RankEntry[] = [];
  let filled = 0;
  let empty = 0;

  for (let ri = 0; ri < roomTypes.length; ri++) {
    const dataRow = DATA_START_ROW + ri;
    for (let ci = 0; ci < dates.length; ci++) {
      const dataCol = DATA_START_COL + ci;
      const cell =
        ws[XLSX.utils.encode_cell({ r: dataRow - 1, c: dataCol - 1 })];
      const rank = normalizeRank(cell?.v);

      if (rank == null) {
        empty++;
        const cellRef = `${colLetter(dataCol)}${dataRow}`;
        warnings.push(
          `${cellRef} is blank — no rank for ${roomTypes[ri]} on ${dates[ci]}`,
        );
      } else {
        filled++;
        ranks.push({
          date: dates[ci],
          room_type: roomTypes[ri],
          rank_code: rank,
        });
      }
    }
  }

  console.log(
    `[excel-reader] Parsed: ${dates.length} dates, ${roomTypes.length} room types, ${filled} filled, ${empty} empty`,
  );

  return {
    facility_name_candidate: facilityName,
    sheet_name: sheetName,
    dates,
    room_types: roomTypes,
    ranks,
    warnings,
    meta: {
      total_cells: filled + empty,
      filled_cells: filled,
      empty_cells: empty,
      right_boundary: colLetter(rightCol),
      down_boundary: bottomRow,
    },
  };
}
