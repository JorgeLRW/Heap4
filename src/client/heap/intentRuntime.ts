/**
 * Heap 4 client runtime.
 *
 * The browser keeps a render-friendly cache, while the same-origin server is the
 * authority for build state, partial invoice state, repair approval, and resume.
 */

import type { DemoApi, DemoBuild, DemoSessionState, RepairJob } from '../../shared/demoApiTypes';
import { httpDemoApi } from './demoApi';
import type { Intent, ToolActivityRecord } from './intentTypes';
import { onIntentStatusChange } from '../webmcp/registerTools';

export class IntentRuntime {
  private intents = new Map<string, Intent>();
  private listeners = new Set<() => void>();
  private toolLogs: ToolActivityRecord[] = [];
  private currentBuild: DemoBuild = 'demo-build-a';
  private repairJob: RepairJob | null = null;
  private invoiceCreateCount = 0;
  private api: DemoApi = httpDemoApi;

  public setApiForTesting(api: DemoApi): void {
    this.api = api;
  }

  public async hydrateFromServer(): Promise<void> {
    this.applyServerState(await this.api.getState());
  }

  public async refreshFromServer(): Promise<void> {
    this.applyServerState(await this.api.getState());
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

  /** Executes a genuine same-origin HTTP request that returns a controlled 500. */
  public async executeSendInvoiceWorkflow(
    intentId: string
  ): Promise<{ success: boolean; intent: Intent; error?: string }> {
    const intent = this.intents.get(intentId);
    if (!intent) throw new Error(`Intent ${intentId} not found`);

    const requestId = `req_${Math.floor(1000 + Math.random() * 9000)}`;
    const result = await this.api.sendInvoice(intent, requestId);
    this.applyServerState(result.state);
    const updated = this.intents.get(intentId);
    if (!updated) throw new Error(`Server did not return intent ${intentId}`);
    return { success: result.success, intent: updated, error: result.error };
  }

  /** Creates the bounded engineering handoff: diagnosis, patch, and regression test. */
  public async requestRepair(intentId: string): Promise<RepairJob> {
    const result = await this.api.requestRepair(intentId);
    this.applyServerState(result.state);
    return result.repairJob;
  }

  /** Explicit approval boundary; a proposed patch never deploys itself. */
  public async deployRepair(jobId?: string): Promise<DemoBuild> {
    const targetJobId = jobId || this.repairJob?.id;
    if (!targetJobId) throw new Error('No proposed repair is available to deploy.');
    const result = await this.api.deployRepair(targetJobId);
    this.applyServerState(result.state);
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
    this.applyServerState(await this.api.reset());
    await onIntentStatusChange(null);
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private applyServerState(state: DemoSessionState): void {
    this.currentBuild = state.build;
    this.repairJob = state.repairJob;
    this.invoiceCreateCount = state.invoiceCreateCount;
    this.intents.clear();
    if (state.intent) this.intents.set(state.intent.id, state.intent);
    this.notify();
  }

  private notify() {
    this.listeners.forEach((listener) => listener());
  }
}

export const intentRuntime = new IntentRuntime();
