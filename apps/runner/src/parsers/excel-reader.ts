/**
 * TypeScript wrapper for the Python Excel parser.
 * Calls parse_excel.py as a subprocess and returns typed results.
 */

import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const PARSER_SCRIPT = resolve(
  import.meta.dirname,
  "parse_excel.py",
);

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

/** Error returned when the parser fails */
export interface ParseError {
  error: string;
  type: string;
}

/**
 * Parse an Excel file and return the rank matrix.
 * @param filePath - Absolute path to the .xlsx file
 * @param sheetName - Target sheet name (default: "横カレンダー")
 */
export async function parseExcel(
  filePath: string,
  sheetName?: string,
): Promise<ParseResult> {
  const args = [PARSER_SCRIPT, filePath];
  if (sheetName) {
    args.push("--sheet", sheetName);
  }

  console.log(`[excel-reader] python ${PARSER_SCRIPT} "${filePath}"`);

  try {
    const { stdout, stderr } = await execFileAsync("python", args, {
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024, // 50MB for large files
      shell: true, // use shell on Windows for reliable PATH resolution
    });

    if (stderr && stderr.trim()) {
      // Python parser writes errors to stderr
      let parsed: ParseError;
      try {
        parsed = JSON.parse(stderr.trim());
      } catch {
        throw new Error(`Excel parser error: ${stderr.trim()}`);
      }
      throw new Error(`${parsed.type}: ${parsed.error}`);
    }

    return JSON.parse(stdout) as ParseResult;
  } catch (err) {
    const execErr = err as Error & { code?: string | number; stderr?: string; stdout?: string };
    // Always log the full error details for debugging
    console.error(`[excel-reader] Python exec failed — code: ${execErr.code}, stderr: ${execErr.stderr || "(empty)"}`);
    if (execErr.code === "ENOENT") {
      throw new Error(
        "Python not found. Install Python 3.12+ and openpyxl.",
      );
    }
    if (execErr.stderr?.trim()) {
      // Try to parse structured error from stderr
      try {
        const parsed = JSON.parse(execErr.stderr.trim()) as ParseError;
        throw new Error(`${parsed.type}: ${parsed.error}`);
      } catch (parseErr) {
        if (parseErr instanceof SyntaxError) {
          throw new Error(`Excel parser failed: ${execErr.stderr.trim()}`);
        }
        throw parseErr;
      }
    }
    throw err;
  }
}
