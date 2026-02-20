/**
 * Tests for step0.ts — STEP0 calendar rank injection orchestration.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "../src/job-state.js";

// Mock dependencies
vi.mock("../src/steps/step0-helpers.js", () => ({
  loadExpectedRanks: vi.fn(),
  rankMapToDateRank: vi.fn(),
  collectRankStyles: vi.fn(),
  updateCalendarCells: vi.fn(),
}));

vi.mock("../src/selectors.js", () => ({
  getSelector: vi.fn((path: string) => {
    const map: Record<string, string> = {
      "navigation.calendarSettings": "Ascsc6800InitAction.do",
      "step0.calendarListItem": 'a[onclick*="doDetail"]',
      "step0.periodToYear": 'select[name="targetToYear"]',
      "step0.periodToMonth": 'select[name="targetToMonth"]',
      "step0.periodToDay": 'select[name="targetToDay"]',
      "step0.periodRedrawButton": 'a[onclick="doPeriodRedraw()"]',
      "step0.rankPaletteBtn": "a.rankBtn",
      "step0.rankAnchor": "a.calendarTableBtn",
      "step0.rankText": ".calendarTableRank",
      "step0.inputPriceRankCd": 'input[name="inputPriceRankCd"]',
      "step0.defaultInputPriceRankCd":
        'input[name="defaultInputPriceRankCd"]',
      "step0.inputPriceRankNm": 'input[name="inputPriceRankNm"]',
      "step0.inputRankStyleText": 'input[name="inputRankStyleText"]',
      "step0.saveButton": 'a[onclick="doUpdate()"]',
    };
    return map[path] || "UNKNOWN";
  }),
}));

import {
  loadExpectedRanks,
  rankMapToDateRank,
} from "../src/steps/step0-helpers.js";
import { run } from "../src/steps/step0.js";

const mockLoadExpectedRanks = vi.mocked(loadExpectedRanks);
const mockRankMapToDateRank = vi.mocked(rankMapToDateRank);

const FAKE_JOB: Job = {
  id: "job-001",
  facility_id: "550e8400-e29b-41d4-a716-446655440000",
  status: "RUNNING",
  last_completed_step: "STEPA",
  excel_file_path: "/tmp/test.xlsx",
  excel_original_name: "test.xlsx",
  stay_type: "A",
  target_period_from: "2026-03-01",
  target_period_to: "2026-03-31",
  retry_count: 3,
};

/**
 * Create a mock Playwright Page.
 */
function createMockPage() {
  const mockLocator = {
    fill: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    selectOption: vi.fn().mockResolvedValue(undefined),
    filter: vi.fn().mockReturnThis(),
    first: vi.fn().mockReturnThis(),
    isVisible: vi.fn().mockResolvedValue(true),
  };

  return {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    locator: vi.fn().mockReturnValue(mockLocator),
    evaluate: vi.fn(),
    _mockLocator: mockLocator,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("STEP0 run", () => {
  it("executes the full flow: load → navigate → update → save", async () => {
    const rankMap = new Map([
      ["2026-03-01", new Map([["シングル", "A"]])],
    ]);

    mockLoadExpectedRanks.mockResolvedValue({
      rankMap,
      maxDate: "2026-03-31",
    });
    mockRankMapToDateRank.mockReturnValue({
      "2026-03-01": "A",
    });

    const mockPage = createMockPage();

    // evaluate calls:
    // 1st: collectRankStyles → returns style map
    // 2nd: updateCalendarCells → returns update result
    // 3rd: error check → returns null (no error)
    mockPage.evaluate
      .mockResolvedValueOnce({ A: "background-color: red;" }) // collectRankStyles
      .mockResolvedValueOnce({ updated: 5, skipped: 0, notFound: [] }) // updateCalendarCells
      .mockResolvedValueOnce(null); // error check

    await run("job-001", mockPage as never, FAKE_JOB);

    // Verify navigation
    expect(mockPage.goto).toHaveBeenCalledWith(
      expect.stringContaining("Ascsc6800InitAction.do"),
      expect.any(Object),
    );

    // Verify calendar link was clicked and save was clicked
    expect(mockPage._mockLocator.click).toHaveBeenCalled();

    // Verify loadExpectedRanks was called
    expect(mockLoadExpectedRanks).toHaveBeenCalledWith("job-001");

    // Verify rankMapToDateRank was called
    expect(mockRankMapToDateRank).toHaveBeenCalledWith(rankMap);
  });

  it("throws when no cells are updated", async () => {
    const rankMap = new Map([
      ["2026-03-01", new Map([["シングル", "A"]])],
    ]);

    mockLoadExpectedRanks.mockResolvedValue({
      rankMap,
      maxDate: "2026-03-31",
    });
    mockRankMapToDateRank.mockReturnValue({
      "2026-03-01": "A",
    });

    const mockPage = createMockPage();
    mockPage.evaluate
      .mockResolvedValueOnce({ A: "background-color: red;" })
      .mockResolvedValueOnce({ updated: 0, skipped: 0, notFound: [] });

    await expect(
      run("job-001", mockPage as never, FAKE_JOB),
    ).rejects.toThrow("No cells were updated");
  });

  it("throws when save fails with error message", async () => {
    const rankMap = new Map([
      ["2026-03-01", new Map([["シングル", "A"]])],
    ]);

    mockLoadExpectedRanks.mockResolvedValue({
      rankMap,
      maxDate: "2026-03-31",
    });
    mockRankMapToDateRank.mockReturnValue({
      "2026-03-01": "A",
    });

    const mockPage = createMockPage();
    mockPage.evaluate
      .mockResolvedValueOnce({ A: "background-color: red;" })
      .mockResolvedValueOnce({ updated: 5, skipped: 0, notFound: [] })
      .mockResolvedValueOnce("エラーが発生しました"); // save error

    await expect(
      run("job-001", mockPage as never, FAKE_JOB),
    ).rejects.toThrow("Save failed");
  });

  it("throws when loadExpectedRanks fails", async () => {
    mockLoadExpectedRanks.mockRejectedValue(
      new Error("No expected ranks found"),
    );

    const mockPage = createMockPage();

    await expect(
      run("job-001", mockPage as never, FAKE_JOB),
    ).rejects.toThrow("No expected ranks found");
  });
});
