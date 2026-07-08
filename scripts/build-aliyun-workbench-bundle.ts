import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
const artifactRoot = resolve("artifacts/aliyun-workbench");
const bundleName = `chanceping-workbench-${stamp}`;
const stagingDir = join(artifactRoot, bundleName);
const outputPath = join(artifactRoot, `${bundleName}.tar.gz`);
const manifestPath = `${outputPath}.json`;

const rsyncExcludes = [
  ".git/",
  "node_modules/",
  "api.env",
  ".env",
  ".env.local",
  ".env.*.local",
  "artifacts/",
  ".superpowers/",
  "ui-audit-*/",
  "data/",
  "reports/",
  "exports/",
  "meili-data/",
  ".DS_Store",
  "*.log",
  "e2e-real-search-log*.txt",
];

const dataFiles = [
  "opportunity-store.json",
  "radars.json",
  "radar-runs.json",
  "report-index.json",
  "radar-chat-windows.json",
];

function run(command: string, args: string[], options: { cwd?: string } = {}): string {
  console.log(`[workbench-bundle] ${command} ${args.join(" ")}`);
  return execFileSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

function ensureCleanPath(path: string): void {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
  }
}

mkdirSync(artifactRoot, { recursive: true });
ensureCleanPath(stagingDir);
mkdirSync(stagingDir, { recursive: true });

run("rsync", [
  "-a",
  "--delete",
  ...rsyncExcludes.flatMap((pattern) => ["--exclude", pattern]),
  "./",
  `${stagingDir}/`,
]);

mkdirSync(join(stagingDir, "data"), { recursive: true });
for (const filename of dataFiles) {
  const source = resolve("data", filename);
  if (existsSync(source)) {
    run("rsync", ["-a", source, join(stagingDir, "data", filename)]);
  }
}

if (existsSync("reports")) {
  mkdirSync(join(stagingDir, "reports"), { recursive: true });
  run("rsync", [
    "-a",
    "--include",
    "*/",
    "--include",
    "*.md",
    "--include",
    "*.html",
    "--exclude",
    "*",
    "reports/",
    join(stagingDir, "reports/"),
  ]);
}
mkdirSync(join(stagingDir, "exports"), { recursive: true });
writeFileSync(join(stagingDir, "exports", ".gitkeep"), "");

run("tar", ["-czf", outputPath, basename(stagingDir)], { cwd: artifactRoot });

const tarList = run("tar", ["-tzf", outputPath]);
const forbidden = [
  /(^|\/)api\.env$/,
  /(^|\/)\.env$/,
  /(^|\/)node_modules\//,
  /(^|\/)\.git\//,
  /(^|\/)artifacts\//,
  /(^|\/)\.superpowers\//,
  /(^|\/)ui-audit-/,
  /search-cache\.json$/,
  /serper-daily-budget\.json$/,
];

const leaked = tarList.split("\n").filter((entry) => forbidden.some((pattern) => pattern.test(entry)));
if (leaked.length > 0) {
  rmSync(outputPath, { force: true });
  throw new Error(`Workbench bundle contains forbidden entries:\n${leaked.slice(0, 20).join("\n")}`);
}

const sizeBytes = statSync(outputPath).size;
const manifest = {
  bundleName,
  outputPath,
  sizeBytes,
  sizeMb: Number((sizeBytes / 1024 / 1024).toFixed(2)),
  createdAt: new Date().toISOString(),
  includedDataFiles: dataFiles.filter((filename) => existsSync(resolve("data", filename))),
  installCommand: `bash /tmp/workbench-install.sh /tmp/${bundleName}.tar.gz`,
  notes: [
    "Upload this tar.gz plus docs/deployment/workbench-install.sh through Aliyun Workbench.",
    "The bundle excludes api.env, .env, node_modules, .git, artifacts, search cache, and Serper budget files.",
    "Set real Qwen and Serper keys only in /etc/chanceping/chanceping.env on the server.",
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
copyFileSync("docs/deployment/workbench-install.sh", join(artifactRoot, "workbench-install.sh"));
copyFileSync("docs/deployment/workbench-enable-https.sh", join(artifactRoot, "workbench-enable-https.sh"));

console.log(`[workbench-bundle] created ${outputPath}`);
console.log(`[workbench-bundle] size ${manifest.sizeMb} MB`);
console.log(`[workbench-bundle] manifest ${manifestPath}`);
console.log(`[workbench-bundle] installer ${join(artifactRoot, "workbench-install.sh")}`);
console.log(`[workbench-bundle] https helper ${join(artifactRoot, "workbench-enable-https.sh")}`);
