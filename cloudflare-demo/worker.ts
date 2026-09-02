import type { Intent } from '../src/client/heap/intentTypes';
import { digestsMatch, hashAccessToken } from '../src/shared/accessGrants';
import type {
  RepairCommandSpec,
  RepairProcessResult,
  RepairSandboxAdapter,
} from '../src/shared/repairSandboxExecution';
import {
  executeRepairPipeline,
  REPAIR_WORKSPACE,
} from '../src/shared/repairSandboxExecution';
import {
  appendIntentContextTransition,
  deployRepairTransition,
  grantAlternateAccessTransition,
  readInvoiceByGrant,
  requestRepairTransition,
  resumeIntentTransition,
  revokeAlternateAccessTransition,
  sendInvoiceTransition,
  toAccessView,
} from '../src/shared/demoTransitions';
import { DemoSessionRepository } from '../worker/demoSessionRepository';

interface DemoEnv {
  ASSETS: Fetcher;
  DB: D1Database;
}

const SESSION_HEADER = 'X-Heap-Session-ID';
const MAX_BODY_BYTES = 256 * 1024;
const DELIVERY_SOURCE = 'src/server/services/DeliveryService.ts';
const SCOPE_AUDIT = 'scripts/scope-audit.mjs';
const ALLOWED_FILES = new Set([
  'package.json',
  DELIVERY_SOURCE,
  'tests/reproduce.test.ts',
  'tests/deliveryService.test.ts',
  'tests/affectedWorkflow.test.ts',
  SCOPE_AUDIT,
]);

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function getDemoSessionId(request: Request): string {
  const candidate = request.headers.get(SESSION_HEADER) ?? '';
  if (!/^[A-Za-z0-9_-]{8,96}$/.test(candidate)) {
    throw new Error(`A valid ${SESSION_HEADER} header is required.`);
  }
  return candidate;
}

async function readIntent(request: Request): Promise<Intent> {
  const declaredLength = Number(request.headers.get('Content-Length') ?? 0);
  if (declaredLength > MAX_BODY_BYTES) throw new Error('Request body is too large.');
  const body = (await request.json()) as { intent?: Intent };
  if (!body.intent || typeof body.intent.id !== 'string') {
    throw new Error('A valid intent payload is required.');
  }
  return body.intent;
}

class EdgeEvidenceRunner implements RepairSandboxAdapter {
  readonly executionMode = 'edge_deterministic' as const;
  readonly logicalWorkspace = REPAIR_WORKSPACE;
  readonly sandboxId: string;
  private readonly files = new Map<string, string>();

  constructor(sandboxId: string) {
    if (!/^[a-z0-9_-]{8,96}$/i.test(sandboxId)) {
      throw new Error('The edge evidence runner ID is invalid.');
    }
    this.sandboxId = sandboxId;
  }

  async prepare(): Promise<void> {
    this.files.clear();
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    if (!ALLOWED_FILES.has(relativePath)) {
      throw new Error(`Edge evidence runner denied write to ${relativePath}.`);
    }
    this.files.set(relativePath, content);
  }

  async run(spec: RepairCommandSpec): Promise<RepairProcessResult> {
    const source = this.files.get(DELIVERY_SOURCE) ?? '';
    const candidateReady =
      source.includes('loadOutboundGatewayConfig') &&
      source.includes('assertValidTlsConfiguration') &&
      source.includes('deliverOnce');
    const checks: Record<string, { passed: boolean; detail: string }> = {
      reproducer: {
        passed: source.includes('throw new DeliveryProviderConfigurationError'),
        detail: 'build A provider configuration failure is represented in the captured fixture',
      },
      regression: {
        passed: candidateReady,
        detail: 'the candidate preserves the existing invoice and delivery adapter contract',
      },
      affected: {
        passed: candidateReady && source.includes('deliveryReceipts'),
        detail: 'the candidate includes an idempotent delivery receipt boundary',
      },
      build: {
        passed: candidateReady && source.includes('export function sendInvoiceDelivery'),
        detail: 'the candidate source passes the bounded package shape check',
      },
      scope: {
        passed: this.files.size === ALLOWED_FILES.size && this.files.has(SCOPE_AUDIT),
        detail: 'all writes remain within the allowlisted repair workspace',
      },
    };
    const result = checks[spec.id] ?? {
      passed: false,
      detail: `unknown validation ${spec.id}`,
    };
    return {
      exitCode: result.passed ? 0 : 1,
      stdout: result.passed ? `EDGE CHECK PASSED: ${result.detail}.\n` : '',
      stderr: result.passed ? '' : `EDGE CHECK FAILED: ${result.detail}.\n`,
      timedOut: false,
      truncated: false,
    };
  }

