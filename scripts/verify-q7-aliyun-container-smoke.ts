import { execFileSync, spawnSync } from "node:child_process";
import { createServer } from "node:net";

const DEFAULT_NODE_IMAGE = "node:22-slim";
const LOCAL_MIRROR_NODE_IMAGE = "public.ecr.aws/docker/library/node:22-slim";
const DEFAULT_IMAGE_NAME = "chanceping:latest";

function log(message: string): void {
  console.log(`[container-smoke] ${message}`);
}

function runCommand(command: string, args: string[], options: { env?: NodeJS.ProcessEnv; stdio?: "inherit" | "pipe" } = {}): string {
  return execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: options.env ?? process.env,
    stdio: options.stdio ?? "pipe",
  }) as unknown as string;
}

function commandSucceeds(command: string, args: string[]): boolean {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "ignore",
  });
  return result.status === 0;
}

async function findFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to allocate a local smoke-test port")));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

function resolveNodeImage(): string {
  const explicit = process.env.CHANCEPING_DOCKER_NODE_IMAGE?.trim();
  if (explicit) return explicit;

  if (commandSucceeds("docker", ["image", "inspect", LOCAL_MIRROR_NODE_IMAGE])) {
    return LOCAL_MIRROR_NODE_IMAGE;
  }

  return DEFAULT_NODE_IMAGE;
}

function stopContainer(containerName: string): void {
  spawnSync("docker", ["stop", containerName], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "ignore",
  });
}

async function waitForHealth(baseUrl: string, containerName: string): Promise<void> {
  const startedAt = Date.now();
  const timeoutMs = Number(process.env.CHANCEPING_CONTAINER_SMOKE_TIMEOUT_MS ?? 45_000);

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // Keep waiting until the container has finished booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  const logs = spawnSync("docker", ["logs", containerName], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "pipe",
  });
  throw new Error(`Container did not become healthy within ${timeoutMs}ms.\n${logs.stdout ?? ""}\n${logs.stderr ?? ""}`);
}

async function run(): Promise<void> {
  if (!commandSucceeds("docker", ["--version"])) {
    throw new Error("Docker is required for verify:q7:aliyun-container-smoke");
  }

  const imageName = process.env.CHANCEPING_CONTAINER_SMOKE_IMAGE?.trim() || DEFAULT_IMAGE_NAME;
  const nodeImage = resolveNodeImage();
  const shouldSkipBuild = /^(1|true|yes)$/i.test(process.env.CHANCEPING_SKIP_DOCKER_BUILD ?? "");

  if (shouldSkipBuild) {
    log(`Skipping docker compose build; using existing image ${imageName}`);
  } else {
    log(`Building ${imageName} with NODE_IMAGE=${nodeImage}`);
    runCommand("docker", ["compose", "build"], {
      env: {
        ...process.env,
        CHANCEPING_DOCKER_NODE_IMAGE: nodeImage,
      },
      stdio: "inherit",
    });
  }

  const port = await findFreePort();
  const containerName = `chanceping-container-smoke-${Date.now()}`;
  const baseUrl = `http://127.0.0.1:${port}`;
  let containerStarted = false;

  try {
    log(`Starting ${imageName} on ${baseUrl}`);
    runCommand("docker", ["run", "-d", "--rm", "--name", containerName, "-p", `${port}:3000`, imageName], {
      stdio: "pipe",
    });
    containerStarted = true;

    await waitForHealth(baseUrl, containerName);
    log("Container healthcheck is ready; running remote smoke against the container");

    runCommand(process.execPath, ["--run", "verify:q7:aliyun-remote-smoke"], {
      env: {
        ...process.env,
        CHANCEPING_DEPLOY_BASE_URL: baseUrl,
      },
      stdio: "inherit",
    });
  } finally {
    if (containerStarted) {
      log(`Stopping ${containerName}`);
      stopContainer(containerName);
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
