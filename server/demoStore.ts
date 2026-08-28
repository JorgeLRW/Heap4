import type { Intent } from '../src/client/heap/intentTypes';
import type { DemoApi, DemoSessionState } from '../src/shared/demoApiTypes';
import {
  cloneDemoState,
  createInitialDemoState,
  deployRepairTransition,
  requestRepairTransition,
  resumeIntentTransition,
  sendInvoiceTransition,
} from '../src/shared/demoTransitions';

export class DemoStore {
  private sessions = new Map<string, DemoSessionState>();

  getState(sessionId: string): DemoSessionState {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, createInitialDemoState(sessionId));
    }
    return cloneDemoState(this.sessions.get(sessionId)!);
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

  async deployRepair(jobId: string) {
    return this.store.deployRepair(this.sessionId, jobId);
  }

  async resumeIntent(intentId: string) {
    return this.store.resumeIntent(this.sessionId, intentId);
  }
}
