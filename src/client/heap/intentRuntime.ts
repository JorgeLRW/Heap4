/**
 * Heap 4 client runtime.
 *
 * The browser keeps a render-friendly cache, while the same-origin server is the
 * authority for build state, partial invoice state, repair approval, and resume.
 */

import type {
  DemoApi,
  DemoBuild,
  DemoSessionState,
  InvoiceAccessGrant,
  InvoiceAccessView,
  RepairJob,
} from '../../shared/demoApiTypes';
import { evaluateGrantUsability } from '../../shared/accessGrants';
import { httpDemoApi } from './demoApi';
import type { Intent, ToolActivityRecord } from './intentTypes';
import { onIntentStatusChange } from '../webmcp/registerTools';

/** A request from an agent tool call to move the human UI to the relevant surface. */
export interface AgentUiFocus {
  target: 'recovery_drawer' | 'repair_panel';
  intentId: string;
  highlight?: 'failure_source' | 'sandbox_evidence' | 'verification' | 'alternate_route';
  toolName: string;
  at: number;
}

export class IntentRuntime {
  private intents = new Map<string, Intent>();
  private listeners = new Set<() => void>();
  private focusListeners = new Set<(focus: AgentUiFocus) => void>();
  private lastAgentUiFocus: AgentUiFocus | null = null;
  private toolLogs: ToolActivityRecord[] = [];
  private currentBuild: DemoBuild = 'demo-build-a';
  private repairJob: RepairJob | null = null;
  private accessGrant: InvoiceAccessGrant | null = null;
  /** Held in memory only; the plaintext token is never persisted server-side. */
  private lastIssuedAccessUrl: string | null = null;
  private invoiceCreateCount = 0;
  private api: DemoApi = httpDemoApi;
  private repairPollTimer: ReturnType<typeof setInterval> | null = null;

  public setApiForTesting(api: DemoApi): void {
    this.api = api;
  }

  public async hydrateFromServer(): Promise<void> {
    this.applyServerState(await this.api.getState());
    this.syncRepairPolling();
  }

  public async refreshFromServer(): Promise<void> {
    this.applyServerState(await this.api.getState());
    this.syncRepairPolling();
  }

  public createIntent(intent: Intent): Intent {
    this.intents.set(intent.id, intent);
    this.notify();
    void onIntentStatusChange(intent);
    return intent;
  }

  public getIntent(id: string): Intent | undefined {
    return this.intents.get(id);
  }

  public getActiveIntents(): Intent[] {
    return Array.from(this.intents.values()).filter((intent) => intent.status !== 'completed');
  }

  public getAllIntents(): Intent[] {
    return Array.from(this.intents.values());
  }

  public getCurrentBuild(): DemoBuild {
    return this.currentBuild;
  }

  public getRepairJob(): RepairJob | null {
    return this.repairJob;
  }

  public getInvoiceCreateCount(): number {
    return this.invoiceCreateCount;
  }

  public getAccessGrant(): InvoiceAccessGrant | null {
    return this.accessGrant;
  }

  public hasUsableAccessGrant(): boolean {
    return Boolean(this.accessGrant && evaluateGrantUsability(this.accessGrant).usable);
  }

  public getLastIssuedAccessUrl(): string | null {
    return this.lastIssuedAccessUrl;
  }

  /** Executes a genuine same-origin HTTP request that returns a controlled 500. */
  public async executeSendInvoiceWorkflow(
    intentId: string
  ): Promise<{ success: boolean; intent: Intent; error?: string }> {
    const intent = this.intents.get(intentId);
    if (!intent) throw new Error(`Intent ${intentId} not found`);

    const requestId = `req_${Math.floor(1000 + Math.random() * 9000)}`;
    const result = await this.api.sendInvoice(intent, requestId);
    this.applyServerState(result.state);
    this.syncRepairPolling();
    const updated = this.intents.get(intentId);
    if (!updated) throw new Error(`Server did not return intent ${intentId}`);
    return { success: result.success, intent: updated, error: result.error };
  }

  /** Creates the bounded engineering handoff: diagnosis, patch, and regression test. */
  public async requestRepair(intentId: string): Promise<RepairJob> {
    const result = await this.api.requestRepair(intentId);
    this.applyServerState(result.state);
    this.syncRepairPolling();
    return result.repairJob;
  }

  public async appendIntentContext(intentId: string, text: string, source: 'user' | 'agent' = 'user'): Promise<Intent> {
    const result = await this.api.appendIntentContext(intentId, text, source);
    this.applyServerState(result.state);
    const intent = this.intents.get(intentId);
    if (!intent) throw new Error(`Server did not return intent ${intentId}`);
    return intent;
  }

