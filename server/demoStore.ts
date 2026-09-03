import type { Intent } from '../src/client/heap/intentTypes';
import { digestsMatch, hashAccessToken } from '../src/shared/accessGrants';
import type {
  DemoApi,
  DemoSessionState,
  InvoiceAccessView,
  RepairJob,
} from '../src/shared/demoApiTypes';
import {
  cloneDemoState,
  createInitialDemoState,
  appendIntentContextTransition,
  createScopedAccessGrantTransition,
  deployRepairTransition,
  readInvoiceByGrant,
  requestRepairTransition,
  resumeIntentTransition,
  revokeAlternateAccessTransition,
  setRecoveryScenarioTransition,
  sendInvoiceTransition,
  toAccessView,
  uploadInvoiceToProcurementPortalTransition,
} from '../src/shared/demoTransitions';
import type { RecoveryScenarioId } from '../src/shared/demoApiTypes';
import { executeRepairPipeline } from '../src/shared/repairSandboxExecution';
import { LocalRepairSandbox } from './localRepairSandbox';

export class DemoStore {
  private sessions = new Map<string, DemoSessionState>();
  private repairRuns = new Map<string, Promise<RepairJob>>();
  /** Capability-token digest to owning session, so a share link needs no session header. */
  private grantIndex = new Map<string, string>();

  getState(sessionId: string): DemoSessionState {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, createInitialDemoState(sessionId));
    }
    const state = this.sessions.get(sessionId)!;
    return cloneDemoState(state);
  }

  reset(sessionId: string): DemoSessionState {
    const previous = this.sessions.get(sessionId);
    if (previous?.accessGrant) this.grantIndex.delete(previous.accessGrant.tokenHash);
    const state = createInitialDemoState(sessionId);
    this.sessions.set(sessionId, state);
    return cloneDemoState(state);
  }

  sendInvoice(sessionId: string, intent: Intent, requestId: string) {
    return sendInvoiceTransition(this.mutableState(sessionId), intent, requestId);
  }

  requestRepair(sessionId: string, intentId: string) {
    return requestRepairTransition(this.mutableState(sessionId), intentId);
  }

  appendIntentContext(sessionId: string, intentId: string, text: string, source: 'user' | 'agent' = 'user') {
    return appendIntentContextTransition(this.mutableState(sessionId), intentId, text, source);
  }

  deployRepair(sessionId: string, repairJobId: string) {
    return deployRepairTransition(this.mutableState(sessionId), repairJobId);
  }

  resumeIntent(sessionId: string, intentId: string) {
    return resumeIntentTransition(this.mutableState(sessionId), intentId);
  }

  setRecoveryScenario(sessionId: string, scenario: RecoveryScenarioId) {
    return setRecoveryScenarioTransition(this.mutableState(sessionId), scenario).state;
  }

  async createScopedAccessGrant(
    sessionId: string,
    intentId: string,
    contactId: string,
    expirationMinutes: number,
    scope: 'read_invoice_only',
    issuedVia: 'webmcp_agent' | 'user',
    userConfirmation: string,
  ) {
    const result = await createScopedAccessGrantTransition(
      this.mutableState(sessionId),
      intentId,
      contactId,
      expirationMinutes,
      scope,
      issuedVia,
      userConfirmation,
    );
    this.grantIndex.set(result.grant.tokenHash, sessionId);
    return result;
  }

  uploadInvoiceToProcurementPortal(sessionId: string, intentId: string, contactId: string) {
    return uploadInvoiceToProcurementPortalTransition(
      this.mutableState(sessionId),
      intentId,
      contactId,
    );
  }

  revokeAlternateAccess(sessionId: string, intentId: string, reason: string) {
    const state = this.mutableState(sessionId);
    const tokenHash = state.accessGrant?.tokenHash;
    const result = revokeAlternateAccessTransition(state, intentId, reason);
    if (tokenHash) this.grantIndex.delete(tokenHash);
    return result;
  }

  async readInvoiceByAccessToken(
    token: string,
  ): Promise<{ success: boolean; invoice?: InvoiceAccessView; error?: string }> {
    const presentedHash = await hashAccessToken(token);
    const sessionId = this.grantIndex.get(presentedHash);
    const state = sessionId ? this.sessions.get(sessionId) : undefined;
    if (!state?.accessGrant || !digestsMatch(state.accessGrant.tokenHash, presentedHash)) {
      return { success: false, error: 'This share link is not valid.' };
    }

    const resolved = readInvoiceByGrant(state);
    if (!resolved.success) return { success: false, error: resolved.error };
    return { success: true, invoice: toAccessView(resolved.invoice, resolved.grant.expiresAt) };
  }

  async startRepair(sessionId: string): Promise<RepairJob> {
    const existingRun = this.repairRuns.get(sessionId);
    if (existingRun) return existingRun;

    const state = this.mutableState(sessionId);
    const repairJob = state.repairJob;
    if (!repairJob) throw new Error('No repair job is available to execute.');
    if (['ready_for_review', 'approved_and_deployed', 'failed'].includes(repairJob.status)) {
      return cloneDemoState(repairJob);
    }

    const run = executeRepairPipeline(
      repairJob,
      new LocalRepairSandbox(repairJob.sandbox.id),
      (checkpoint) => {
        const latest = this.mutableState(sessionId);
        if (latest.repairJob?.id === checkpoint.id) {
          latest.repairJob = cloneDemoState(checkpoint);
        }
      },
    );
    this.repairRuns.set(sessionId, run);

    try {
      return await run;
    } finally {
      if (this.repairRuns.get(sessionId) === run) this.repairRuns.delete(sessionId);
    }
  }

  private mutableState(sessionId: string): DemoSessionState {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, createInitialDemoState(sessionId));
    }
    return this.sessions.get(sessionId)!;
  }
}

