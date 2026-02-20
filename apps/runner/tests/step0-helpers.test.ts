/**
 * Tests for step0-helpers.ts — rank loading and DOM manipulation functions.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock getSupabase — chain: .from().select().eq().range()
const mockRange = vi.fn();
const mockEq = vi.fn(() => ({ range: mockRange }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("../src/supabase-client.js", () => ({
  getSupabase: () => ({ from: mockFrom }),
}));

import {
  loadExpectedRanks,
  rankMapToObject,
  rankMapToDateRank,
  collectRankStyles,
  updateCalendarCells,
  type DomSelectors,
} from "../src/steps/step0-helpers.js";

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReturnValue({ select: mockSelect });
  mockSelect.mockReturnValue({ eq: mockEq });
  mockEq.mockReturnValue({ range: mockRange });
});

// ─── loadExpectedRanks ──────────────────────────────────────────

describe("loadExpectedRanks", () => {
  it("loads ranks and builds map with maxDate", async () => {
    // First page returns data, second page returns empty (end of pagination)
    mockRange
      .mockResolvedValueOnce({
        data: [
          { date: "2026-03-01", room_type: "シングル", rank_code: "A" },
          { date: "2026-03-01", room_type: "ダブル", rank_code: "B" },
          { date: "2026-03-15", room_type: "シングル", rank_code: "C" },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [],
        error: null,
      });

    const result = await loadExpectedRanks("job-001");

    expect(result.maxDate).toBe("2026-03-15");
    expect(result.rankMap.size).toBe(2); // 2 dates
    expect(result.rankMap.get("2026-03-01")!.get("シングル")).toBe("A");
    expect(result.rankMap.get("2026-03-01")!.get("ダブル")).toBe("B");
    expect(result.rankMap.get("2026-03-15")!.get("シングル")).toBe("C");

    expect(mockFrom).toHaveBeenCalledWith("job_expected_ranks");
    expect(mockEq).toHaveBeenCalledWith("job_id", "job-001");
    expect(mockRange).toHaveBeenCalledWith(0, 999);
  });

  it("throws when no ranks found", async () => {
    mockRange.mockResolvedValue({ data: [], error: null });

    await expect(loadExpectedRanks("job-empty")).rejects.toThrow(
      "No expected ranks found",
    );
  });

  it("throws on Supabase error", async () => {
    mockRange.mockResolvedValue({
      data: null,
      error: { message: "connection error" },
    });

    await expect(loadExpectedRanks("job-err")).rejects.toThrow(
      "connection error",
    );
  });

  it("paginates when data exceeds page size", async () => {
    // Create 1000 rows for first page (full page = triggers second fetch)
    const page1 = Array.from({ length: 1000 }, (_, i) => ({
      date: `2026-03-${String((i % 28) + 1).padStart(2, "0")}`,
      room_type: `room${i}`,
      rank_code: "A",
    }));
    const page2 = [
      { date: "2026-04-01", room_type: "extra", rank_code: "B" },
    ];

    mockRange
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockResolvedValueOnce({ data: page2, error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    const result = await loadExpectedRanks("job-paginated");

    expect(result.maxDate).toBe("2026-04-01");
    expect(mockRange).toHaveBeenCalledWith(0, 999);
    expect(mockRange).toHaveBeenCalledWith(1000, 1999);
  });
});

// ─── rankMapToObject ────────────────────────────────────────────

describe("rankMapToObject", () => {
  it("converts RankMap to plain object", () => {
    const rankMap = new Map([
      [
        "2026-03-01",
        new Map([
          ["シングル", "A"],
          ["ダブル", "B"],
        ]),
      ],
      ["2026-03-02", new Map([["シングル", "C"]])],
    ]);

    const obj = rankMapToObject(rankMap);

    expect(obj).toEqual({
      "2026-03-01": { シングル: "A", ダブル: "B" },
      "2026-03-02": { シングル: "C" },
    });
  });
});

// ─── rankMapToDateRank ──────────────────────────────────────────

describe("rankMapToDateRank", () => {
  it("flattens to date → rankCode (first room type)", () => {
    const rankMap = new Map([
      [
        "2026-03-01",
        new Map([
          ["シングル", "A"],
          ["ダブル", "B"],
        ]),
      ],
      ["2026-03-02", new Map([["ツイン", "C"]])],
    ]);

    const result = rankMapToDateRank(rankMap);

    expect(result).toEqual({
      "2026-03-01": "A",
      "2026-03-02": "C",
    });
  });
});

// ─── collectRankStyles ──────────────────────────────────────────

describe("collectRankStyles", () => {
  it("extracts rank styles from palette buttons via data-id", () => {
    const mockBtns = [
      {
        getAttribute: (attr: string) =>
          attr === "data-id"
            ? "A"
            : "background-color:#B0C4DE !important;color:#000000 !important;",
      },
      {
        getAttribute: (attr: string) =>
          attr === "data-id"
            ? "B"
            : "background-color:#FFDAE0 !important;color:#000000 !important;",
      },
    ];

    const origDoc = globalThis.document;
    (globalThis as Record<string, unknown>).document = {
      querySelectorAll: () => ({
        forEach: (cb: (el: unknown) => void) => mockBtns.forEach(cb),
      }),
    };

    try {
      const result = collectRankStyles("a.rankBtn");
      expect(result).toEqual({
        A: "background-color:#B0C4DE !important;color:#000000 !important;",
        B: "background-color:#FFDAE0 !important;color:#000000 !important;",
      });
    } finally {
      if (origDoc) {
        (globalThis as Record<string, unknown>).document = origDoc;
      } else {
        delete (globalThis as Record<string, unknown>).document;
      }
    }
  });
});

// ─── updateCalendarCells ────────────────────────────────────────

describe("updateCalendarCells", () => {
  const sel: DomSelectors = {
    rankAnchor: "a.calendarTableBtn",
    rankText: ".calendarTableRank",
    inputPriceRankCd: 'input[name="inputPriceRankCd"]',
    defaultInputPriceRankCd: 'input[name="defaultInputPriceRankCd"]',
    inputPriceRankNm: 'input[name="inputPriceRankNm"]',
    inputRankStyleText: 'input[name="inputRankStyleText"]',
  };

  it("returns zero updates when no anchors exist", () => {
    const origDoc = globalThis.document;
    (globalThis as Record<string, unknown>).document = {
      querySelectorAll: () => ({
        forEach: () => {},
      }),
    };

    try {
      const result = updateCalendarCells({
        dateRanks: {},
        styleMap: {},
        sel,
      });
      expect(result.updated).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.notFound).toEqual([]);
    } finally {
      if (origDoc) {
        (globalThis as Record<string, unknown>).document = origDoc;
      } else {
        delete (globalThis as Record<string, unknown>).document;
      }
    }
  });

  it("updates cells matching date ranks", () => {
    const mockInputRankCd = { value: "" };
    const mockInputDefaultRankCd = { value: "" };
    const mockInputRankNm = { value: "" };
    const mockInputStyleText = { value: "" };
    const mockInputSalesStop = { value: "1" };
    const mockRankText = { textContent: "" };
    const mockDateInput = { value: "20260301" };

    const mockAnchor = {
      className: "calendarTableBtn calendar_table_btn c_rank_stop",
      classList: {
        remove: vi.fn(),
        add: vi.fn(),
      },
      setAttribute: vi.fn(),
      querySelector: (s: string) => {
        if (s === 'input[name="inputTargetDate"]') return mockDateInput;
        if (s === 'input[name="inputPriceRankCd"]') return mockInputRankCd;
        if (s === 'input[name="defaultInputPriceRankCd"]')
          return mockInputDefaultRankCd;
        if (s === 'input[name="inputPriceRankNm"]') return mockInputRankNm;
        if (s === 'input[name="inputRankStyleText"]') return mockInputStyleText;
        if (s === 'input[name="inputSalesStopSetFlg"]')
          return mockInputSalesStop;
        if (s === ".calendarTableRank") return mockRankText;
        return null;
      },
    };

    const origDoc = globalThis.document;
    (globalThis as Record<string, unknown>).document = {
      querySelectorAll: (s: string) => {
        if (s === "a.calendarTableBtn") {
          return {
            forEach: (cb: (el: unknown) => void) => cb(mockAnchor),
          };
        }
        return { forEach: () => {} };
      },
    };

    try {
      const result = updateCalendarCells({
        dateRanks: { "2026-03-01": "A" },
        styleMap: {
          A: "background-color:#B0C4DE !important;",
        },
        sel,
      });

      expect(result.updated).toBe(1);
      expect(result.skipped).toBe(0);
      expect(mockInputRankCd.value).toBe("A");
      expect(mockInputDefaultRankCd.value).toBe("A");
      expect(mockInputRankNm.value).toBe("[A]");
      expect(mockInputStyleText.value).toBe(
        "background-color:#B0C4DE !important;",
      );
      expect(mockInputSalesStop.value).toBe("");
      expect(mockRankText.textContent).toBe("[A]");
      expect(mockAnchor.classList.remove).toHaveBeenCalledWith("c_rank_stop");
      expect(mockAnchor.classList.add).toHaveBeenCalledWith("c_rank_A");
      expect(mockAnchor.setAttribute).toHaveBeenCalledWith(
        "style",
        "background-color:#B0C4DE !important;",
      );
    } finally {
      if (origDoc) {
        (globalThis as Record<string, unknown>).document = origDoc;
      } else {
        delete (globalThis as Record<string, unknown>).document;
      }
    }
  });
});
