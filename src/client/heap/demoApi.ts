import type {
  DemoApi,
  DemoSessionState,
  InvoiceAccessView,
  ProcurementPortalReceipt,
  RecoveryScenarioId,
  RepairJob,
  ScopedAccessGrantResult,
} from '../../shared/demoApiTypes';
import type { Intent } from './intentTypes';
import { getDemoSessionId } from './session';

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Heap-Session-ID': getDemoSessionId(),
      ...(init?.headers || {}),
    },
  });

  const payload = await response.json();
  // 500 carries the failure capsule and 403 carries the share-link rejection;
  // both are structured results rather than transport errors.
  if (!response.ok && response.status !== 500 && response.status !== 403) {
    throw new Error(payload.error || `Heap 4 API request failed (${response.status})`);
  }
  return payload as T;
}

export class HttpDemoApi implements DemoApi {
  reset(): Promise<DemoSessionState> {
    return requestJson('/api/demo/reset', { method: 'POST' });
  }

  getState(): Promise<DemoSessionState> {
    return requestJson('/api/demo/state');
  }

  sendInvoice(intent: Intent, requestId: string) {
    return requestJson<{ success: boolean; state: DemoSessionState; error?: string }>(
      `/api/demo/intents/${encodeURIComponent(intent.id)}/send`,
      {
        method: 'POST',
        headers: {
          'X-Heap-Intent-ID': intent.id,
          'X-Request-ID': requestId,
        },
        body: JSON.stringify({ intent }),
      }
    );
  }

  requestRepair(intentId: string) {
    return requestJson<{ success: boolean; state: DemoSessionState; repairJob: RepairJob }>(
      `/api/demo/intents/${encodeURIComponent(intentId)}/repair`,
      { method: 'POST', body: '{}' }
    );
  }

  appendIntentContext(intentId: string, text: string, source: 'user' | 'agent' = 'user') {
    return requestJson<{ success: boolean; state: DemoSessionState }>(
      `/api/demo/intents/${encodeURIComponent(intentId)}/context`,
      {
        method: 'POST',
        body: JSON.stringify({ text, source }),
      },
    );
  }

  deployRepair(jobId: string) {
    return requestJson<{ success: boolean; state: DemoSessionState }>(
      `/api/demo/repairs/${encodeURIComponent(jobId)}/deploy`,
      { method: 'POST', body: '{}' }
    );
  }

  resumeIntent(intentId: string) {
    return requestJson<{ success: boolean; state: DemoSessionState }>(
      `/api/demo/intents/${encodeURIComponent(intentId)}/resume`,
      { method: 'POST', body: '{}' }
    );
  }

  setRecoveryScenario(scenario: RecoveryScenarioId) {
    return requestJson<DemoSessionState>('/api/demo/recovery-scenario', {
      method: 'POST',
      body: JSON.stringify({ scenario }),
    });
  }

  createScopedAccessGrant(
    intentId: string,
    contactId: string,
    expirationMinutes: number,
    scope: 'read_invoice_only',
    issuedVia: 'webmcp_agent' | 'user',
    userConfirmation: string,
  ) {
    return requestJson<ScopedAccessGrantResult>(
      `/api/demo/intents/${encodeURIComponent(intentId)}/access-grants`,
      {
        method: 'POST',
        body: JSON.stringify({ contactId, expirationMinutes, scope, issuedVia, userConfirmation }),
      },
    );
  }

  uploadInvoiceToProcurementPortal(intentId: string, contactId: string) {
    return requestJson<{
      success: boolean;
      state: DemoSessionState;
      receipt: ProcurementPortalReceipt;
    }>(`/api/demo/intents/${encodeURIComponent(intentId)}/procurement-portal`, {
      method: 'POST',
      body: JSON.stringify({ contactId }),
    });
  }

  revokeAlternateAccess(intentId: string, reason: string) {
    return requestJson<{ success: boolean; state: DemoSessionState }>(
      `/api/demo/intents/${encodeURIComponent(intentId)}/access-grants/revoke`,
      { method: 'POST', body: JSON.stringify({ reason }) },
    );
  }

  readInvoiceByAccessToken(token: string) {
    return requestJson<{ success: boolean; invoice?: InvoiceAccessView; error?: string }>(
      `/api/demo/invoice-access/${encodeURIComponent(token)}`,
    );
  }
}

export const httpDemoApi = new HttpDemoApi();
