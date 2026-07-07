import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const registry = readRequiredEnv("CHANCEPING_ALIYUN_ACR_REGISTRY", ["ALIYUN_ACR_REGISTRY", "ACR_REGISTRY"]);
const imagePath = readRequiredEnv("CHANCEPING_ALIYUN_IMAGE", ["ALIYUN_IMAGE_NAME", "ACR_IMAGE"]);
const localImage = process.env.CHANCEPING_ALIYUN_IMAGE_TAG || "chanceping:aliyun";
const nodeImage = process.env.CHANCEPING_DOCKER_NODE_IMAGE || "public.ecr.aws/docker/library/node:22-slim";
const username = readOptionalEnv("CHANCEPING_ALIYUN_ACR_USERNAME", ["ALIYUN_ACR_USERNAME", "ACR_USERNAME"]);
const password = readOptionalEnv("CHANCEPING_ALIYUN_ACR_PASSWORD", ["ALIYUN_ACR_PASSWORD", "ACR_PASSWORD"]);
const manifestPath = resolve(process.env.CHANCEPING_ALIYUN_PUSH_MANIFEST || "artifacts/aliyun/aliyun-acr-push-manifest.json");
const targetImage = makeTargetImage(registry, imagePath);

function readOptionalEnv(primary: string, aliases: string[] = []): string {
  for (const key of [primary, ...aliases]) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
}

function readRequiredEnv(primary: string, aliases: string[] = []): string {
  const value = readOptionalEnv(primary, aliases);
  if (!value) {
    throw new Error(`Missing required env ${primary}${aliases.length ? ` (or ${aliases.join(", ")})` : ""}`);
  }
  return value;
}

function makeTargetImage(registryHost: string, image: string): string {
  const cleanRegistry = registryHost.replace(/\/+$/, "");
  const cleanImage = image.replace(/^\/+/, "");
  return cleanImage.startsWith(`${cleanRegistry}/`) ? cleanImage : `${cleanRegistry}/${cleanImage}`;
}

function run(command: string, args: string[]): string {
  console.log(`[aliyun-acr-deploy] ${command} ${args.join(" ")}`);
  return execFileSync(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, CHANCEPING_DOCKER_NODE_IMAGE: nodeImage },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

function dockerLoginIfConfigured(): void {
  if (!username && !password) {
    console.log("[aliyun-acr-deploy] skip docker login: no ACR username/password provided; assuming existing docker login");
    return;
  }
  if (!username || !password) {
    throw new Error("Both CHANCEPING_ALIYUN_ACR_USERNAME and CHANCEPING_ALIYUN_ACR_PASSWORD are required for docker login");
  }

  console.log(`[aliyun-acr-deploy] docker login ${registry} --username <configured> --password-stdin`);
  const result = spawnSync("docker", ["login", registry, "--username", username, "--password-stdin"], {
    cwd: process.cwd(),
    env: process.env,
    input: password,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    const stderr = (result.stderr || "").replaceAll(password, "<redacted>");
    throw new Error(`docker login failed: ${stderr.slice(0, 600)}`);
  }
}

mkdirSync(dirname(manifestPath), { recursive: true });

dockerLoginIfConfigured();
run("docker", ["build", "--build-arg", `NODE_IMAGE=${nodeImage}`, "-t", localImage, "."]);
run("docker", ["tag", localImage, targetImage]);
run("docker", ["push", targetImage]);

const imageId = run("docker", ["image", "inspect", localImage, "--format", "{{.Id}}"]).trim();
const targetInspect = run("docker", ["image", "inspect", targetImage, "--format", "{{json .RepoDigests}}"]).trim();

writeFileSync(
  manifestPath,
  `${JSON.stringify(
    {
      localImage,
      targetImage,
      imageId,
      repoDigests: targetInspect,
      nodeImage,
      pushedAt: new Date().toISOString(),
      notes: [
        "This manifest records the pushed image target only; it never stores registry passwords or API keys.",
        "Set Qwen and Serper keys in Aliyun environment variables, not in the image.",
        "After deploying this image, run CHANCEPING_DEPLOY_BASE_URL=https://... node --run verify:q7:aliyun-remote-smoke.",
      ],
    },
    null,
    2,
  )}\n`,
);

console.log(`[aliyun-acr-deploy] pushed ${targetImage}`);
console.log(`[aliyun-acr-deploy] manifest ${manifestPath}`);
