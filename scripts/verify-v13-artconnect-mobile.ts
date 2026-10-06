import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "src/api/routes/ich-pages.ts"), "utf8");
const failures: string[] = [];
const check = (name: string, condition: boolean, details: string): void => {
  if (!condition) failures.push(`${name}: ${details}`);
};

check(
  "hero text can break long mixed-language tokens",
  /\.ich-hero p\{[^}]*overflow-wrap:anywhere/iu.test(source) && /\.ich-hero p\{[^}]*white-space:normal/iu.test(source),
  "hero paragraph has no explicit width/white-space/wrapping rule",
);
check(
  "mobile hero copy stays within viewport",
  /\.ich-hero-copy\{[^}]*max-width:100%[^}]*overflow:hidden/iu.test(source) && /\.ich-hero p\{[^}]*width:100%[^}]*max-width:100%/iu.test(source),
  "mobile hero copy has no overflow and width guard",
);

if (failures.length) {
  console.error(`V1.3 ArtConnect/mobile checks: ${failures.length} FAIL`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("V1.3 ArtConnect/mobile checks: PASS");
