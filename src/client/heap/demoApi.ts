import type { DemoApi, DemoSessionState, RepairJob } from '../../shared/demoApiTypes';
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
  if (!response.ok && response.status !== 500) {
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
}

export const httpDemoApi = new HttpDemoApi();
