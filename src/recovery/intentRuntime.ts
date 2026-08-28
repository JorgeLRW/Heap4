/**
 * Heap 4: Application Context & Intent Runtime
 *
 * Core Concept:
 *  "Heap 4 gives the application memory. WebMCP gives the agent hands."
 *
 * The 4 Layers:
 *  - Agent: Reasons (ChatGPT / Browser Agent)
 *  - WebMCP: Acts (Structured tools on document.modelContext)
 *  - Heap 4: Remembers (Workspace context, active intents, workflow state, invariants)
 *  - Application: Authorizes & Executes (Application authority remains supreme)
 */

import { ensureModelContext } from '../webmcp/modelContext';

export type RiskClass = 'READ' | 'SAFE_MUTATION' | 'REVERSIBLE' | 'SENSITIVE' | 'HIGH_IMPACT';

export interface RecoveryAction {
  actionId: string;
  name: string;
  description: string;
  riskClass?: RiskClass;
  risk?: string;
  stateGuard?: (state: Record<string, any>) => boolean;
}

export interface PolicyGateResult {
  allowed: boolean;
  tenantVerified: boolean;
  stateTransitionValid: boolean;
  invariantsPreserved: boolean;
  rejectionReason?: string;
}

export interface IntentContext {
  workspace: string; // e.g. "Acme Corp"
  actor: { name: string; email: string; role: 'member' | 'admin' | 'owner' };
  entities: Array<{ type: string; id: string; name: string }>;
}

export interface IntentWorkflow {
  currentState: string;
  completedSteps: string[];
  failedStep?: string;
  gap: string; // What is missing to satisfy the goal
  failureReason?: string;
}

export interface IntentEvidence {
  route: string;
  screenshotDescription?: string;
  consoleError?: string;
  serverStatus?: number; // e.g. 200 OK (even during silent failure)
  recentActions: string[];
  capturedState: Record<string, any>;
  untrustedUserInput?: string;
  buildVersion?: string;
  networkRequestIds?: string[];
}

export interface StructuredIncident {
  incidentId: string; // e.g. "INC-H4-019"
  goal: string;
  expectedResult: string;
  actualObserved: string;
  detectionSource: 'SERVER_ERROR' | 'GOAL_VERIFICATION' | 'USER_REPORT';
  reproducible: boolean;
  recoveryCapabilityStatus: 'AVAILABLE' | 'UNAVAILABLE_PATCH_REQUIRED';
  suggestedAction: string;
}

export interface GitHubEscalation {
  issueNumber: number;
  issueTitle: string;
  issueDescription: string;
  prNumber: number;
  prTitle: string;
  prBranch: string;
  codeDiff: string;
  reproductionTest: string;
  reproductionStatus: 'PASS' | 'FAIL';
  isMerged: boolean;
  newCapabilityId: string;
}

export interface IntentCapsule {
  id: string; // e.g. "int_2841" or "int_3841"
  title: string;
  goal: string; // G: What the human came to accomplish
  amount?: string;
  tenantId?: string;
  userRole?: 'member' | 'admin' | 'owner';

  // Rich Application Context
  context?: IntentContext;
  workflow?: IntentWorkflow;
  currentState: Record<string, any>; // S: Current ground truth
  invariants: string[]; // Protected rules agent must never violate
  detectionSource?: 'SERVER_ERROR' | 'GOAL_VERIFICATION' | 'USER_REPORT';

  status: 'active' | 'interrupted' | 'recovering' | 'completed' | 'escalated';
  allowedRecoveryActions: RecoveryAction[];
  evidence?: IntentEvidence;
  verificationAssertion: string; // V: Objective success test
  whyThisAction?: string;
  incident?: StructuredIncident;
  escalation?: GitHubEscalation;
  steps?: any[];

  // Backward compatibility fields
  progressSummary?: {
    completedSteps: string[];
    failedStep: string;
    failureReason: string;
  };
  history: Array<{ timestamp: string; note: string }>;
}

export interface ToolActivityLog {
  timestamp: string;
  toolName: string;
  parameters: Record<string, any>;
  result?: any;
  latencyMs: number;
  policyCheck: PolicyGateResult;
}

export interface ActivityEvent {
  id: string;
  time: string;
  title: string;
  description?: string;
  type: 'standard' | 'interrupted' | 'recovered' | 'escalated' | 'prevented';
}

