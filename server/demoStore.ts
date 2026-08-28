import type { Intent } from '../src/client/heap/intentTypes';
import type { DemoApi, DemoSessionState } from '../src/shared/demoApiTypes';
import {
  cloneDemoState,
  createInitialDemoState,
  appendIntentContextTransition,
  deployRepairTransition,
  requestRepairTransition,
  resumeIntentTransition,
  sendInvoiceTransition,
} from '../src/shared/demoTransitions';
import { advanceRepairState } from '../src/shared/repairPipeline';

export class DemoStore {
  private sessions = new Map<string, DemoSessionState>();

  getState(sessionId: string): DemoSessionState {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, createInitialDemoState(sessionId));
    }
    const state = this.sessions.get(sessionId)!;
    advanceRepairState(state);
    return cloneDemoState(state);
  }

  reset(sessionId: string): DemoSessionState {
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
    return this.store.sendInvoice(this.sessionId, intent, requestId);
  }

  async requestRepair(intentId: string) {
    return this.store.requestRepair(this.sessionId, intentId);
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
}
