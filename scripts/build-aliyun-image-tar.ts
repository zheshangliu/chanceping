import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const imageName = process.env.CHANCEPING_ALIYUN_IMAGE_TAG || "chanceping:aliyun";
const outputPath = resolve(process.env.CHANCEPING_ALIYUN_IMAGE_TAR || "artifacts/aliyun/chanceping-aliyun-image.tar");
const manifestPath = `${outputPath}.json`;
const nodeImage = process.env.CHANCEPING_DOCKER_NODE_IMAGE || "public.ecr.aws/docker/library/node:22-slim";

function run(command: string, args: string[]): string {
  console.log(`[aliyun-image-tar] ${command} ${args.join(" ")}`);
  return execFileSync(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, CHANCEPING_DOCKER_NODE_IMAGE: nodeImage },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

mkdirSync(dirname(outputPath), { recursive: true });

run("docker", ["build", "--build-arg", `NODE_IMAGE=${nodeImage}`, "-t", imageName, "."]);
run("docker", ["save", "-o", outputPath, imageName]);

if (!existsSync(outputPath)) {
  throw new Error(`Docker image tar was not created: ${outputPath}`);
}

const sizeBytes = statSync(outputPath).size;
const imageId = run("docker", ["image", "inspect", imageName, "--format", "{{.Id}}"]).trim();
const repoDigests = run("docker", ["image", "inspect", imageName, "--format", "{{json .RepoDigests}}"]).trim();

const manifest = {
  imageName,
  imageId,
  repoDigests,
  outputPath,
  sizeBytes,
  createdAt: new Date().toISOString(),
  notes: [
    "This tar is produced from Dockerfile/.dockerignore and must not include api.env.",
    "Set real Qwen and Serper keys only in Aliyun environment variables.",
    "After loading/deploying, run CHANCEPING_DEPLOY_BASE_URL=https://... node --run verify:q7:aliyun-remote-smoke.",
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`[aliyun-image-tar] created ${outputPath}`);
console.log(`[aliyun-image-tar] size ${(sizeBytes / 1024 / 1024).toFixed(1)} MB`);
console.log(`[aliyun-image-tar] manifest ${manifestPath}`);
