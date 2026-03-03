/**
 * STEP0 helper functions — data loading and DOM manipulation.
 *
 * Keeps step0.ts focused on orchestration while this module handles
 * Supabase queries and the browser-side DOM updates.
 *
 * DOM structure (from actual Lincoln 6800 detail page):
 *   - Active cell: <a class="calendarTableBtn c_rank_X" style="...">
 *       <span class="calendar_table_day">18</span>
 *       <span class="calendarTableRank">[X]</span>
 *       <input name="inputTargetDate" value="20260218">
 *       <input name="inputPriceRankCd" value="X">
 *       <input name="defaultInputPriceRankCd" value="X">
 *       <input name="inputPriceRankNm" value="[X]">
 *       <input name="inputSalesStopSetFlg" value="">
 *       <input name="inputRankStyleText" value="...">
 *     </a>
 *   - Rank palette: <a class="rankBtn c_rank_A_btn" data-id="A" data-class="c_rank_A" style="...">
 *
 * Reference: docs/design.md §3.6
 */

import { getSupabase } from "../supabase-client.js";

/** date → roomType → rankCode */
export type RankMap = Map<string, Map<string, string>>;

export interface LoadedRanks {
  rankMap: RankMap;
  maxDate: string; // YYYY-MM-DD
}

/**
 * Load expected ranks from Supabase and build a lookup map.
 *
 * @param jobId - Job UUID
 * @returns rankMap grouped by date→roomType→rankCode, plus the max date
 */
export async function loadExpectedRanks(
  jobId: string,
): Promise<LoadedRanks> {
  // Supabase PostgREST has a max_rows limit (typically 1000).
  // Paginate to fetch all rows.
  const PAGE_SIZE = 1000;
  const allRows: { date: string; room_type: string; rank_code: string }[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await getSupabase()
      .from("job_expected_ranks")
      .select("date, room_type, rank_code")
      .eq("job_id", jobId)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(
        `Failed to load expected ranks: ${error.message}`,
      );
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const row of data) {
      allRows.push(row as { date: string; room_type: string; rank_code: string });
    }

    if (data.length < PAGE_SIZE) {
      break; // Last page
    }
    offset += PAGE_SIZE;
  }

  if (allRows.length === 0) {
    throw new Error(
      `[STEP0] No expected ranks found for job ${jobId}. Was PARSE completed?`,
    );
  }

  const rankMap: RankMap = new Map();
  let maxDate = "";

  for (const row of allRows) {
    if (!rankMap.has(row.date)) {
      rankMap.set(row.date, new Map());
    }
    rankMap.get(row.date)!.set(row.room_type, row.rank_code);

    if (row.date > maxDate) {
      maxDate = row.date;
    }
  }

  console.log(
    `[STEP0] Loaded ${allRows.length} expected ranks (${rankMap.size} dates, max: ${maxDate})`,
  );

  return { rankMap, maxDate };
}

/**
 * Load the month range (YYYYMM) from expected ranks for a job.
 * Returns sorted unique months as "YYYYMM" strings.
 */
