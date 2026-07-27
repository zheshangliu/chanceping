import fs from "node:fs";
import path from "node:path";
import type { BusinessProfile } from "./matching/types";

export interface StoredBusinessProfile extends BusinessProfile { ownerId: string; createdAt: string; updatedAt: string; }
interface ProfileFile { profiles: StoredBusinessProfile[]; }
const id = () => `profile_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export class BusinessProfileStore {
  private readonly filePath: string;
  private data: ProfileFile;
  constructor(filePath = process.env.CHANCEPING_BUSINESS_PROFILES_PATH ?? path.resolve(process.cwd(), "data/business-profiles.json")) { this.filePath = filePath; this.data = this.load(); }
  private load(): ProfileFile { try { return { profiles: (JSON.parse(fs.readFileSync(this.filePath, "utf8")) as ProfileFile).profiles ?? [] }; } catch { return { profiles: [] }; } }
  private save() { fs.mkdirSync(path.dirname(this.filePath), { recursive: true }); const temp = `${this.filePath}.${process.pid}.tmp`; fs.writeFileSync(temp, JSON.stringify(this.data, null, 2)); fs.renameSync(temp, this.filePath); }
  list(ownerId: string): StoredBusinessProfile[] { return this.data.profiles.filter((profile) => profile.ownerId === ownerId).map(({ ownerId: _ownerId, ...publicProfile }) => publicProfile as StoredBusinessProfile); }
  create(ownerId: string, input: Partial<BusinessProfile>): StoredBusinessProfile { const now = new Date().toISOString(); const profile: StoredBusinessProfile = { id: id(), name: input.name || "未命名企业画像", businessType: input.businessType || "企业", regions: input.regions || ["guangzhou"], targetAudience: input.targetAudience || ["enterprise"], categories: input.categories || [], industries: input.industries || [], keywords: input.keywords || [], constraints: input.constraints || [], ownerId, createdAt: now, updatedAt: now }; this.data.profiles.push(profile); this.save(); const { ownerId: _ownerId, ...publicProfile } = profile; return publicProfile as StoredBusinessProfile; }
  get(ownerId: string, profileId: string): StoredBusinessProfile | undefined { return this.list(ownerId).find((profile) => profile.id === profileId); }
}