  /** Explicit approval boundary; a proposed patch never deploys itself. */
  public async deployRepair(jobId?: string): Promise<DemoBuild> {
    const targetJobId = jobId || this.repairJob?.id;
    if (!targetJobId) throw new Error('No proposed repair is available to deploy.');
    const result = await this.api.deployRepair(targetJobId);
    this.applyServerState(result.state);
    this.syncRepairPolling();
    const intent = result.state.intent;
    if (intent) await onIntentStatusChange(intent);
    return result.state.build;
  }

  /** Resumes only the missing delivery step on the server. */
  public async resumeIntent(intentId: string): Promise<{ success: boolean; intent: Intent }> {
    const result = await this.api.resumeIntent(intentId);
    this.applyServerState(result.state);
    const intent = this.intents.get(intentId);
    if (!intent) throw new Error(`Server did not return intent ${intentId}`);
    return { success: result.success, intent };
  }

  /** Reaches the user's outcome through the allowlisted alternate route. */
  public async grantAlternateAccess(
    intentId: string,
    issuedVia: 'webmcp_agent' | 'user' = 'user',
  ): Promise<{ grant: InvoiceAccessGrant; accessUrl: string; intent: Intent }> {
    const result = await this.api.grantAlternateAccess(intentId, issuedVia);
    this.lastIssuedAccessUrl = result.accessUrl;
    this.applyServerState(result.state);
    const intent = this.intents.get(intentId);
    if (!intent) throw new Error(`Server did not return intent ${intentId}`);
    return { grant: result.grant, accessUrl: result.accessUrl, intent };
  }

  public async revokeAlternateAccess(intentId: string, reason: string): Promise<Intent> {
    const result = await this.api.revokeAlternateAccess(intentId, reason);
    this.lastIssuedAccessUrl = null;
    this.applyServerState(result.state);
    const intent = this.intents.get(intentId);
    if (!intent) throw new Error(`Server did not return intent ${intentId}`);
    return intent;
  }

  public readInvoiceByAccessToken(
    token: string,
  ): Promise<{ success: boolean; invoice?: InvoiceAccessView; error?: string }> {
    return this.api.readInvoiceByAccessToken(token);
  }

  public logToolCall(
    toolName: string,
    parameters: Record<string, unknown>,
    result: unknown,
    latencyMs = 1,
    readOnly = true
  ) {
    this.toolLogs.unshift({
      timestamp: new Date().toLocaleTimeString(),
      toolName,
      parameters,
      result,
      latencyMs,
      readOnly,
    });
    this.notify();
  }

  public getToolLogs(): ToolActivityRecord[] {
    return this.toolLogs;
  }

  public async resetDemo(): Promise<void> {
    this.toolLogs = [];
    this.lastAgentUiFocus = null;
    this.lastIssuedAccessUrl = null;
    this.stopRepairPolling();
    this.applyServerState(await this.api.reset());
    await onIntentStatusChange(null);
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Lets an agent tool call actuate the human UI instead of only returning JSON. */
  public requestAgentUiFocus(focus: Omit<AgentUiFocus, 'at'>): void {
    const enriched: AgentUiFocus = { ...focus, at: Date.now() };
    this.lastAgentUiFocus = enriched;
    this.focusListeners.forEach((listener) => listener(enriched));
  }

  public getLastAgentUiFocus(): AgentUiFocus | null {
    return this.lastAgentUiFocus;
  }

  public subscribeAgentUiFocus(listener: (focus: AgentUiFocus) => void): () => void {
    this.focusListeners.add(listener);
    return () => this.focusListeners.delete(listener);
  }

  private applyServerState(state: DemoSessionState): void {
    this.currentBuild = state.build;
    this.repairJob = state.repairJob;
    this.accessGrant = state.accessGrant;
    this.invoiceCreateCount = state.invoiceCreateCount;
    this.intents.clear();
    if (state.intent) this.intents.set(state.intent.id, state.intent);
    this.notify();
    void onIntentStatusChange(state.intent || null);
  }

  private syncRepairPolling(): void {
    const job = this.repairJob;
    const terminal = !job || ['ready_for_review', 'approved_and_deployed', 'failed'].includes(job.status);
    if (terminal) {
      this.stopRepairPolling();
      return;
    }
    if (this.repairPollTimer) return;
    this.repairPollTimer = setInterval(() => {
      void this.refreshFromServer().catch((error) => {
        console.warn('[Heap 4] Repair status refresh failed:', error);
      });
    }, 900);
  }

  private stopRepairPolling(): void {
    if (!this.repairPollTimer) return;
    clearInterval(this.repairPollTimer);
    this.repairPollTimer = null;
  }

  private notify() {
    this.listeners.forEach((listener) => listener());
  }
}

export const intentRuntime = new IntentRuntime();
