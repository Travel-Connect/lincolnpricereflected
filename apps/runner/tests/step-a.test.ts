/**
 * Tests for step-a.ts — STEPA facility ID verification.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { FacilityMismatchError } from "../src/errors.js";
import type { Job } from "../src/job-state.js";

// Mock dependencies
vi.mock("../src/facility-lookup.js", () => ({
  getFacilityLincolnId: vi.fn(),
}));

vi.mock("../src/verify-facility.js", () => ({
  verifyFacilityId: vi.fn(),
}));

import { getFacilityLincolnId } from "../src/facility-lookup.js";
import { verifyFacilityId } from "../src/verify-facility.js";
import { run } from "../src/steps/step-a.js";

const mockGetFacilityLincolnId = vi.mocked(getFacilityLincolnId);
const mockVerifyFacilityId = vi.mocked(verifyFacilityId);

const FAKE_JOB: Job = {
  id: "job-001",
  facility_id: "550e8400-e29b-41d4-a716-446655440000",
  status: "RUNNING",
  last_completed_step: "PARSE",
  excel_file_path: "/tmp/test.xlsx",
  excel_original_name: "test.xlsx",
  stay_type: "A",
  target_period_from: "2026-03-01",
  target_period_to: "2026-03-31",
  retry_count: 3,
};

const fakePage = {} as never; // Page is only passed through to verifyFacilityId

beforeEach(() => {
  vi.clearAllMocks();
});

describe("STEPA run", () => {
  it("succeeds when facility ID matches", async () => {
    mockGetFacilityLincolnId.mockResolvedValue("Y77131");
    mockVerifyFacilityId.mockResolvedValue(undefined);

    await expect(run("job-001", fakePage, FAKE_JOB)).resolves.toBeUndefined();

    expect(mockGetFacilityLincolnId).toHaveBeenCalledWith(
      FAKE_JOB.facility_id,
    );
    expect(mockVerifyFacilityId).toHaveBeenCalledWith(
      fakePage,
      "Y77131",
      "STEPA",
    );
  });

  it("throws FacilityMismatchError when facility ID does not match", async () => {
    mockGetFacilityLincolnId.mockResolvedValue("Y77131");
    mockVerifyFacilityId.mockRejectedValue(
      new FacilityMismatchError("Y77131", "X99999"),
    );

    await expect(run("job-001", fakePage, FAKE_JOB)).rejects.toThrow(
      FacilityMismatchError,
    );
  });

  it("throws when facility lookup fails", async () => {
    mockGetFacilityLincolnId.mockRejectedValue(
      new Error("Facility not found: bad-uuid"),
    );

    await expect(run("job-001", fakePage, FAKE_JOB)).rejects.toThrow(
      "Facility not found",
    );

    // verifyFacilityId should not be called if lookup fails
    expect(mockVerifyFacilityId).not.toHaveBeenCalled();
  });
});
