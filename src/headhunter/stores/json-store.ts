import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export class StoreError extends Error {}

interface JsonCollectionStoreOptions<T> {
  filePath: string;
  keyOf: (value: T) => string;
  parseItem?: (value: unknown) => T;
}

export class JsonCollectionStore<T> {
  private readonly options: JsonCollectionStoreOptions<T>;

  constructor(options: JsonCollectionStoreOptions<T>) {
    this.options = options;
  }

  async list(): Promise<T[]> {
    try {
      const raw = await readFile(this.options.filePath, "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new StoreError(`Invalid collection in ${this.options.filePath}`);
      return parsed.map((item) => this.options.parseItem ? this.options.parseItem(item) : item as T);
    } catch (error) {
      if (isFileNotFound(error)) return [];
      throw error;
    }
  }

  async replaceAll(values: T[]): Promise<void> {
    const directory = dirname(this.options.filePath);
    await mkdir(directory, { recursive: true });
    const temporaryPath = join(directory, `.${randomUUID()}.tmp`);
    await writeFile(temporaryPath, `${JSON.stringify(values, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, this.options.filePath);
  }

  async upsert(value: T): Promise<void> {
    const values = await this.list();
    const key = this.options.keyOf(value);
    const index = values.findIndex((item) => this.options.keyOf(item) === key);
    if (index === -1) values.push(value);
    else values[index] = value;
    await this.replaceAll(values);
  }

  async insert(value: T): Promise<void> {
    const values = await this.list();
    const key = this.options.keyOf(value);
    if (values.some((item) => this.options.keyOf(item) === key)) {
      throw new StoreError(`Duplicate key: ${key}`);
    }
    values.push(value);
    await this.replaceAll(values);
  }

  async getByKey(key: string): Promise<T | null> {
    const values = await this.list();
    return values.find((item) => this.options.keyOf(item) === key) ?? null;
  }
}

function isFileNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

export function defaultHeadHunterDataDir(): string {
  return join(process.cwd(), "data", "headhunter");
}
