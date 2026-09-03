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
  type ModelContextTool,
} from '../../webmcp/modelContext';
import { intentRuntime } from '../heap/intentRuntime';
import type { Intent } from '../heap/intentTypes';

const dynamicControllers = new Map<DynamicToolName, AbortController>();

type DynamicToolName =
  | 'inspect_customer_delivery_policy'
  | 'list_authorized_contacts'
  | 'create_scoped_access_grant'
  | 'send_access_notice'
  | 'upload_invoice_to_procurement_portal'
  | 'revoke_access_grant'
  | 'resume_intent';

let baseRegistrationPromise: Promise<void> | null = null;

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

/** Grant metadata minus the token digest, which is never agent-visible. */
function describeAccessGrant() {
  const grant = intentRuntime.getAccessGrant();
  if (!grant) return null;
  return {
    id: grant.id,
    invoiceId: grant.invoiceId,
    audience: grant.audience,
    scope: grant.scope,
    issuedAt: grant.issuedAt,
    expiresAt: grant.expiresAt,
    issuedVia: grant.issuedVia,
    active: intentRuntime.hasUsableAccessGrant(),
    revokedAt: grant.revokedAt ?? null,
    revokedReason: grant.revokedReason ?? null,
    /** Server-authoritative fact for "did they already view it?" — never guessed by the agent. */
    firstAccessedAt: grant.firstAccessedAt ?? null,
  };
}

