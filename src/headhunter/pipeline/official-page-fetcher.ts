export interface OfficialPageFetchResult {
  url: string;
  content: string | null;
  warning?: string;
  status?: number;
}

export interface OfficialPageFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  fetchImpl?: typeof fetch;
}

/** Bounded, text-only fetch for first-party contact pages. */
export async function fetchFirstPartyPage(url: string, options: OfficialPageFetchOptions = {}): Promise<OfficialPageFetchResult> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const maxBytes = options.maxBytes ?? 600_000;
  const maxRedirects = options.maxRedirects ?? 3;
  const fetchImpl = options.fetchImpl ?? fetch;
  let currentUrl = url;
  try {
    const original = new URL(url);
    if (!/^https?:$/.test(original.protocol)) return { url, content: null, warning: "unsupported_protocol" };
    const originalHost = original.hostname.toLowerCase();
    for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetchImpl(currentUrl, { method: "GET", redirect: "manual", signal: controller.signal, headers: { accept: "text/html,application/xhtml+xml" } });
      } finally { clearTimeout(timer); }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirect === maxRedirects) return { url: currentUrl, content: null, warning: "redirect_limit_or_missing_location", status: response.status };
        const redirected = new URL(location, currentUrl);
        if (!/^https?:$/.test(redirected.protocol) || redirected.hostname.toLowerCase() !== originalHost) return { url: currentUrl, content: null, warning: "cross_origin_redirect", status: response.status };
        currentUrl = redirected.toString();
        continue;
      }
      if (!response.ok) return { url: currentUrl, content: null, warning: `http_${response.status}`, status: response.status };
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (contentType && !/(?:text\/html|application\/xhtml\+xml)/.test(contentType)) return { url: currentUrl, content: null, warning: "non_html_content_type", status: response.status };
      const declaredLength = Number(response.headers.get("content-length") ?? "0");
      if (declaredLength > maxBytes) return { url: currentUrl, content: null, warning: "response_too_large", status: response.status };
      const raw = await readBounded(response, maxBytes);
      return { url: currentUrl, content: htmlToText(raw), status: response.status };
    }
    return { url: currentUrl, content: null, warning: "redirect_limit" };
  } catch (error) {
    return { url: currentUrl, content: null, warning: error instanceof Error && error.name === "AbortError" ? "timeout" : "fetch_failed" };
  }
}

async function readBounded(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return await response.text();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel(); throw new Error("response_too_large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(merged);
}

function htmlToText(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>|<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80_000);
}
