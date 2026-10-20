import net from "node:net";

function ipv4Number(address: string): number[] | null {
  if (net.isIP(address) !== 4) return null;
  return address.split(".").map(Number);
}

export function isPublicIp(address: string): boolean {
  const v4 = ipv4Number(address);
  if (v4) {
    const [a, b, c] = v4;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2))) return false;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    if (a === 192 && b === 88 && c === 99) return false;
    return true;
  }
  if (net.isIP(address) !== 6) return false;
  const ip = address.toLowerCase().split("%", 1)[0];
  if (ip === "::" || ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe8") || ip.startsWith("fe9") || ip.startsWith("fea") || ip.startsWith("feb") || ip.startsWith("ff") || ip.startsWith("2001:db8")) return false;
  if (/^::ffff:/u.test(ip)) return isPublicIp(ip.slice(7));
  return true;
}

export interface ExternalTargetValidation { ok: boolean; reason?: string; url?: URL; }

export function validateExternalTargetUrl(value: string): ExternalTargetValidation {
  let url: URL;
  try { url = new URL(value); } catch { return { ok: false, reason: "INVALID_URL" }; }
  if (!(["http:", "https:"].includes(url.protocol))) return { ok: false, reason: "SCHEME_BLOCKED" };
  if (!url.hostname || url.username || url.password || value.length > 8192) return { ok: false, reason: "URL_SHAPE_BLOCKED" };
  const hostname = url.hostname.toLowerCase().replace(/\.$/u, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname === "metadata.google.internal") return { ok: false, reason: "PRIVATE_HOST_BLOCKED" };
  const ipFamily = net.isIP(hostname);
  if (ipFamily && !isPublicIp(hostname)) return { ok: false, reason: "PRIVATE_IP_BLOCKED" };
  return { ok: true, url };
}

export async function resolvePublicTarget(value: string): Promise<{ url: URL; address: string; family: 4 | 6 }> {
  const validated = validateExternalTargetUrl(value);
  if (!validated.ok || !validated.url) throw new Error(validated.reason ?? "URL_BLOCKED");
  const family = net.isIP(validated.url.hostname);
  if (family === 4 || family === 6) return { url: validated.url, address: validated.url.hostname, family };
  const dns = await import("node:dns/promises");
  const answers = await dns.lookup(validated.url.hostname, { all: true, verbatim: true });
  if (!answers.length || answers.some((answer) => !isPublicIp(answer.address))) throw new Error("PRIVATE_OR_MIXED_DNS_BLOCKED");
  const selected = answers[0];
  return { url: validated.url, address: selected.address, family: selected.family as 4 | 6 };
}

export function isHostOnComplianceHold(host: string, heldSourceUrls: string[]): boolean {
  const normalized = host.toLowerCase().replace(/\.$/u, "");
  return heldSourceUrls.some((sourceUrl) => {
    try { const sourceHost = new URL(sourceUrl).hostname.toLowerCase().replace(/\.$/u, ""); return normalized === sourceHost || normalized.endsWith(`.${sourceHost}`); } catch { return false; }
  });
}