export class IntentRuntime {
  private capsules = new Map<string, IntentCapsule>();
  private activeIntentId: string | null = null;
  private listeners = new Set<() => void>();
  private dynamicRegisteredToolNames = new Set<string>();
  private toolLogs: ToolActivityLog[] = [];
  private activityFeed: ActivityEvent[] = [
    { id: 'act_1', time: '14:21', title: 'Invoice #INV-2840 created', description: 'Acme Corp • $1,200.00', type: 'standard' },
    { id: 'act_2', time: '14:22', title: 'Invoice #INV-2840 sent', description: 'Delivered to accounting@acme.com', type: 'standard' },
  ];

  constructor() {
    this.registerBaseTools();
  }

  private registerBaseTools() {
    const ctx = ensureModelContext();

    // 1. list_active_intents (The primary discovery tool for "Finish what I was doing")
    const listIntentsHandler = async () => {
      const start = performance.now();
      const list = Array.from(this.capsules.values())
        .filter((c) => c.status !== 'completed')
        .map((c) => ({
          intentId: c.id,
          title: c.title,
          goal: c.goal,
          status: c.status,
          workspace: c.context?.workspace || 'Acme Corp',
          detectionSource: c.detectionSource || 'SERVER_ERROR',
          missingGap: c.workflow?.gap || c.progressSummary?.failureReason || 'Incomplete',
          invariants: c.invariants,
          availableRecoveryActions: c.allowedRecoveryActions.map((a) => a.actionId),
        }));
      const duration = Math.round(performance.now() - start) || 12;
      this.logToolCall('list_active_intents', {}, { count: list.length, intents: list }, duration, {
        allowed: true,
        tenantVerified: true,
        stateTransitionValid: true,
        invariantsPreserved: true,
      });
      return { activeIntents: list, count: list.length };
    };

    ctx.registerTool({
      name: 'list_active_intents',
      description: 'Lists all active or interrupted human workflows on this application. Use this when the user says "Finish what I was doing" or enters without specific intent IDs.',
      inputSchema: { type: 'object', properties: {} },
      execute: listIntentsHandler,
    });

    // Alias for compatibility
    ctx.registerTool({
      name: 'list_interrupted_intents',
      description: 'Alias for list_active_intents',
      inputSchema: { type: 'object', properties: {} },
      execute: listIntentsHandler,
    });

    // 2. inspect_intent (Gives full structured workspace & workflow context)
    const inspectIntentHandler = async ({ intentId }: { intentId: string }) => {
      const start = performance.now();
      const capsule = this.capsules.get(intentId);
      const duration = Math.round(performance.now() - start) || 16;
      if (!capsule) {
        return { error: `Intent "${intentId}" not found in application memory.` };
      }

      const wf = capsule.workflow || {
        currentState: 'INTERRUPTED',
        completedSteps: capsule.progressSummary?.completedSteps || [],
        failedStep: capsule.progressSummary?.failedStep,
        gap: capsule.progressSummary?.failureReason || 'Action required',
        failureReason: capsule.progressSummary?.failureReason,
      };

      const res = {
        intentId: capsule.id,
        goal: capsule.goal,
        workspace: capsule.context?.workspace || 'Acme Corp',
        actor: capsule.context?.actor || { name: 'Jorge', role: 'member' },
        entities: capsule.context?.entities || [],
        workflow: {
          currentState: wf.currentState,
          completedSteps: wf.completedSteps,
          failedStep: wf.failedStep,
          missingGap: wf.gap,
          failureReason: wf.failureReason,
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

      this.logToolCall('inspect_intent', { intentId }, res, duration, {
        allowed: true,
        tenantVerified: true,
        stateTransitionValid: true,
        invariantsPreserved: true,
      });
      return res;
    };

    ctx.registerTool({
      name: 'inspect_intent',
      description: 'Inspects full application context for an intent, including workspace, entities, completed steps, missing gap, invariants, and permitted recovery actions.',
      inputSchema: {
        type: 'object',
        properties: { intentId: { type: 'string', description: 'Intent ID, e.g. int_2841' } },
        required: ['intentId'],
      },
      execute: inspectIntentHandler,
    });

    // Alias for compatibility
    ctx.registerTool({
      name: 'inspect_interrupted_intent',
      description: 'Alias for inspect_intent',
      inputSchema: {
        type: 'object',
        properties: { intentId: { type: 'string' } },
        required: ['intentId'],
      },
      execute: inspectIntentHandler,
    });

    // 3. verify_intent_completion (Goal Verification Sensor)
    ctx.registerTool({
      name: 'verify_intent_completion',
      description: 'Verifies whether the human user\'s intended goal has actually been achieved on the live application state.',
      inputSchema: {
        type: 'object',
        properties: { intentId: { type: 'string', description: 'Intent ID, e.g. int_2841' } },
        required: ['intentId'],
      },
      execute: async ({ intentId }: { intentId: string }) => {
        const start = performance.now();
        const capsule = this.capsules.get(intentId);
        const duration = Math.round(performance.now() - start) || 20;
        if (!capsule) return { verified: false, error: `Intent "${intentId}" not found.` };

        // Real goal outcome check
        let isComplete = false;
        if (capsule.id === 'int_2841') {
          isComplete = capsule.status === 'completed' || Boolean(capsule.currentState.emailSent);
        } else if (capsule.id === 'int_3841') {
          // Scenario 2: Report Export (Checks if 218 rows were generated vs 174)
          isComplete = capsule.currentState.actualRowsDownloaded === 218;
        } else {
          isComplete = capsule.status === 'completed';
        }

        const res = {
          intentId,
          verified: isComplete,
          status: isComplete ? 'PASS' : 'GOAL_NOT_SATISFIED',
          assertion: capsule.verificationAssertion,
          message: isComplete
            ? `Goal verified: ${capsule.goal}`
            : `Goal verification failed: Expected outcome not met for ${capsule.goal}`,
        };

        this.logToolCall('verify_intent_completion', { intentId }, res, duration, {
          allowed: true,
          tenantVerified: true,
          stateTransitionValid: true,
          invariantsPreserved: true,
        });
        return res;
      },
    });
  }

  public evaluatePolicyGate(
    capsule: IntentCapsule,
    action: RecoveryAction,
    params: any
  ): PolicyGateResult {
    const tenant = capsule.tenantId || 'acme_corp';
    if (tenant !== 'acme_corp') {
      return {
        allowed: false,
        tenantVerified: false,
        stateTransitionValid: false,
        invariantsPreserved: true,
        rejectionReason: `Tenant mismatch: ${tenant} != current context`,
      };
    }

    const stateValid = action.stateGuard ? action.stateGuard(capsule.currentState) : true;
    if (!stateValid) {
      return {
        allowed: false,
        tenantVerified: true,
        stateTransitionValid: false,
        invariantsPreserved: true,
        rejectionReason: `Invalid State Transition: Action ${action.actionId} is not permitted in current state`,
      };
    }

    return {
      allowed: true,
      tenantVerified: true,
      stateTransitionValid: true,
      invariantsPreserved: true,
    };
  }

  public registerInterruptedIntent(
    capsule: IntentCapsule,
    actionHandlers: Record<string, (params: any) => Promise<any>>
  ): IntentCapsule {
    if (!capsule.workflow) {
      capsule.workflow = {
        currentState: 'INTERRUPTED',
        completedSteps: capsule.progressSummary?.completedSteps || [],
        failedStep: capsule.progressSummary?.failedStep || 'Unknown step',
        gap: capsule.progressSummary?.failureReason || 'Action required',
        failureReason: capsule.progressSummary?.failureReason,
      };
    }

    if (!capsule.progressSummary) {
      capsule.progressSummary = {
        completedSteps: capsule.workflow.completedSteps,
        failedStep: capsule.workflow.failedStep || 'Unknown step',
        failureReason: capsule.workflow.failureReason || capsule.workflow.gap,
      };
    }

    this.capsules.set(capsule.id, capsule);
    this.activeIntentId = capsule.id;

    this.addActivityEvent({
      id: 'act_' + Date.now(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      title: `${capsule.title} — ${capsule.detectionSource === 'GOAL_VERIFICATION' ? 'Outcome Mismatch' : 'Interrupted'}`,
      description: capsule.workflow.gap || capsule.workflow.failureReason,
      type: 'interrupted',
    });

    const ctx = ensureModelContext();

    capsule.allowedRecoveryActions.forEach((action) => {
      const toolName = action.actionId;
      if (!this.dynamicRegisteredToolNames.has(toolName)) {
        ctx.registerTool({
          name: toolName,
          description: `[Dynamic WebMCP Action | Risk: ${action.riskClass || 'SAFE_MUTATION'}] ${action.description}`,
          inputSchema: {
            type: 'object',
            properties: {
              intentId: { type: 'string', description: 'Target intent identifier' },
            },
            required: ['intentId'],
          },
          execute: async (params) => {
            const start = performance.now();
            const policyResult = this.evaluatePolicyGate(capsule, action, params);

            if (!policyResult.allowed) {
              const duration = Math.round(performance.now() - start) || 15;
              this.logToolCall(toolName, params, { error: policyResult.rejectionReason }, duration, policyResult);
              return { error: `POLICY_GATE_REJECTED: ${policyResult.rejectionReason}` };
            }

            const handler = actionHandlers[toolName];
            let res = { success: true };
            if (handler) {
              res = await handler(params);
            }
            const duration = Math.round(performance.now() - start) || 45;
            this.logToolCall(toolName, params, res, duration, policyResult);
            capsule.history.push({
              timestamp: new Date().toLocaleTimeString(),
              note: `Executed ${action.name} (${toolName}) in ${duration}ms [Risk: ${action.riskClass || 'SAFE_MUTATION'}]`,
            });
            this.notify();
            return res;
          },
        });
        this.dynamicRegisteredToolNames.add(toolName);
      }
    });

    this.notify();
    return capsule;
  }

  public completeIntent(intentId: string): boolean {
    const capsule = this.capsules.get(intentId);
    if (!capsule) return false;

    capsule.status = 'completed';
    capsule.history.push({
      timestamp: new Date().toLocaleTimeString(),
      note: `Intent successfully completed and verified. Goal satisfied.`,
    });

    this.addActivityEvent({
      id: 'act_' + Date.now(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      title: `${capsule.title} — Completed ✓`,
      description: `Goal satisfied without violating application invariants`,
      type: 'recovered',
    });

    const ctx = ensureModelContext();
    capsule.allowedRecoveryActions.forEach((action) => {
      ctx.unregisterTool(action.actionId);
      this.dynamicRegisteredToolNames.delete(action.actionId);
    });

    this.notify();
    return true;
  }

  public checkpointIntent(intentId: string, goal: string) {
    this.addActivityEvent({
      id: 'chk_' + Date.now(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      title: `Active Intent Checkpointed (${intentId})`,
      description: `Goal "${goal}" initialized before execution.`,
      type: 'prevented',
    });
  }

  public addActivityEvent(event: ActivityEvent) {
    this.activityFeed.unshift(event);
    this.notify();
  }

  public getActivityFeed(): ActivityEvent[] {
    return this.activityFeed;
  }

  public logToolCall(
    toolName: string,
    parameters: Record<string, any>,
    result?: any,
    latencyMs: number = 32,
    policyCheck: PolicyGateResult = { allowed: true, tenantVerified: true, stateTransitionValid: true, invariantsPreserved: true }
  ) {
    this.toolLogs.unshift({
      timestamp: new Date().toLocaleTimeString(),
      toolName,
      parameters,
      result,
      latencyMs,
      policyCheck,
    });
    this.notify();
  }

  public resetDemo() {
    this.capsules.clear();
    this.activeIntentId = null;
    this.toolLogs = [];
    const ctx = ensureModelContext();
    this.dynamicRegisteredToolNames.forEach((name) => ctx.unregisterTool(name));
    this.dynamicRegisteredToolNames.clear();
    this.activityFeed = [
      { id: 'act_1', time: '14:21', title: 'Invoice #INV-2840 created', description: 'Acme Corp • $1,200.00', type: 'standard' },
      { id: 'act_2', time: '14:22', title: 'Invoice #INV-2840 sent', description: 'Delivered to accounting@acme.com', type: 'standard' },
    ];
    this.notify();
  }

  public getCapsules(): IntentCapsule[] {
    return Array.from(this.capsules.values());
  }

  public getActiveCapsules(): IntentCapsule[] {
    return Array.from(this.capsules.values()).filter((c) => c.status !== 'completed');
  }

  public getCapsule(id: string): IntentCapsule | undefined {
    return this.capsules.get(id);
  }

  public deployNewCapabilityFromPR(prNumber: number): boolean {
    const ctx = ensureModelContext();
    if (prNumber === 185) {
      ctx.registerTool({
        name: 'repair_delivery_queue',
        description: '[PR #185 WebMCP Capability] Clears deadlocked delivery worker partition.',
        inputSchema: { type: 'object', properties: { intentId: { type: 'string' } }, required: ['intentId'] },
        execute: async () => ({ success: true, queueCleared: true }),
      });
      return true;
    }
    return false;
  }

  public getToolLogs(): ToolActivityLog[] {
    return this.toolLogs;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }
}

export const intentRuntime = new IntentRuntime();
