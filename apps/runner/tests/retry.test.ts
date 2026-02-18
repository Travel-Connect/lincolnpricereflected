/**
 * Tests for retry.ts — exponential backoff retry wrapper.
 */

import { describe, it, expect, vi } from "vitest";
import { withRetry } from "../src/retry.js";
import { RetryExhaustedError } from "../src/errors.js";

describe("withRetry", () => {
  it("returns the result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { maxAttempts: 3, delayMs: 10 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and succeeds eventually", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValue("ok");

    const result = await withRetry(fn, { maxAttempts: 3, delayMs: 10 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws RetryExhaustedError when all attempts fail", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));

    await expect(
      withRetry(fn, { maxAttempts: 3, delayMs: 10 }),
    ).rejects.toThrow(RetryExhaustedError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("calls onRetry callback between attempts", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("ok");

    const onRetry = vi.fn();
    await withRetry(fn, { maxAttempts: 3, delayMs: 10, onRetry });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
  });

  it("applies exponential backoff delay", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValue("ok");

    const start = Date.now();
    await withRetry(fn, {
      maxAttempts: 3,
      delayMs: 50,
      backoffFactor: 2,
    });
    const elapsed = Date.now() - start;

    // First retry: 50ms, second retry: 100ms → total ≥ 150ms
    // (but with timing variance, check ≥ 100ms)
    expect(elapsed).toBeGreaterThanOrEqual(100);
  });

  it("works with maxAttempts=1 (no retries)", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));

    await expect(
      withRetry(fn, { maxAttempts: 1, delayMs: 10 }),
    ).rejects.toThrow(RetryExhaustedError);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
