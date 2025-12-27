import { lookup } from "node:dns/promises";
import net from "node:net";

/**
 * SSRF defense utilities.
 *
 * Goal: when we fetch user-supplied URLs server-side (e.g., media sync),
 * ensure we cannot be tricked into hitting localhost/private networks or
 * downloading unbounded payloads.
 *
 * Notes:
 * - DNS rebinding: we resolve the hostname and block private IP ranges.
 * - Redirects: callers should disable redirects (redirect: "manual") so we
 *   don't follow a safe public URL to an internal redirect target.
 */

export class SsrfBlockedError extends Error {
  readonly code = "SSRF_BLOCKED";
  constructor(message: string) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

export type SsrfUrlCheckOptions = {
  /**
   * Comma-separated allowlist from env, already split.
   * - Exact host: "images.example.com"
   * - Suffix host: ".example.com"
   */
  allowedHosts?: string[];
};

function isIp(hostname: string): boolean {
  return net.isIP(hostname) !== 0;
}

function isLocalhost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "localhost." || h.endsWith(".localhost");
}

function isPrivateIPv4(ip: string): boolean {
  // RFC1918 + loopback + link-local + CGNAT
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;

  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 169 && b === 254) return true; // 169.254.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)

  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  // loopback
  if (normalized === "::1") return true;
  // link-local fe80::/10
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  // unique local fc00::/7
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  return false;
}

function isPrivateIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  return false;
}

function hostnameAllowed(hostname: string, allowedHosts: string[] | undefined): boolean {
  if (!allowedHosts || allowedHosts.length === 0) return true;
  const h = hostname.toLowerCase();
  return allowedHosts.some((entry) => {
    const e = entry.trim().toLowerCase();
    if (!e) return false;
    if (e.startsWith(".")) {
      // suffix match
      return h === e.slice(1) || h.endsWith(e);
    }
    return h === e;
  });
}

/**
 * Validate and normalize an external URL that we plan to fetch server-side.
 * Returns a normalized URL string if allowed, otherwise throws SsrfBlockedError.
 */
export async function assertSafeExternalUrl(rawUrl: string, opts: SsrfUrlCheckOptions = {}): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError("Invalid URL.");
  }

  if (url.username || url.password) {
    throw new SsrfBlockedError("Credentials in URL are not allowed.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfBlockedError("Only http/https URLs are allowed.");
  }

  if (isLocalhost(url.hostname)) {
    throw new SsrfBlockedError("Localhost URLs are not allowed.");
  }

  if (!hostnameAllowed(url.hostname, opts.allowedHosts)) {
    throw new SsrfBlockedError("Host is not allowed.");
  }

  // Block raw IP targets that are private.
  if (isIp(url.hostname) && isPrivateIp(url.hostname)) {
    throw new SsrfBlockedError("Private network targets are not allowed.");
  }

  // Resolve DNS for hostnames and block if any resolved address is private.
  if (!isIp(url.hostname)) {
    const results = await lookup(url.hostname, { all: true, verbatim: true });
    for (const r of results) {
      if (isPrivateIp(r.address)) {
        throw new SsrfBlockedError("Private network targets are not allowed.");
      }
    }
  }

  return url;
}

export type FetchExternalOptions = {
  timeoutMs: number;
  maxBytes: number;
};

/**
 * Fetch a URL with:
 * - timeout via AbortController
 * - redirects disabled (caller should still use redirect: "manual" to be explicit)
 * - max response size enforced while buffering
 */
export async function fetchExternalWithLimits(url: URL, options: FetchExternalOptions): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    // redirect: "manual" prevents following redirects (important for SSRF).
    const res = await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
    });

    // Reject redirects explicitly (3xx).
    if (res.status >= 300 && res.status < 400) {
      throw new SsrfBlockedError("Redirect responses are not allowed.");
    }

    // Enforce Content-Length if present.
    const lenHeader = res.headers.get("content-length");
    if (lenHeader) {
      const len = Number(lenHeader);
      if (!Number.isNaN(len) && len > options.maxBytes) {
        throw new SsrfBlockedError("Remote file is too large.");
      }
    }

    return res;
  } finally {
    clearTimeout(timeout);
  }
}

export async function readResponseAsBufferWithLimit(res: Response, maxBytes: number): Promise<Buffer> {
  const reader = res.body?.getReader();
  if (!reader) {
    // Fallback: if body is null, still try arrayBuffer (will be small/empty)
    const ab = await res.arrayBuffer();
    if (ab.byteLength > maxBytes) throw new SsrfBlockedError("Remote file is too large.");
    return Buffer.from(ab);
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      throw new SsrfBlockedError("Remote file is too large.");
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks.map((c) => Buffer.from(c)), total);
}


