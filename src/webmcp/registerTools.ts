/**
 * WebMCP Tool Registration Registry for Heap 4
 *
 * "Heap 4 gives the application memory. WebMCP gives the agent hands."
 * Exposes standard semantic tools on document.modelContext
 */

import { ensureModelContext } from './modelContext';
import { intentRuntime } from '../recovery/intentRuntime';

export function initializeWebMCPTools() {
  const ctx = ensureModelContext();

  // 1. list_active_intents
  ctx.registerTool({
    name: 'list_active_intents',
    description: 'Lists all active or interrupted human workflows on the current application. Use this when entering cold or when the user says "Finish what I was doing".',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      const list = intentRuntime.getActiveCapsules().map((c) => ({
        intentId: c.id,
        title: c.title,
        goal: c.goal,
        status: c.status,
        detectionSource: c.detectionSource || 'SERVER_ERROR',
        missingGap: c.workflow?.gap || c.progressSummary?.failureReason || 'Incomplete',
        invariants: c.invariants,
      }));
      return { activeIntents: list, count: list.length };
    },
  });

  // 2. inspect_intent
  ctx.registerTool({
    name: 'inspect_intent',
    description: 'Inspects full application context for an intent: goal, workspace, entities, completed steps, missing gap, invariants, and permitted recovery tools.',
    inputSchema: {
      type: 'object',
      properties: {
        intentId: {
          type: 'string',
          description: 'The unique intent identifier (e.g. "int_2841" or "int_3841")',
        },
      },
      required: ['intentId'],
    },
    execute: async ({ intentId }: { intentId: string }) => {
      const capsule = intentRuntime.getCapsule(intentId);
      if (!capsule) {
        return { error: `Intent "${intentId}" not found in application memory.` };
      }
      return {
        intentId: capsule.id,
        goal: capsule.goal,
        workspace: capsule.context?.workspace || 'Acme Corp',
        actor: capsule.context?.actor || { name: 'Jorge', role: 'member' },
        entities: capsule.context?.entities || [],
        workflow: {
          currentState: capsule.workflow?.currentState || 'INTERRUPTED',
          completedSteps: capsule.workflow?.completedSteps || capsule.progressSummary?.completedSteps || [],
          failedStep: capsule.workflow?.failedStep || capsule.progressSummary?.failedStep,
          missingGap: capsule.workflow?.gap || capsule.progressSummary?.failureReason || 'Action required',
        },
        detectionSource: capsule.detectionSource || 'SERVER_ERROR',
        currentState: capsule.currentState,
        invariants: capsule.invariants,
        allowedRecoveryActions: capsule.allowedRecoveryActions.map((a) => ({
          actionId: a.actionId,
          name: a.name,
          description: a.description,
          riskClass: a.riskClass || 'SAFE_MUTATION',
        })),
        verificationAssertion: capsule.verificationAssertion,
        incident: capsule.incident,
      };
    },
  });

  // 3. inspect_export_result (For Scenario 2: Silent 44-Row Drop)
  ctx.registerTool({
    name: 'inspect_export_result',
    description: 'Inspects the output of the recent CSV export, showing expected vs actual downloaded record counts and verification logs.',
    inputSchema: {
      type: 'object',
      properties: {
        reportId: { type: 'string', description: 'The report identifier (e.g. "q3-revenue")' },
      },
      required: ['reportId'],
    },
    execute: async ({ reportId }: { reportId: string }) => {
      return {
        reportId,
        serverStatus: '200 OK (No server error)',
        clientStatus: 'No exceptions thrown',
        expectedRows: 218,
        actualRowsDownloaded: 174,
        missingRows: 44,
        verificationStatus: 'FAILED_GOAL_VERIFICATION',
        diagnosticSummary: 'Pagination batch_04 was truncated during file streaming. Zero server exceptions raised.',
      };
    },
  });

  // 4. verify_intent_completion
  ctx.registerTool({
    name: 'verify_intent_completion',
    description: 'Verifies whether the human user\'s intended goal has actually been achieved on the live application state.',
    inputSchema: {
      type: 'object',
      properties: {
        intentId: {
          type: 'string',
          description: 'The unique intent identifier (e.g. "int_2841")',
        },
      },
      required: ['intentId'],
    },
    execute: async ({ intentId }: { intentId: string }) => {
      const capsule = intentRuntime.getCapsule(intentId);
      if (!capsule) {
        return { verified: false, error: `Intent "${intentId}" not found.` };
      }
      const verified = capsule.status === 'completed' || Boolean(capsule.currentState.emailSent);
      return {
        intentId,
        verified,
        status: verified ? 'PASS' : 'INCOMPLETE',
        assertion: capsule.verificationAssertion,
        message: verified
          ? `Goal successfully satisfied: ${capsule.goal}`
          : `Goal incomplete: Expected outcome condition not met.`,
      };
    },
  });

  console.log('[WebMCP] Base tools registered on document.modelContext');
}
