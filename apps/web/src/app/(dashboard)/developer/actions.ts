"use server";

import { readFile } from "fs/promises";
import { join } from "path";

export interface SelectorEntry {
  section: string;
  key: string;
  value: string;
  description: string;
  isTBD: boolean;
}

export async function loadSelectors(): Promise<SelectorEntry[]> {
  const filePath = join(process.cwd(), "..", "..", "config", "selectors.json");
  const content = await readFile(filePath, "utf-8");
  const data = JSON.parse(content);

  const entries: SelectorEntry[] = [];

  for (const [section, values] of Object.entries(data)) {
    const sectionData = values as Record<string, string>;
    const description = sectionData._description ?? "";

    for (const [key, value] of Object.entries(sectionData)) {
      if (key.startsWith("_")) continue;
      entries.push({
        section,
        key,
        value,
        description,
        isTBD: value === "TBD",
      });
    }
  }

  return entries;
}
