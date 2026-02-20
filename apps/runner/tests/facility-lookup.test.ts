/**
 * Tests for facility-lookup.ts — UUID → lincoln_id resolution.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock getSupabase before importing the module under test
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("../src/supabase-client.js", () => ({
  getSupabase: () => ({ from: mockFrom }),
}));

mockSelect.mockReturnValue({ eq: mockEq });
mockEq.mockReturnValue({ single: mockSingle });

import { getFacilityLincolnId } from "../src/facility-lookup.js";

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReturnValue({ select: mockSelect });
  mockSelect.mockReturnValue({ eq: mockEq });
  mockEq.mockReturnValue({ single: mockSingle });
});

describe("getFacilityLincolnId", () => {
  it("returns lincoln_id for a valid facility UUID", async () => {
    mockSingle.mockResolvedValue({
      data: { lincoln_id: "Y77131" },
      error: null,
    });

    const result = await getFacilityLincolnId(
      "550e8400-e29b-41d4-a716-446655440000",
    );

    expect(result).toBe("Y77131");
    expect(mockFrom).toHaveBeenCalledWith("facilities");
    expect(mockSelect).toHaveBeenCalledWith("lincoln_id");
    expect(mockEq).toHaveBeenCalledWith(
      "id",
      "550e8400-e29b-41d4-a716-446655440000",
    );
  });

  it("throws when facility does not exist", async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: "Row not found" },
    });

    await expect(
      getFacilityLincolnId("00000000-0000-0000-0000-000000000000"),
    ).rejects.toThrow("Facility not found");
  });

  it("throws on Supabase query error", async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: "connection refused" },
    });

    await expect(
      getFacilityLincolnId("550e8400-e29b-41d4-a716-446655440000"),
    ).rejects.toThrow("connection refused");
  });
});