function describeRoutes(intent: Intent) {
  return {
    outcome: intent.goal.outcome,
    primary: intent.goal.primaryRoute,
    primaryRouteHealthy: intentRuntime.getCurrentBuild() === 'demo-build-b',
    alternates: intent.goal.alternateRoutes,
    outcomeReachedVia: intent.progress.goalSatisfiedVia ?? null,
  };
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
          outcome: intent.goal.outcome,
          status: intent.status,
          completedSteps: intent.progress.completedSteps,
          unfinishedStep: intent.progress.failedStep || intent.progress.gap,
          outcomeReachedVia: intent.progress.goalSatisfiedVia ?? null,
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
        'Inspect an unfinished workflow, including the user goal, which routes can still reach it, partial state, protected invariants, correlated HTTP failure, build, source location, and repair status.',
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
              routes: describeRoutes(intent),
              entities: intent.entities,
              progress: intent.progress,
              invariants: intent.invariants,
              status: intent.status,
              failure: intent.runtimeContext,
              accessGrant: describeAccessGrant(),
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
        'Verify from server-authoritative state whether the user\'s original outcome was reached, which route reached it, whether the primary route is repaired, and whether the no-duplicate invariant held.',
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
          intent.progress.deliveryCompleted ||
            (intentRuntime.hasUsableAccessGrant() && intentRuntime.getAccessNoticeReceipt()) ||
            intentRuntime.getProcurementPortalReceipt()
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
          outcome: intent.goal.outcome,
          outcomeReachedVia: intent.progress.goalSatisfiedVia ?? null,
          successCondition: intent.goal.successCondition,
          primaryRouteDelivered: intent.progress.deliveryCompleted,
          primaryRouteRepaired: intentRuntime.getCurrentBuild() === 'demo-build-b',
          outstandingAccessGrant: describeAccessGrant(),
          accessNoticeReceipt: intentRuntime.getAccessNoticeReceipt(),
          procurementPortalReceipt: intentRuntime.getProcurementPortalReceipt(),
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

/**
 * The dynamic surface is a pure function of server-authoritative state: each
 * capability is registered exactly while the server would authorize it, and
 * disappears the moment it would not.
 */
export async function onIntentStatusChange(intent: Intent | null): Promise<void> {
  const hasUsableGrant = intentRuntime.hasUsableAccessGrant();
  const hasAccessNotice = Boolean(intentRuntime.getAccessNoticeReceipt());
  const needsRecoveryPlan = intent?.status === 'blocked';
  const recoveryFactsRelevant = intent?.status === 'blocked' || intent?.status === 'mitigated';

  await Promise.all([
    syncDynamicTool(
      'inspect_customer_delivery_policy',
      recoveryFactsRelevant,
      buildInspectCustomerDeliveryPolicyTool,
    ),
    syncDynamicTool('list_authorized_contacts', recoveryFactsRelevant, buildListAuthorizedContactsTool),
    syncDynamicTool(
      'create_scoped_access_grant',
      Boolean(needsRecoveryPlan && !hasUsableGrant),
      buildCreateScopedAccessGrantTool,
    ),
    syncDynamicTool(
      'send_access_notice',
      Boolean(needsRecoveryPlan && hasUsableGrant && !hasAccessNotice),
      buildSendAccessNoticeTool,
    ),
    syncDynamicTool(
      'upload_invoice_to_procurement_portal',
      Boolean(needsRecoveryPlan),
      buildUploadInvoiceToProcurementPortalTool,
    ),
    syncDynamicTool('revoke_access_grant', hasUsableGrant, buildRevokeAccessGrantTool),
    syncDynamicTool('resume_intent', intent?.status === 'resumable', buildResumeTool),
  ]);
}

async function syncDynamicTool(
  name: DynamicToolName,
  shouldBeRegistered: boolean,
  build: () => ModelContextTool,
): Promise<void> {
  const existing = dynamicControllers.get(name);

  if (!shouldBeRegistered) {
    if (existing) {
      dynamicControllers.delete(name);
      existing.abort();
    }
    return;
  }

  if (existing || !getModelContext()) return;
  const controller = new AbortController();
  dynamicControllers.set(name, controller);

  try {
    await registerModelContextTool(build(), { signal: controller.signal });
  } catch (error) {
    if (dynamicControllers.get(name) === controller) dynamicControllers.delete(name);
    throw error;
  }
}

/** Returns policy evidence, not a site-authored recovery plan. */
function buildInspectCustomerDeliveryPolicyTool(): ModelContextTool {
  return {
    name: 'inspect_customer_delivery_policy',
    title: 'Inspect Customer Delivery Policy',
    description:
      'Read the customer-specific delivery policy as source evidence. Interpret it together with the user goal and available primitive tools; this does not return or select a recovery plan.',
    inputSchema: {
      type: 'object',
      properties: {
        intentId: { type: 'string', description: 'Intent whose customer delivery policy is needed.' },
      },
      required: ['intentId'],
    },
    annotations: { readOnlyHint: true },
    execute: async ({ intentId }) => {
      const startedAt = performance.now();
      const id = String(intentId);
      const intent = await refreshAndGetIntent(id);
      const policy = intentRuntime.getCustomerPolicy();
      const result = !intent
        ? intentNotFound(id)
        : !policy || policy.customerId !== intent.entities.customerId
          ? toolError('policy_not_found', `No customer delivery policy matches intent ${id}.`)
          : {
              intentId: id,
              customerId: policy.customerId,
              policyId: policy.id,
              version: policy.version,
              sourceText: policy.sourceText,
              rules: [policy.sourceText],
              notice:
                'This is policy evidence, not a recovery recommendation. Propose a plan from the evidence and available capabilities; every mutation is independently verified by the server.',
            };
      intentRuntime.logToolCall(
        'inspect_customer_delivery_policy',
        { intentId: id },
        result,
        Math.max(1, Math.round(performance.now() - startedAt)),
        true,
      );
      return result;
    },
  };
}

function buildListAuthorizedContactsTool(): ModelContextTool {
  return {
    name: 'list_authorized_contacts',
    title: 'List Customer Contacts',
    description:
      'List current customer contacts and their business roles. Contact presence is evidence, not authorization for a particular action; interpret the customer policy before choosing one.',
    inputSchema: {
      type: 'object',
      properties: {
        intentId: { type: 'string', description: 'Intent whose customer contacts should be listed.' },
      },
      required: ['intentId'],
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async ({ intentId }) => {
      const startedAt = performance.now();
      const id = String(intentId);
      const intent = await refreshAndGetIntent(id);
      const result = !intent
        ? intentNotFound(id)
        : {
            intentId: id,
            customerId: intent.entities.customerId,
            contacts: intentRuntime.getAuthorizedContacts().map((contact) => ({
              id: contact.id,
              name: contact.name,
              email: contact.email,
              role: contact.role,
              active: contact.active,
              notes: contact.notes,
            })),
          };
      intentRuntime.logToolCall(
        'list_authorized_contacts',
        { intentId: id },
        result,
        Math.max(1, Math.round(performance.now() - startedAt)),
        true,
      );
      return result;
    },
  };
}

/** Re-evaluates the surface after a tool call has already returned its result. */
function scheduleSurfaceSync(intent: Intent | null): void {
  setTimeout(() => void onIntentStatusChange(intent), 0);
}

/**
 * Present only while the primary route is broken and no share link is live.
 * This creates authority but does not deliver it or complete the outcome.
 */
function buildCreateScopedAccessGrantTool(): ModelContextTool {
  return {
    name: 'create_scoped_access_grant',
    title: 'Create Scoped Invoice Access',
    description:
      'Create one expiring, revocable, read-only grant for a chosen contact after explicit user confirmation. Supply the contact, scope, and duration you inferred from policy evidence. The server independently verifies every parameter.',
    inputSchema: {
      type: 'object',
      properties: {
        intentId: { type: 'string', description: 'Blocked intent whose outcome should be reached another way.' },
        contactId: { type: 'string', description: 'Contact selected from list_authorized_contacts.' },
        expirationMinutes: {
          type: 'number',
          description: 'Requested grant lifetime in whole minutes, inferred from customer policy.',
        },
        scope: {
          type: 'string',
          enum: ['read_invoice_only'],
          description: 'Narrow resource scope requested for the grant.',
        },
        userConfirmation: {
          type: 'string',
          description: 'The user\'s explicit confirmation to issue the secure share link, 3 to 200 characters.',
        },
      },
      required: ['intentId', 'contactId', 'expirationMinutes', 'scope', 'userConfirmation'],
    },
    annotations: { readOnlyHint: false },
    execute: async ({ intentId, contactId, expirationMinutes, scope, userConfirmation }) => {
      const startedAt = performance.now();
      const id = String(intentId);
      const confirmation = String(userConfirmation ?? '');
      const logAndReturn = (payload: Record<string, unknown>) => {
        intentRuntime.logToolCall(
          'create_scoped_access_grant',
          {
            intentId: id,
            contactId: String(contactId),
            expirationMinutes: Number(expirationMinutes),
            scope: String(scope),
            userConfirmation: '[redacted]',
          },
          // The capability URL is deliberately excluded from the audit log.
          { ...payload, accessUrl: undefined },
          Math.max(1, Math.round(performance.now() - startedAt)),
          false,
        );
        return payload;
      };

      const current = await refreshAndGetIntent(id);
      if (!current) return logAndReturn(intentNotFound(id));
      if (confirmation.trim().length < 3 || confirmation.length > 200) {
        return logAndReturn(toolError('user_confirmation_required', 'A 3 to 200 character explicit user confirmation is required.', {
          intentId: id,
          recoveryHint: 'Explain the proposed disclosure change and collect the user\'s confirmation.',
        }));
      }
      if (current.status !== 'blocked' && current.status !== 'mitigated') {
        return logAndReturn(
          toolError(
            'alternate_route_not_applicable',
            'The primary route is not broken, so no alternate route is needed.',
            {
              intentId: id,
              currentStatus: current.status,
              recoveryHint: 'Call inspect_intent to see which routes can still reach the outcome.',
            },
          ),
        );
      }

      let created;
      try {
        created = await intentRuntime.createScopedAccessGrant(
          id,
          String(contactId),
          Number(expirationMinutes),
          String(scope) as 'read_invoice_only',
          confirmation,
          'webmcp_agent',
        );
      } catch (error) {
        return logAndReturn(
          toolError('policy_verification_failed', error instanceof Error ? error.message : String(error), {
            intentId: id,
            recoveryHint:
              'Re-read the customer policy and contacts, inspect the remaining primitive tools, and propose a revised plan.',
          }),
        );
      }
      const { grant, accessUrl, intent: updated } = created;
      intentRuntime.requestAgentUiFocus({
        target: 'recovery_drawer',
        intentId: id,
        highlight: 'alternate_route',
        toolName: 'create_scoped_access_grant',
      });
      scheduleSurfaceSync(updated);

      return logAndReturn({
        intentId: id,
        outcomeReached: false,
        grantCreated: true,
        accessUrl,
        expiresAt: grant.expiresAt,
        scope: grant.scope,
        audience: grant.audience,
        primaryRouteStillBroken: true,
        repairStatus: intentRuntime.getRepairJob()?.status ?? 'not_started',
        handOff:
          'The grant exists but has not been delivered. Use an available delivery primitive that complies with customer policy.',
      });
    },
  };
}

function buildSendAccessNoticeTool(): ModelContextTool {
  return {
    name: 'send_access_notice',
    title: 'Send Access Notice',
    description:
      'Send a notice about an existing scoped access grant to a chosen contact. Supply the notice text and whether to attach the invoice; the server verifies grant audience, customer policy, and attachment rules before delivery.',
    inputSchema: {
      type: 'object',
      properties: {
        intentId: { type: 'string', description: 'Blocked intent with an existing scoped grant.' },
        contactId: { type: 'string', description: 'Recipient selected from customer contacts.' },
        message: { type: 'string', description: 'Notice text, 10 to 300 characters.' },
        includeAttachment: {
          type: 'boolean',
          description: 'Whether the finalized invoice should be attached to this notice.',
        },
      },
      required: ['intentId', 'contactId', 'message', 'includeAttachment'],
    },
    annotations: { readOnlyHint: false },
    execute: async ({ intentId, contactId, message, includeAttachment }) => {
      const startedAt = performance.now();
      const id = String(intentId);
      const recipientId = String(contactId);
      const notice = String(message ?? '');
      const attach = includeAttachment === true;
      const logAndReturn = (payload: Record<string, unknown>) => {
        intentRuntime.logToolCall(
          'send_access_notice',
          { intentId: id, contactId: recipientId, message: notice, includeAttachment: attach },
          payload,
          Math.max(1, Math.round(performance.now() - startedAt)),
          false,
        );
        return payload;
      };

      if (!(await refreshAndGetIntent(id))) return logAndReturn(intentNotFound(id));
      try {
        const { receipt, intent: updated } = await intentRuntime.sendAccessNotice(
          id,
          recipientId,
          notice,
          attach,
        );
        scheduleSurfaceSync(updated);
        return logAndReturn({
          ok: true,
          intentId: id,
          outcomeReached: true,
          via: 'secure_share_link',
          receipt,
          accessGrant: describeAccessGrant(),
          primaryRouteStillBroken: true,
        });
      } catch (error) {
        return logAndReturn(
          toolError('policy_verification_failed', error instanceof Error ? error.message : String(error), {
            intentId: id,
            recoveryHint:
              'Re-read the policy and grant audience, then revise the notice recipient, text, or attachment choice.',
          }),
        );
      }
    },
  };
}

function buildUploadInvoiceToProcurementPortalTool(): ModelContextTool {
  return {
    name: 'upload_invoice_to_procurement_portal',
    title: 'Upload Finalized Invoice to Procurement Portal',
    description:
      'Attempt to upload the existing finalized invoice to the customer procurement portal for a selected contact. The server verifies policy, contact eligibility, artifact identity, and channel availability. It may fail at runtime; observe the result and replan.',
    inputSchema: {
      type: 'object',
      properties: {
        intentId: { type: 'string', description: 'Blocked invoice delivery intent.' },
        contactId: { type: 'string', description: 'Contact selected from list_authorized_contacts.' },
      },
      required: ['intentId', 'contactId'],
    },
    annotations: { readOnlyHint: false },
    execute: async ({ intentId, contactId }) => {
      const startedAt = performance.now();
      const id = String(intentId);
      const selectedContactId = String(contactId);
      const logAndReturn = (payload: Record<string, unknown>) => {
        intentRuntime.logToolCall(
          'upload_invoice_to_procurement_portal',
          { intentId: id, contactId: selectedContactId },
          payload,
          Math.max(1, Math.round(performance.now() - startedAt)),
          false,
        );
        return payload;
      };
      if (!(await refreshAndGetIntent(id))) return logAndReturn(intentNotFound(id));
      try {
        const { receipt, intent: updated } = await intentRuntime.uploadInvoiceToProcurementPortal(
          id,
          selectedContactId,
        );
        scheduleSurfaceSync(updated);
        return logAndReturn({
          ok: true,
          intentId: id,
          outcomeReached: true,
          via: 'procurement_portal',
          receipt,
          primaryRouteStillBroken: true,
        });
      } catch (error) {
        return logAndReturn(
          toolError('capability_execution_failed', error instanceof Error ? error.message : String(error), {
            intentId: id,
            observedAt: new Date().toISOString(),
            recoveryHint:
              'This plan did not work. Re-read policy evidence and contacts, then use a different legal primitive if one remains.',
          }),
        );
      }
    },
  };
}

/** Present only while a usable share link exists, so a workaround is always retractable. */
function buildRevokeAccessGrantTool(): ModelContextTool {
  return {
    name: 'revoke_access_grant',
    title: 'Revoke the Share Link',
    description:
      'Revoke the share link issued as a workaround, for example once the primary route is repaired and the invoice has genuinely been sent. Access stops immediately.',
    inputSchema: {
      type: 'object',
      properties: {
        intentId: { type: 'string', description: 'Intent whose share link should be revoked.' },
        reason: { type: 'string', description: 'Why the workaround is no longer needed, up to 200 characters.' },
      },
      required: ['intentId', 'reason'],
    },
    annotations: { readOnlyHint: false },
    execute: async ({ intentId, reason }) => {
      const startedAt = performance.now();
      const id = String(intentId);
      const note = String(reason ?? '');
      const logAndReturn = (payload: Record<string, unknown>) => {
        intentRuntime.logToolCall(
          'revoke_access_grant',
          { intentId: id, reason: note },
          payload,
          Math.max(1, Math.round(performance.now() - startedAt)),
          false,
        );
        return payload;
      };

      if (note.trim().length === 0 || note.length > 200) {
        return logAndReturn(
          toolError('invalid_argument', 'A revocation reason of 1 to 200 characters is required.', {
            field: 'reason',
            validLength: [1, 200],
            receivedLength: note.length,
          }),
        );
      }
      if (!(await refreshAndGetIntent(id))) return logAndReturn(intentNotFound(id));

      const updated = await intentRuntime.revokeAlternateAccess(id, note);
      intentRuntime.requestAgentUiFocus({
        target: 'recovery_drawer',
        intentId: id,
        highlight: 'alternate_route',
        toolName: 'revoke_access_grant',
      });
      scheduleSurfaceSync(updated);

      return logAndReturn({
        intentId: id,
        revoked: true,
        status: updated.status,
        accessGrant: describeAccessGrant(),
      });
    },
  };
}

/** Present only while an approved repair has made the primary route usable again. */
function buildResumeTool(): ModelContextTool {
  return {
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
        false,
      );
      intentRuntime.requestAgentUiFocus({
        target: 'recovery_drawer',
        intentId: id,
        highlight: 'verification',
        toolName: 'resume_intent',
      });
      // Let this result reach the browser agent before the surface changes.
      scheduleSurfaceSync(result.intent);
      return {
        success: result.success,
        intentId: id,
        status: result.intent.status,
        completedOnlyMissingStep: true,
        outstandingAccessGrant: describeAccessGrant(),
      };
    },
  };
}

export function resetWebMCPRegistrationForTests(): void {
  baseRegistrationPromise = null;
  for (const controller of dynamicControllers.values()) controller.abort();
  dynamicControllers.clear();
}
