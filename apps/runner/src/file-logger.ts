/**
 * File logger — writes runner console output to a log file on OneDrive.
 *
 * Log path: ${OneDriveCommercial}/014.ポータルサイト/リンカーン在庫反映ログ/
 * Fallback: data/artifacts/ (if OneDriveCommercial is not set)
 *
 * Hooks into console.log/warn/error to capture all output.
 */

import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { resolve } from "node:path";

const PROJECT_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const LOG_SUBFOLDER = "014.ポータルサイト/リンカーン在庫反映ログ";

function getLogDir(): string {
  const oneDrive = process.env.OneDriveCommercial;
  if (oneDrive) {
    return resolve(oneDrive, LOG_SUBFOLDER);
  }
  console.warn("[file-logger] OneDriveCommercial not set — using data/artifacts/");
  return resolve(PROJECT_ROOT, "data", "artifacts");
}

function formatTimestamp(): string {
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  return `${y}${mo}${d}-${h}${mi}${s}`;
}

function logLineTimestamp(): string {
  return new Date().toISOString().slice(11, 23);
}

export interface FileLogger {
  close(): void;
  filePath: string;
}

/**
 * Set up file logging for a job run.
 * Hooks console.log/warn/error to also write to a log file.
 */
export function setupFileLogger(jobId: string): FileLogger {
  const machine = process.env.COMPUTERNAME ?? "UNKNOWN";
  const ts = formatTimestamp();
  const shortId = jobId.substring(0, 8);
  const fileName = `lincoln-runner-${machine}-${shortId}-${ts}.log`;

  const logDir = getLogDir();
  mkdirSync(logDir, { recursive: true });

  const filePath = resolve(logDir, fileName);
  const stream: WriteStream = createWriteStream(filePath, { flags: "a" });

  // Save original console methods
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;

  function writeToFile(level: string, args: unknown[]): void {
    const ts = logLineTimestamp();
    const msg = args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");
    stream.write(`[${ts}] [${level}] ${msg}\n`);
  }

  console.log = (...args: unknown[]) => {
    origLog.apply(console, args);
    writeToFile("LOG", args);
  };

  console.warn = (...args: unknown[]) => {
    origWarn.apply(console, args);
    writeToFile("WARN", args);
  };

  console.error = (...args: unknown[]) => {
    origError.apply(console, args);
    writeToFile("ERROR", args);
  };

  // Write header
  stream.write(`=== Lincoln Runner Log ===\n`);
  stream.write(`Machine: ${machine}\n`);
  stream.write(`Job ID: ${jobId}\n`);
  stream.write(`Started: ${new Date().toISOString()}\n`);
  stream.write(`Log file: ${filePath}\n`);
  stream.write(`===========================\n\n`);

  origLog(`[file-logger] Logging to: ${filePath}`);

  return {
    filePath,
    close() {
      // Restore original console methods
      console.log = origLog;
      console.warn = origWarn;
      console.error = origError;

      stream.write(`\n=== Log closed: ${new Date().toISOString()} ===\n`);
      stream.end();
    },
  };
}
