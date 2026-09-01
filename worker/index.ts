import { proxyToSandbox } from '@cloudflare/sandbox';
import type { Intent } from '../src/client/heap/intentTypes';
import {
  appendIntentContextTransition,
  deployRepairTransition,
  requestRepairTransition,
  resumeIntentTransition,
  sendInvoiceTransition,
} from '../src/shared/demoTransitions';
import { executeRepairPipeline } from '../src/shared/repairSandboxExecution';
import { CloudflareRepairSandbox } from './cloudflareRepairSandbox';
import { DemoSessionRepository } from './demoSessionRepository';

export { ContainerProxy } from '@cloudflare/sandbox';
export { RepairSandbox } from './repairSandboxClass';

const SESSION_HEADER = 'X-Heap-Session-ID';
const MAX_BODY_BYTES = 256 * 1024;

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

async function runRepairInSandbox(
  sessionId: string,
  repairJobId: string,
  env: Env,
): Promise<void> {
  const sessions = new DemoSessionRepository(env.DB);
  const state = await sessions.get(sessionId);
  if (!state.repairJob || state.repairJob.id !== repairJobId) return;
  if (['ready_for_review', 'approved_and_deployed', 'failed'].includes(state.repairJob.status)) return;

  await executeRepairPipeline(
    state.repairJob,
    new CloudflareRepairSandbox(env.Sandbox, state.repairJob.sandbox.id),
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
  env: Env,
): void {
  ctx.waitUntil(
    runRepairInSandbox(sessionId, repairJobId, env).catch((error) => {
      console.error(
        JSON.stringify({
          message: 'cloudflare repair execution failed',
          sessionId,
          repairJobId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }),
  );
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const proxyResponse = await proxyToSandbox(request, env);
    if (proxyResponse) return proxyResponse;

    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/api/health') {
      return json({ status: 'healthy', application: 'heap-4', version: '1.0.0' });
    }

    if (!url.pathname.startsWith('/api/')) {
      return new Response(null, { status: 404 });
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

      return json({ success: false, error: 'API route not found.' }, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return json({ success: false, error: message }, 400);
    }
  },
} satisfies ExportedHandler<Env>;
