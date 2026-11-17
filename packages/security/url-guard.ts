import path from 'node:path';
import net from 'node:net';

const BLOCKED_HOSTNAMES = new Set([
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
  '169.254.169.254',
  '169.254.170.2',
  'fd00:ec2::254',
]);

function isPrivateOrLinkLocalIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 127) return false; // 127.0.0.1 explicitly allowed for local dev targets
  if (a === 169 && b === 254) return true; // Link-local / cloud metadata
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 0) return true;
  return false;
}

export interface UrlValidationResult {
  valid: boolean;
  normalizedUrl?: string;
  origin?: string;
  reason?: string;
}

export function validateTargetUrl(
  rawUrl: string,
  allowedOriginsEnv: string = process.env.ALLOWED_TARGET_ORIGINS || ''
): UrlValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { valid: false, reason: 'Invalid URL format. Expected http:// or https:// URL.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      valid: false,
      reason: `Unsupported URL protocol "${parsed.protocol}". Only http: and https: are allowed.`,
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return {
      valid: false,
      reason: `Blocked metadata or restricted hostname "${hostname}".`,
    };
  }

  const extraOrigins = allowedOriginsEnv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const isLocalhost =
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';

  if (net.isIP(hostname) === 4 && isPrivateOrLinkLocalIPv4(hostname)) {
    if (!extraOrigins.includes(parsed.origin)) {
      return {
        valid: false,
        reason: `Private or link-local IP "${hostname}" is blocked unless explicitly listed in ALLOWED_TARGET_ORIGINS.`,
      };
    }
  }

  if (!isLocalhost && parsed.hostname.includes('internal')) {
    if (!extraOrigins.includes(parsed.origin)) {
      return {
        valid: false,
        reason: `Internal hostname "${hostname}" is blocked unless explicitly allowed.`,
      };
    }
  }

  return {
    valid: true,
    normalizedUrl: parsed.toString(),
    origin: parsed.origin,
  };
}

export function isSameApprovedOrigin(candidateUrl: string, approvedOrigin: string): boolean {
  try {
    const parsed = new URL(candidateUrl);
    return parsed.origin === approvedOrigin && (parsed.protocol === 'http:' || parsed.protocol === 'https:');
  } catch {
    return false;
  }
}

export function resolveSafeWorkspacePath(baseDir: string, relativePath: string): string {
  const normalizedRel = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalizedRel || normalizedRel.includes('\0')) {
    throw new Error('Invalid relative path');
  }
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, normalizedRel);
  const rel = path.relative(resolvedBase, resolvedTarget);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path traversal blocked for "${relativePath}"`);
  }
  return resolvedTarget;
}

export function sanitizeUntrustedTextForPrompt(text: string, maxChars = 24000): string {
  const truncated = text.slice(0, maxChars);
  return truncated
    .replace(/```/g, "'''")
    .replace(/<\/?system>/gi, '[TAG_REMOVED]');
}
