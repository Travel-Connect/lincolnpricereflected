/**
 * Client-side Excel parser — extracts room type names from 横カレンダー sheet.
 *
 * Excel structure:
 *   Row 3: dates (C3, D3, E3, ...)
 *   Col B: room type names starting at row 4
 *   Terminator: empty cell or numeric value (e.g. 0) in col B
 */
import { read, utils } from "xlsx";

const DEFAULT_SHEET_NAME = "横カレンダー";
const ROOM_TYPE_COL = 1; // 0-indexed: column B = index 1

/**
 * Parse an Excel file and extract room type names from 横カレンダー sheet.
 */
export async function extractRoomTypes(file: File): Promise<string[]> {
  const buffer = await file.arrayBuffer();
  const workbook = read(buffer, { type: "array" });

  // Find the sheet
  const sheetName =
    workbook.SheetNames.find((n) => n.includes("横カレンダー")) ??
    workbook.SheetNames.find((n) => n.includes("カレンダー")) ??
    workbook.SheetNames[0];

  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];

  // Convert to 2D array
  const rows: unknown[][] = utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
  });

  // Room types start at row index 3 (row 4 in 1-indexed), column B (index 1)
  const roomTypes: string[] = [];
  for (let i = 3; i < rows.length; i++) {
    const cell = rows[i]?.[ROOM_TYPE_COL];
    if (cell === null || cell === undefined) break;
    if (typeof cell === "number") break; // terminator (e.g. 0)
    const name = String(cell).trim();
    if (name.length === 0) break;
    roomTypes.push(name);
  }

  return roomTypes;
}

/**
 * Extract facility name from Excel filename.
 * Pattern: 【施設名様】料金変動案_...xlsx → "施設名"
 */
export function extractFacilityName(filename: string): string | null {
  const match = filename.match(/【(.+?)様】/);
  if (!match) return null;
  // Remove spaces for matching (e.g. "畳の宿 那覇壺屋" vs "畳の宿那覇壺屋")
  return match[1].trim();
}
