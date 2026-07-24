import fs from "node:fs";
import path from "node:path";
import { validateBusinessOpportunities } from "../src/business/opportunity";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function parseCsv(source: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted && char === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (!quoted && char === ",") { row.push(field); field = ""; }
    else if (!quoted && (char === "\n" || char === "\r")) { if (char === "\r" && source[index + 1] === "\n") index += 1; row.push(field); if (row.some(Boolean)) rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (quoted) throw new Error("CSV has an unterminated quoted field");
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function list(value: string): string[] { return value ? value.split("|").map((item) => item.trim()).filter(Boolean) : []; }
function bool(value: string): boolean { if (value === "true") return true; if (value === "false") return false; throw new Error(`Boolean must be true or false, got ${value}`); }

const input = path.resolve(process.cwd(), argument("--input"));
const output = path.resolve(process.cwd(), argument("--output"));
const rows = parseCsv(fs.readFileSync(input, "utf8").replace(/^\uFEFF/, ""));
const [headers, ...body] = rows;
if (!headers?.length) throw new Error("CSV must include a header row");
const records = body.map((cells, rowIndex) => {
  const values = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  if (cells.length !== headers.length) throw new Error(`Row ${rowIndex + 2} has ${cells.length} columns; expected ${headers.length}`);
  return {
    ...values,
    keywords: list(values.keywords), industries: list(values.industries), regions: list(values.regions), editions: list(values.editions), targetAudience: list(values.targetAudience), eligibilityRequirements: list(values.eligibilityRequirements), recommendationReasons: list(values.recommendationReasons), risks: list(values.risks), nextActions: list(values.nextActions),
    featured: bool(values.featured),
  };
});
const validated = validateBusinessOpportunities(records);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(validated, null, 2)}\n`);
console.log(`Imported and validated ${validated.length} Business opportunities into ${output}`);