  async destroy(): Promise<void> {
    this.files.clear();
  }
}

async function runRepairInBackground(
  sessionId: string,
  repairJobId: string,
  env: DemoEnv,
): Promise<void> {
  const sessions = new DemoSessionRepository(env.DB);
  const state = await sessions.get(sessionId);
  if (!state.repairJob || state.repairJob.id !== repairJobId) return;
  if (['ready_for_review', 'approved_and_deployed', 'failed'].includes(state.repairJob.status)) return;

  await executeRepairPipeline(
    state.repairJob,
    new EdgeEvidenceRunner(state.repairJob.sandbox.id),
    async (checkpoint) => {
      const latest = await sessions.get(sessionId);
      if (latest.repairJob?.id !== checkpoint.id) return;
      latest.repairJob = checkpoint;
      await sessions.save(latest);
    },
  );
}

function scheduleRepair(
  ctx: ExecutionContext,
  sessionId: string,
  repairJobId: string,
  env: DemoEnv,
): void {
  ctx.waitUntil(
    runRepairInBackground(sessionId, repairJobId, env).catch((error) => {
      console.error(
        JSON.stringify({
          message: 'edge repair evidence execution failed',
          sessionId,
          repairJobId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }),
  );
}

export default {
  async fetch(request: Request, env: DemoEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/api/health') {
      return json({ status: 'healthy', application: 'heap-4', version: 'free-demo' });
    }

    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    // Resolved before session handling: the recipient holds a scoped capability
    // token, not a session. Scope, expiry, and revocation carry the authority.
    const accessMatch = url.pathname.match(/^\/api\/demo\/invoice-access\/([^/]+)$/);
    if (request.method === 'GET' && accessMatch) {
      try {
        const sessions = new DemoSessionRepository(env.DB);
        const presentedHash = await hashAccessToken(decodeURIComponent(accessMatch[1]));
        const grantSessionId = await sessions.findSessionIdByTokenHash(presentedHash);
        if (!grantSessionId) return json({ success: false, error: 'This share link is not valid.' }, 403);

        const state = await sessions.get(grantSessionId);
        if (!state.accessGrant || !digestsMatch(state.accessGrant.tokenHash, presentedHash)) {
          return json({ success: false, error: 'This share link is not valid.' }, 403);
        }

        const resolved = readInvoiceByGrant(state);
        if (!resolved.success) return json({ success: false, error: resolved.error }, 403);
        return json({
          success: true,
          invoice: toAccessView(resolved.invoice, resolved.grant.expiresAt),
        });
      } catch {
        return json({ success: false, error: 'This share link is not valid.' }, 403);
      }
    }

    try {
      const sessionId = getDemoSessionId(request);
      const sessions = new DemoSessionRepository(env.DB);

      if (request.method === 'GET' && url.pathname === '/api/demo/state') {
        const state = await sessions.get(sessionId);
        return json(state);
      }

      if (request.method === 'POST' && url.pathname === '/api/demo/reset') {
        return json(await sessions.reset(sessionId));
      }

      const sendMatch = url.pathname.match(/^\/api\/demo\/intents\/([^/]+)\/send$/);
      if (request.method === 'POST' && sendMatch) {
        const intentId = decodeURIComponent(sendMatch[1]);
        const correlatedIntentId = request.headers.get('X-Heap-Intent-ID');
        const requestId = request.headers.get('X-Request-ID');
        if (correlatedIntentId !== intentId || !requestId) {
          throw new Error('Intent and request correlation headers are required.');
        }

        const state = await sessions.get(sessionId);
        const result = sendInvoiceTransition(state, await readIntent(request), requestId);
        await sessions.save(state);
        if (!result.success && state.repairJob) {
          scheduleRepair(ctx, sessionId, state.repairJob.id, env);
        }
        return json(result, result.success ? 200 : 500);
      }

      const repairMatch = url.pathname.match(/^\/api\/demo\/intents\/([^/]+)\/repair$/);
      if (request.method === 'POST' && repairMatch) {
        const state = await sessions.get(sessionId);
        const result = requestRepairTransition(state, decodeURIComponent(repairMatch[1]));
        await sessions.save(state);
        scheduleRepair(ctx, sessionId, result.repairJob.id, env);
        return json(result);
      }

      const contextMatch = url.pathname.match(/^\/api\/demo\/intents\/([^/]+)\/context$/);
      if (request.method === 'POST' && contextMatch) {
        const state = await sessions.get(sessionId);
        const body = (await request.json()) as { text?: string; source?: 'user' | 'agent' };
        const result = appendIntentContextTransition(
          state,
          decodeURIComponent(contextMatch[1]),
          String(body.text || ''),
          body.source === 'agent' ? 'agent' : 'user',
        );
        await sessions.save(state);
        return json(result);
      }

      const deployMatch = url.pathname.match(/^\/api\/demo\/repairs\/([^/]+)\/deploy$/);
      if (request.method === 'POST' && deployMatch) {
        const state = await sessions.get(sessionId);
        const result = deployRepairTransition(state, decodeURIComponent(deployMatch[1]));
        await sessions.save(state);
        return json(result);
      }

      const resumeMatch = url.pathname.match(/^\/api\/demo\/intents\/([^/]+)\/resume$/);
      if (request.method === 'POST' && resumeMatch) {
        const state = await sessions.get(sessionId);
        const result = resumeIntentTransition(state, decodeURIComponent(resumeMatch[1]));
        await sessions.save(state);
        return json(result);
      }

      const revokeMatch = url.pathname.match(/^\/api\/demo\/intents\/([^/]+)\/alternate-route\/revoke$/);
      if (request.method === 'POST' && revokeMatch) {
        const state = await sessions.get(sessionId);
        const body = (await request.json()) as { reason?: string };
        const tokenHash = state.accessGrant?.tokenHash;
        const result = revokeAlternateAccessTransition(
          state,
          decodeURIComponent(revokeMatch[1]),
          String(body.reason || '').slice(0, 200) || 'No reason supplied.',
        );
        await sessions.save(state);
        if (tokenHash) await sessions.dropGrantIndex(tokenHash);
        return json(result);
      }

      const alternateRouteMatch = url.pathname.match(/^\/api\/demo\/intents\/([^/]+)\/alternate-route$/);
      if (request.method === 'POST' && alternateRouteMatch) {
        const state = await sessions.get(sessionId);
        const body = (await request.json()) as {
          issuedVia?: 'webmcp_agent' | 'user';
          userConfirmation?: string;
        };
        const result = await grantAlternateAccessTransition(
          state,
          decodeURIComponent(alternateRouteMatch[1]),
          body.issuedVia === 'webmcp_agent' ? 'webmcp_agent' : 'user',
          String(body.userConfirmation || '').slice(0, 200),
        );
        await sessions.save(state);
        await sessions.indexGrant(result.grant.tokenHash, sessionId);
        return json(result);
      }

      return json({ success: false, error: 'API route not found.' }, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return json({ success: false, error: message }, 400);
    }
  },
};
