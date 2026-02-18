/**
 * Exponential backoff retry wrapper.
 * Reference: docs/design.md §3.3
 */

import { RetryExhaustedError } from "./errors.js";

export interface RetryOptions {
  /** Maximum number of attempts (default: 3) */
  maxAttempts?: number;
  /** Initial delay in ms (default: 2000) */
  delayMs?: number;
  /** Backoff multiplier (default: 2) */
  backoffFactor?: number;
  /** Optional callback on each retry */
  onRetry?: (attempt: number, error: Error) => void;
}

const DEFAULTS: Required<Omit<RetryOptions, "onRetry">> = {
  maxAttempts: 3,
  delayMs: 2000,
  backoffFactor: 2,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute `fn` with exponential backoff retries.
 * @throws RetryExhaustedError if all attempts fail
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? DEFAULTS.maxAttempts;
  const delayMs = options?.delayMs ?? DEFAULTS.delayMs;
  const backoffFactor = options?.backoffFactor ?? DEFAULTS.backoffFactor;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxAttempts) {
        options?.onRetry?.(attempt, lastError);
        const wait = delayMs * Math.pow(backoffFactor, attempt - 1);
        await sleep(wait);
      }
    }
  }

  throw new RetryExhaustedError(maxAttempts, lastError!);
}
