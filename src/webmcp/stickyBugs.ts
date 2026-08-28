/**
 * Sticky Bugs Engine
 * Computes deterministic cryptographic hashes for browser anomalies,
 * enabling instant lookup, hash-only submission, or enriched file/summary attachments.
 */

export interface StickyBugAttachment {
  name: string;
  sizeBytes: number;
  type: string;
  dataUrl?: string;
  previewUrl?: string;
}

export interface StickyBug {
  hash: string; // e.g. "sb-8f2a1b-3c4d"
  title: string;
  errorMessage: string;
  stackTrace?: string;
  componentStack?: string;
  url: string;
  timestamp: string;
  userId: string;
  status: 'captured' | 'triage_in_progress' | 'hotfix_applied' | 'pr_opened' | 'resolved';
  attachedFiles: StickyBugAttachment[];
  userSummary?: string;
  telemetryPacketId?: string;
  remediationAction?: string;
  remediationPath?: 'WEBMCP_HOTFIX' | 'CODEBASE_PR' | 'MANUAL';
  assignedModel?: string;
}

/**
 * Generate a deterministic, reproducible Sticky Bug Hash
 */
export function generateStickyBugHash(
  errorMessage: string,
  stackTrace?: string,
  url?: string
): string {
  const normalizedError = (errorMessage || 'unknown_error')
    .replace(/\d+/g, 'X') // normalize variable numbers
    .replace(/http[s]?:\/\/[^\s]+/g, 'URL')
    .toLowerCase()
    .trim();

  const normalizedStack = (stackTrace || '')
    .split('\n')
    .slice(0, 3) // first 3 frames
    .join(' ')
    .replace(/at\s+/g, '')
    .trim();

  const seed = `${normalizedError}::${normalizedStack}::${url || ''}`;

  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }

  const hex1 = Math.abs(hash).toString(16).padStart(6, '0').substring(0, 6);
  const hex2 = Math.abs(hash * 31).toString(16).padStart(4, '0').substring(0, 4);

  return `sb-${hex1}-${hex2}`;
}
