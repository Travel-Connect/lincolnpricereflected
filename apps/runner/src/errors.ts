/**
 * Custom error types for Lincoln Runner.
 * Reference: docs/design.md §7
 */

/** Base class for all runner errors */
export class RunnerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** Selector value is "TBD" — cannot proceed until selector is defined */
export class SelectorTBDError extends RunnerError {
  constructor(public readonly path: string) {
    super(`Selector "${path}" is TBD — define it in config/selectors.json`);
  }
}

/** Selector path not found in config/selectors.json */
export class SelectorNotFoundError extends RunnerError {
  constructor(public readonly path: string) {
    super(`Selector "${path}" not found in config/selectors.json`);
  }
}

/** Expected facility ID does not match the value on screen */
export class FacilityMismatchError extends RunnerError {
  constructor(
    public readonly expected: string,
    public readonly actual: string,
  ) {
    super(
      `Facility ID mismatch: expected "${expected}", got "${actual}"`,
    );
  }
}

/** Output data does not match input Excel */
export class VerificationFailedError extends RunnerError {
  constructor(
    public readonly totalEntries: number,
    public readonly mismatchedCount: number,
  ) {
    super(
      `Verification failed: ${mismatchedCount}/${totalEntries} entries mismatched`,
    );
  }
}

/** Browser or network operation timed out — eligible for retry */
export class OperationTimeoutError extends RunnerError {
  constructor(operation: string, timeoutMs: number) {
    super(`Operation "${operation}" timed out after ${timeoutMs}ms`);
  }
}

/** Network connectivity issue — eligible for retry */
export class NetworkError extends RunnerError {
  constructor(message: string) {
    super(`Network error: ${message}`);
  }
}

/** User 2FA input not received within timeout */
export class TwoFactorTimeoutError extends RunnerError {
  constructor(timeoutMs: number) {
    super(
      `2FA input not received within ${timeoutMs / 1000}s — please retry`,
    );
  }
}

/** All retry attempts exhausted */
export class RetryExhaustedError extends RunnerError {
  constructor(
    public readonly attempts: number,
    public readonly lastError: Error,
  ) {
    super(
      `All ${attempts} retry attempts exhausted. Last error: ${lastError.message}`,
    );
  }
}