export async function loadMonthRange(jobId: string): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from("job_expected_ranks")
    .select("date")
    .eq("job_id", jobId)
    .order("date", { ascending: true })
    .limit(1);

  if (error) throw new Error(`Failed to load month range: ${error.message}`);

  const { data: dataMax, error: errorMax } = await getSupabase()
    .from("job_expected_ranks")
    .select("date")
    .eq("job_id", jobId)
    .order("date", { ascending: false })
    .limit(1);

  if (errorMax) throw new Error(`Failed to load month range: ${errorMax.message}`);

  if (!data?.length || !dataMax?.length) {
    throw new Error(`No expected ranks found for job ${jobId}`);
  }

  const minDate = (data[0] as { date: string }).date; // "YYYY-MM-DD"
  const maxDate = (dataMax[0] as { date: string }).date;

  const months: string[] = [];
  const [startYear, startMonth] = minDate.split("-").map(Number);
  const [endYear, endMonth] = maxDate.split("-").map(Number);

  let y = startYear;
  let m = startMonth;
  while (y < endYear || (y === endYear && m <= endMonth)) {
    months.push(`${y}${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }

  return months;
}

/**
 * Convert RankMap to a plain object for passing into page.evaluate().
 */
export function rankMapToObject(
  rankMap: RankMap,
): Record<string, Record<string, string>> {
  const obj: Record<string, Record<string, string>> = {};
  for (const [date, roomMap] of rankMap) {
    obj[date] = {};
    for (const [roomType, rankCode] of roomMap) {
      obj[date][roomType] = rankCode;
    }
  }
  return obj;
}

/**
 * Flatten RankMap to date → rankCode (picking first room type's rank).
 * Used because the 6800 calendar is day-level, not room-type-level.
 */
export function rankMapToDateRank(
  rankMap: RankMap,
): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const [date, roomMap] of rankMap) {
    const firstRank = roomMap.values().next().value;
    if (firstRank) {
      obj[date] = firstRank;
    }
  }
  return obj;
}

/**
 * Flatten RankMap to date → rankCode, filtered by specific room types.
 * Used when calendar_mappings specify which room types map to each calendar.
 */
export function rankMapToDateRankForRoomTypes(
  rankMap: RankMap,
  roomTypes: string[],
): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const [date, roomMap] of rankMap) {
    for (const rt of roomTypes) {
      const rank = roomMap.get(rt);
      if (rank) {
        obj[date] = rank;
        break; // first match wins
      }
    }
  }
  return obj;
}

/**
 * Selectors needed inside page.evaluate() for DOM manipulation.
 */
export interface DomSelectors {
  rankAnchor: string;
  rankText: string;
  inputPriceRankCd: string;
  defaultInputPriceRankCd: string;
  inputPriceRankNm: string;
  inputRankStyleText: string;
}

/**
 * Collect rank styles from the rank palette buttons.
 * Returns a map of rankCode → inline CSS string.
 *
 * Must be called via page.evaluate(collectRankStyles, selector).
 *
 * Palette buttons: <a class="rankBtn" data-id="A" style="background-color:...">
 */
export function collectRankStyles(
  rankPaletteBtnSelector: string,
): Record<string, string> {
  const styleMap: Record<string, string> = {};
  document.querySelectorAll(rankPaletteBtnSelector).forEach((btn) => {
    const rankId = btn.getAttribute("data-id");
    if (rankId) {
      styleMap[rankId] = btn.getAttribute("style") || "";
    }
  });
  return styleMap;
}

/** Arguments bundled for page.evaluate (single-arg constraint). */
export interface UpdateCalendarArgs {
  dateRanks: Record<string, string>;
  styleMap: Record<string, string>;
  sel: DomSelectors;
}

/**
 * Update calendar cells in the DOM.
 * Called via page.evaluate(updateCalendarCells, { dateRanks, styleMap, sel }).
 *
 * Each active calendar cell is an <a class="calendarTableBtn"> containing:
 *   - input[name="inputTargetDate"] with value "YYYYMMDD"
 *   - input[name="inputPriceRankCd"] with the rank code
 *   - span.calendarTableRank with the rank display text
 *   - etc.
 *
 * Returns { updated, skipped, notFound }.
 */
export function updateCalendarCells(
  args: UpdateCalendarArgs,
): { updated: number; skipped: number; notFound: string[] } {
  const { dateRanks, styleMap, sel } = args;
  let updated = 0;
  let skipped = 0;
  const notFound: string[] = [];

  // Find all active calendar cells (a.calendarTableBtn)
  const anchors = document.querySelectorAll(sel.rankAnchor);

  anchors.forEach((anchor) => {
    // Get date from inputTargetDate hidden input
    const dateInput = anchor.querySelector(
      'input[name="inputTargetDate"]',
    ) as HTMLInputElement | null;
    if (!dateInput) return;

    const dateVal = dateInput.value; // "20260218"
    if (!dateVal || dateVal.length !== 8) return;

    // Convert "20260218" → "2026-02-18"
    const dateKey = `${dateVal.substring(0, 4)}-${dateVal.substring(4, 6)}-${dateVal.substring(6, 8)}`;

    // Look up expected rank for this date
    const newRank = dateRanks[dateKey];
    if (!newRank) {
      skipped++;
      return;
    }

    // Get style for the new rank
    const css = styleMap[newRank] || "";
    if (!css) {
      notFound.push(`${newRank}@${dateKey}`);
    }

    // Update rank text
    const rankTextEl = anchor.querySelector(sel.rankText);
    if (rankTextEl) {
      rankTextEl.textContent = `[${newRank}]`;
    }

    // Update anchor class: remove old c_rank_*, add new
    const oldClass = anchor.className.match(/c_rank_[A-Za-z0-9_]+/);
    if (oldClass) {
      anchor.classList.remove(oldClass[0]);
    }
    anchor.classList.add(`c_rank_${newRank}`);
    if (css) {
      anchor.setAttribute("style", css);
    }

    // Update hidden inputs
    const inputRankCd = anchor.querySelector(
      sel.inputPriceRankCd,
    ) as HTMLInputElement | null;
    const inputDefaultRankCd = anchor.querySelector(
      sel.defaultInputPriceRankCd,
    ) as HTMLInputElement | null;
    const inputRankNm = anchor.querySelector(
      sel.inputPriceRankNm,
    ) as HTMLInputElement | null;
    const inputStyleText = anchor.querySelector(
      sel.inputRankStyleText,
    ) as HTMLInputElement | null;
    const inputSalesStop = anchor.querySelector(
      'input[name="inputSalesStopSetFlg"]',
    ) as HTMLInputElement | null;

    if (inputRankCd) inputRankCd.value = newRank;
    // NOTE: defaultInputPriceRankCd must keep its original value.
    // Lincoln's doUpdate() compares inputPriceRankCd vs defaultInputPriceRankCd
    // to detect changes — if they match, it skips the cell as "no change".
    if (inputRankNm) inputRankNm.value = `[${newRank}]`;
    if (inputStyleText) inputStyleText.value = css;
    if (inputSalesStop) inputSalesStop.value = "";

    updated++;
  });

  return { updated, skipped, notFound };
}
