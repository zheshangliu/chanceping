import { listIchSources } from "../src/ich/source-registry";

const sources = listIchSources();
const ids = new Set(sources.map((source) => source.source_id));
const urls = new Set(sources.map((source) => source.official_url));
const duplicateIds = sources.filter((source, index) => ids.size !== index + 1 && ![...ids].includes(source.source_id)).length;
const duplicateUrls = sources.length - urls.size;
const invalidUrls = sources.filter((source) => !/^https?:\/\//.test(source.official_url));
console.log(JSON.stringify({ total: sources.length, active: sources.filter((source) => source.active).length, duplicate_urls: duplicateUrls, invalid_urls: invalidUrls.length, supplemental_unconfirmed: sources.filter((source) => source.verification_status === "unconfirmed").length }, null, 2));
if (sources.length < 100 || duplicateUrls > 0 || invalidUrls.length > 0 || duplicateIds > 0) process.exit(1);
