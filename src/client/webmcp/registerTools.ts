/**
 * Authoritative Heap 4 WebMCP registrations.
 *
 * These definitions are forwarded to the browser's native
 * `document.modelContext.registerTool(...)` implementation. No production
 * polyfill or simulated discovery path exists.
 */

import {
  getModelContext,
  registerModelContextTool,
} from '../../webmcp/modelContext';
import { intentRuntime } from '../heap/intentRuntime';
import type { Intent } from '../heap/intentTypes';

let baseRegistrationPromise: Promise<void> | null = null;
let resumeAbortController: AbortController | null = null;

/** Structured failure payload so the agent can self-correct within one roundtrip. */
function toolError(
  code: string,
  message: string,
  recovery: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ok: false, error: code, message, ...recovery };
}

function intentNotFound(intentId: string): Record<string, unknown> {
  return toolError('intent_not_found', `No interrupted workflow is tracked under "${intentId}".`, {
    requestedIntentId: intentId,
    validIntentIds: intentRuntime.getAllIntents().map((intent) => intent.id),
    recoveryHint: 'Call list_active_intents to obtain a currently tracked intentId.',
  });
}

async function refreshAndGetIntent(intentId: string) {
  await intentRuntime.refreshFromServer();
  return intentRuntime.getIntent(intentId);
}

