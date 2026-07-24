import fs from "fs";
import path from "path";
import {
  ICH_SUBMISSION_SCHEMA_VERSION,
  type IchSourceSubmission,
  type IchSourceSubmissionFile,
} from "./submission-types";
import { validateIchSourceSubmission, validateIchSourceSubmissionFile } from "./submission-validation";

export class IchSubmissionStore {
  constructor(private readonly filePath: string) {}

  list(): IchSourceSubmission[] {
    if (!fs.existsSync(this.filePath)) return [];
    const parsed: unknown = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    if (!validateIchSourceSubmissionFile(parsed)) throw new Error("Invalid ICH submission store");
    const ids = new Set<string>();
    for (const entry of parsed.entries) {
      if (ids.has(entry.id)) throw new Error(`Duplicate ICH submission id: ${entry.id}`);
      ids.add(entry.id);
    }
    return parsed.entries;
  }

  get(id: string): IchSourceSubmission | null {
    return this.list().find((entry) => entry.id === id) ?? null;
  }

  replaceAll(entries: IchSourceSubmission[], updatedAt = new Date().toISOString()): void {
    const ids = new Set<string>();
    entries.forEach((entry) => {
      if (!validateIchSourceSubmission(entry)) throw new Error("Invalid ICH source submission");
      if (ids.has(entry.id)) throw new Error(`Duplicate ICH submission id: ${entry.id}`);
      ids.add(entry.id);
    });
    const file: IchSourceSubmissionFile = {
      schema_version: ICH_SUBMISSION_SCHEMA_VERSION,
      updated_at: updatedAt,
      entries,
    };
    const directory = path.dirname(this.filePath);
    fs.mkdirSync(directory, { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    const backup = `${this.filePath}.bak`;
    try {
      const descriptor = fs.openSync(temporary, "w");
      try {
        fs.writeFileSync(descriptor, `${JSON.stringify(file, null, 2)}\n`, "utf8");
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      if (fs.existsSync(this.filePath)) fs.copyFileSync(this.filePath, backup);
      fs.renameSync(temporary, this.filePath);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
}
