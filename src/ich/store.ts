import fs from "fs";
import path from "path";
import {
  ICH_SCHEMA_VERSION,
  type IchOpportunity,
  type IchOpportunityFile,
} from "./types";
import { validateIchOpportunity, validateIchOpportunityFile } from "./validation";

export interface IchStoreLoadResult {
  entries: IchOpportunity[];
  invalidEntries: Array<{ index: number; errors: string[] }>;
  updatedAt: string | null;
}

export class IchOpportunityStore {
  constructor(
    private readonly filePath: string,
    private readonly seedFilePath?: string,
  ) {}

  load(): IchStoreLoadResult {
    const readablePath = fs.existsSync(this.filePath)
      ? this.filePath
      : this.seedFilePath && fs.existsSync(this.seedFilePath)
        ? this.seedFilePath
        : null;
    if (!readablePath) return { entries: [], invalidEntries: [], updatedAt: null };
    const parsed: unknown = JSON.parse(fs.readFileSync(readablePath, "utf8"));
    const fileValidation = validateIchOpportunityFile(parsed);
    if (!fileValidation.valid || !fileValidation.value) {
      throw new Error(`Invalid ICH store: ${fileValidation.errors.join("; ")}`);
    }
    const entries: IchOpportunity[] = [];
    const invalidEntries: Array<{ index: number; errors: string[] }> = [];
    const ids = new Set<string>();
    const slugs = new Set<string>();
    fileValidation.value.entries.forEach((entry, index) => {
      const result = validateIchOpportunity(entry);
      if (!result.valid || !result.value) {
        invalidEntries.push({ index, errors: result.errors });
        return;
      }
      const uniquenessErrors: string[] = [];
      if (ids.has(result.value.id)) uniquenessErrors.push(`duplicate id: ${result.value.id}`);
      if (slugs.has(result.value.slug)) uniquenessErrors.push(`duplicate slug: ${result.value.slug}`);
      if (uniquenessErrors.length > 0) {
        invalidEntries.push({ index, errors: uniquenessErrors });
        return;
      }
      ids.add(result.value.id);
      slugs.add(result.value.slug);
      entries.push(result.value);
    });
    return { entries, invalidEntries, updatedAt: fileValidation.value.updated_at };
  }

  list(): IchOpportunity[] {
    return this.load().entries;
  }

  getById(id: string): IchOpportunity | null {
    return this.list().find((entry) => entry.id === id) ?? null;
  }

  getBySlug(slug: string): IchOpportunity | null {
    return this.list().find((entry) => entry.slug === slug) ?? null;
  }

  replaceAll(entries: IchOpportunity[], updatedAt = new Date().toISOString()): void {
    const ids = new Set<string>();
    const slugs = new Set<string>();
    entries.forEach((entry, index) => {
      const result = validateIchOpportunity(entry);
      if (!result.valid) throw new Error(`Invalid ICH entry at index ${index}: ${result.errors.join("; ")}`);
      if (ids.has(entry.id)) throw new Error(`Duplicate ICH id: ${entry.id}`);
      if (slugs.has(entry.slug)) throw new Error(`Duplicate ICH slug: ${entry.slug}`);
      ids.add(entry.id);
      slugs.add(entry.slug);
    });
    const file: IchOpportunityFile = { schema_version: ICH_SCHEMA_VERSION, updated_at: updatedAt, entries };
    const directory = path.dirname(this.filePath);
    fs.mkdirSync(directory, { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    const backupPath = `${this.filePath}.bak`;
    try {
      const fd = fs.openSync(tempPath, "w");
      try {
        fs.writeFileSync(fd, `${JSON.stringify(file, null, 2)}\n`, "utf8");
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      if (fs.existsSync(this.filePath)) fs.copyFileSync(this.filePath, backupPath);
      fs.renameSync(tempPath, this.filePath);
    } finally {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  }
}