export function initializeWebMCPTools(): Promise<void> {
  if (baseRegistrationPromise) return baseRegistrationPromise;

  baseRegistrationPromise = (async () => {
    // Fail honestly when the browser does not implement WebMCP.
    if (!getModelContext()) throw new Error('Native document.modelContext is unavailable.');

    await registerModelContextTool({
      name: 'list_active_intents',
      title: 'List Interrupted Workflows',
      description:
        'Discover unfinished human workflows remembered by this application. Use first when the user asks what happened or wants to continue earlier work.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: async () => {
        const startedAt = performance.now();
        await intentRuntime.refreshFromServer();
        const intents = intentRuntime.getActiveIntents().map((intent) => ({
          intentId: intent.id,
          goal: intent.goal.description,
          status: intent.status,
          completedSteps: intent.progress.completedSteps,
          unfinishedStep: intent.progress.failedStep || intent.progress.gap,
          invariants: intent.invariants,
        }));
        const result = { intents, count: intents.length };
        intentRuntime.logToolCall(
          'list_active_intents',
          {},
          result,
          Math.max(1, Math.round(performance.now() - startedAt)),
          true
        );
        return result;
      },
    });

    await registerModelContextTool({
      name: 'inspect_intent',
      title: 'Inspect Interrupted Workflow',
      description:
        'Inspect an unfinished workflow, including the user goal, partial state, protected invariants, correlated HTTP failure, build, source location, and repair status.',
      inputSchema: {
        type: 'object',
        properties: {
          intentId: { type: 'string', description: 'Intent identifier returned by list_active_intents.' },
        },
        required: ['intentId'],
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async ({ intentId }) => {
        const startedAt = performance.now();
        const id = String(intentId);
        const intent = await refreshAndGetIntent(id);
        if (intent) {
          // Move the human UI to the same failing source line the agent is reading.
          intentRuntime.requestAgentUiFocus({
            target: 'recovery_drawer',
            intentId: id,
            highlight: 'failure_source',
            toolName: 'inspect_intent',
          });
        }
        const result = intent
          ? {
              intentId: intent.id,
              actor: intent.actor,
              goal: intent.goal,
              entities: intent.entities,
              progress: intent.progress,
              invariants: intent.invariants,
              status: intent.status,
              failure: intent.runtimeContext,
              repair: intentRuntime.getRepairJob(),
            }
          : intentNotFound(id);
        intentRuntime.logToolCall(
          'inspect_intent',
          { intentId: id },
          result,
          Math.max(1, Math.round(performance.now() - startedAt)),
          true
        );
        return result;
      },
    });

    await registerModelContextTool({
      name: 'add_user_context',
      title: 'Add Context to Interruption',
      description:
        'Attach a concise clarification of what the user expected or observed. This updates the interruption capsule only; it cannot edit code or deploy anything.',
      inputSchema: {
        type: 'object',
        properties: {
          intentId: { type: 'string', description: 'Interrupted intent identifier.' },
          text: { type: 'string', description: 'What the user expected or observed, up to 500 characters.' },
        },
        required: ['intentId', 'text'],
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async ({ intentId, text }) => {
        const startedAt = performance.now();
        const id = String(intentId);
        const note = String(text ?? '');
        const logAndReturn = (payload: Record<string, unknown>) => {
          intentRuntime.logToolCall(
            'add_user_context',
            { intentId: id, text: note },
            payload,
            Math.max(1, Math.round(performance.now() - startedAt)),
            false,
          );
          return payload;
        };

        if (note.trim().length === 0 || note.length > 500) {
          return logAndReturn(
            toolError('invalid_argument', 'Context text must be between 1 and 500 characters.', {
              field: 'text',
              validLength: [1, 500],
              receivedLength: note.length,
            }),
          );
        }

        if (!(await refreshAndGetIntent(id))) return logAndReturn(intentNotFound(id));

        const updated = await intentRuntime.appendIntentContext(id, note, 'agent');
        intentRuntime.requestAgentUiFocus({
          target: 'recovery_drawer',
          intentId: id,
          toolName: 'add_user_context',
        });
        return logAndReturn({
          intentId: id,
          accepted: true,
          context: updated.userContext?.at(-1),
          message: 'Context attached to the engineering packet.',
        });
      },
    });

    await registerModelContextTool({
      name: 'request_repair',
      title: 'Request Engineering Repair',
      description:
        'Refresh or explicitly request a scoped engineering repair artifact for a blocked intent. The server normally starts this job automatically when the failure is captured; this never deploys.',
      inputSchema: {
        type: 'object',
        properties: {
          intentId: { type: 'string', description: 'Blocked intent to package for engineering.' },
        },
        required: ['intentId'],
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async ({ intentId }) => {
        const startedAt = performance.now();
        const id = String(intentId);
        const logAndReturn = (payload: Record<string, unknown>) => {
          intentRuntime.logToolCall(
            'request_repair',
            { intentId: id },
            payload,
            Math.max(1, Math.round(performance.now() - startedAt)),
            false
          );
          return payload;
        };

        if (!(await refreshAndGetIntent(id))) return logAndReturn(intentNotFound(id));

        const repairJob = await intentRuntime.requestRepair(id);
        // Surface the sandbox transcript in the human review panel as it runs.
        intentRuntime.requestAgentUiFocus({
          target: 'repair_panel',
          intentId: id,
          highlight: 'sandbox_evidence',
          toolName: 'request_repair',
        });
        return logAndReturn({
          repairJob,
          message:
            repairJob.status === 'ready_for_review'
              ? 'The sandbox produced a validated artifact. Explicit deployment approval is still required.'
              : repairJob.status === 'failed'
                ? 'The sandbox stopped safely. Inspect executable evidence before retrying.'
                : 'The bounded repair worker is executing. Poll get_repair_status for command evidence.',
        });
      },
    });

    await registerModelContextTool({
      name: 'get_repair_status',
      title: 'Get Repair Status',
      description:
        'Check repair progress, sandbox command evidence, cleanup state, deployment state, and whether the interrupted workflow is resumable.',
      inputSchema: {
        type: 'object',
        properties: {
          intentId: { type: 'string', description: 'Intent whose repair status should be checked.' },
        },
        required: ['intentId'],
      },
      annotations: { readOnlyHint: true },
      execute: async ({ intentId }) => {
        const startedAt = performance.now();
        const id = String(intentId);
        const intent = await refreshAndGetIntent(id);
        const result = intent
          ? {
              intentId: id,
              intentStatus: intent.status,
              build: intentRuntime.getCurrentBuild(),
              repairJob: intentRuntime.getRepairJob(),
              resumable: intent.status === 'resumable',
            }
          : intentNotFound(id);
        intentRuntime.logToolCall(
          'get_repair_status',
          { intentId: id },
          result,
          Math.max(1, Math.round(performance.now() - startedAt)),
          true
        );
        return result;
      },
    });

    await registerModelContextTool({
      name: 'verify_intent',
      title: 'Verify Original Goal',
      description:
        'Verify from server-authoritative state whether the original human goal succeeded and its no-duplicate invariant remained intact.',
      inputSchema: {
        type: 'object',
        properties: {
          intentId: { type: 'string', description: 'Intent to verify.' },
        },
        required: ['intentId'],
      },
      annotations: { readOnlyHint: true },
      execute: async ({ intentId }) => {
        const startedAt = performance.now();
        const id = String(intentId);
        const intent = await refreshAndGetIntent(id);
        if (!intent) {
          const missing = intentNotFound(id);
          intentRuntime.logToolCall(
            'verify_intent',
            { intentId: id },
            missing,
            Math.max(1, Math.round(performance.now() - startedAt)),
            true
          );
          return missing;
        }
        const goalSatisfied = Boolean(
          intent.status === 'completed' && intent.progress.deliveryCompleted
        );
        intentRuntime.requestAgentUiFocus({
          target: 'recovery_drawer',
          intentId: id,
          highlight: 'verification',
          toolName: 'verify_intent',
        });
        const result = {
          intentId: id,
          goalSatisfied,
          successCondition: intent.goal.successCondition,
          invoiceCreateCount: intentRuntime.getInvoiceCreateCount(),
          invariantsPreserved: intentRuntime.getInvoiceCreateCount() === 1,
        };
        intentRuntime.logToolCall(
          'verify_intent',
          { intentId: id },
          result,
          Math.max(1, Math.round(performance.now() - startedAt)),
          true
        );
        return result;
      },
    });

    const activeIntent = intentRuntime.getActiveIntents()[0];
    await onIntentStatusChange(activeIntent || null);
  })().catch((error) => {
    baseRegistrationPromise = null;
    throw error;
  });

  return baseRegistrationPromise;
}

/** Keep the mutating resume capability absent until the repaired build is live. */
export async function onIntentStatusChange(intent: Intent | null): Promise<void> {
  if (intent?.status !== 'resumable') {
    if (resumeAbortController) {
      resumeAbortController.abort();
      resumeAbortController = null;
    }
    return;
  }

  if (resumeAbortController || !getModelContext()) return;
  const controller = new AbortController();
  resumeAbortController = controller;

  try {
    await registerModelContextTool(
      {
        name: 'resume_intent',
        title: 'Resume Repaired Workflow',
        description:
          'Resume only the unfinished delivery step after an approved repair is deployed. The server rejects blocked intents and duplicate invoice creation.',
        inputSchema: {
          type: 'object',
          properties: {
            intentId: { type: 'string', description: 'Resumable intent identifier.' },
          },
          required: ['intentId'],
        },
        annotations: { readOnlyHint: false },
        execute: async ({ intentId }) => {
          const startedAt = performance.now();
          const id = String(intentId);
          const current = await refreshAndGetIntent(id);
          if (!current) return intentNotFound(id);
          if (current.status !== 'resumable') {
            return toolError(
              'intent_not_resumable',
              'The server only resumes an intent after an approved repair is deployed.',
              {
                intentId: id,
                currentStatus: current.status,
                requiredStatus: 'resumable',
                recoveryHint: 'Call get_repair_status and wait for an approved deployment.',
              },
            );
          }

          const result = await intentRuntime.resumeIntent(id);
          intentRuntime.logToolCall(
            'resume_intent',
            { intentId: id },
            result,
            Math.max(1, Math.round(performance.now() - startedAt)),
            false
          );
          intentRuntime.requestAgentUiFocus({
            target: 'recovery_drawer',
            intentId: id,
            highlight: 'verification',
            toolName: 'resume_intent',
          });
          const response = {
            success: result.success,
            intentId: id,
            status: result.intent.status,
            completedOnlyMissingStep: true,
          };
          // Let the invocation result reach the browser agent before the tool's
          // AbortSignal removes resume_intent from the dynamic surface.
          setTimeout(() => void onIntentStatusChange(result.intent), 0);
          return response;
        },
      },
      { signal: controller.signal }
    );
  } catch (error) {
    if (resumeAbortController === controller) resumeAbortController = null;
    throw error;
  }
}

export function resetWebMCPRegistrationForTests(): void {
  baseRegistrationPromise = null;
  if (resumeAbortController) resumeAbortController.abort();
  resumeAbortController = null;
}
