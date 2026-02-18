/**
 * Network recorder — captures request/response events as JSONL.
 * Reference: docs/design.md §7.2
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page, Request, Response } from "playwright";

interface NetworkEntry {
  timestamp: string;
  type: "request" | "response";
  method: string;
  url: string;
  status?: number;
  headers?: Record<string, string>;
}

export class NetworkRecorder {
  private entries: NetworkEntry[] = [];
  private onRequest = (req: Request) => {
    this.entries.push({
      timestamp: new Date().toISOString(),
      type: "request",
      method: req.method(),
      url: req.url(),
    });
  };
  private onResponse = (res: Response) => {
    this.entries.push({
      timestamp: new Date().toISOString(),
      type: "response",
      method: res.request().method(),
      url: res.url(),
      status: res.status(),
    });
  };

  /** Start recording network events on the page */
  attach(page: Page): void {
    page.on("request", this.onRequest);
    page.on("response", this.onResponse);
  }

  /** Stop recording */
  detach(page: Page): void {
    page.removeListener("request", this.onRequest);
    page.removeListener("response", this.onResponse);
  }

  /** Write collected entries to a JSONL file and return the path */
  save(dir: string, step: string): string {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${step}_${ts}_network.jsonl`;
    const filepath = resolve(dir, filename);
    const content = this.entries.map((e) => JSON.stringify(e)).join("\n");
    writeFileSync(filepath, content, "utf-8");
    return filepath;
  }

  /** Get the number of recorded entries */
  get size(): number {
    return this.entries.length;
  }

  /** Clear recorded entries */
  clear(): void {
    this.entries = [];
  }
}
