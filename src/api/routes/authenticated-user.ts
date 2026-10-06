export type AuthenticatedUserResolver = (request: Request) => string | null | undefined | Promise<string | null | undefined>;

export async function resolveAuthenticatedUser(request: Request, resolver?: AuthenticatedUserResolver): Promise<string | null> {
  if (!resolver) return null;
  try {
    const value = await resolver(request);
    return typeof value === "string" && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export function unauthorizedBusinessUser(): Response {
  return new Response(JSON.stringify({ success: false, data: null, error: { code: "UNAUTHORIZED", message: "需要登录用户身份" }, duration_ms: 0 }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}