/** Adapter used by deterministic tests without opening a network port. */
export class InMemoryDemoApi implements DemoApi {
  constructor(
    private readonly store = new DemoStore(),
    private readonly sessionId = 'h4_test_session',
  ) {}

  async reset() {
    return this.store.reset(this.sessionId);
  }

  async getState() {
    return this.store.getState(this.sessionId);
  }

  async sendInvoice(intent: Intent, requestId: string) {
    const result = this.store.sendInvoice(this.sessionId, intent, requestId);
    if (!result.success) {
      void this.store.startRepair(this.sessionId).catch(() => undefined);
    }
    return result;
  }

  async requestRepair(intentId: string) {
    this.store.requestRepair(this.sessionId, intentId);
    const repairJob = await this.store.startRepair(this.sessionId);
    return {
      success: true,
      state: this.store.getState(this.sessionId),
      repairJob,
    };
  }

  async appendIntentContext(intentId: string, text: string, source: 'user' | 'agent' = 'user') {
    return this.store.appendIntentContext(this.sessionId, intentId, text, source);
  }

  async deployRepair(jobId: string) {
    return this.store.deployRepair(this.sessionId, jobId);
  }

  async resumeIntent(intentId: string) {
    return this.store.resumeIntent(this.sessionId, intentId);
  }

  async setRecoveryScenario(scenario: RecoveryScenarioId) {
    return this.store.setRecoveryScenario(this.sessionId, scenario);
  }

  async createScopedAccessGrant(
    intentId: string,
    contactId: string,
    expirationMinutes: number,
    scope: 'read_invoice_only',
    issuedVia: 'webmcp_agent' | 'user',
    userConfirmation: string,
  ) {
    return this.store.createScopedAccessGrant(
      this.sessionId,
      intentId,
      contactId,
      expirationMinutes,
      scope,
      issuedVia,
      userConfirmation,
    );
  }

  async uploadInvoiceToProcurementPortal(intentId: string, contactId: string) {
    return this.store.uploadInvoiceToProcurementPortal(this.sessionId, intentId, contactId);
  }

  async revokeAlternateAccess(intentId: string, reason: string) {
    return this.store.revokeAlternateAccess(this.sessionId, intentId, reason);
  }

  async readInvoiceByAccessToken(token: string) {
    return this.store.readInvoiceByAccessToken(token);
  }
}
