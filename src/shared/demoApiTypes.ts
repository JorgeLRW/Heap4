import type { Intent } from '../client/heap/intentTypes';

export type DemoBuild = 'demo-build-a' | 'demo-build-b';

export interface DemoInvoiceRecord {
  id: string;
  customerId: string;
  amount: number;
  recipient: string;
  deliveryStatus: 'pending' | 'sent';
  createdAt: string;
  sentAt?: string;
}

export interface RepairArtifact {
  file: string;
  summary: string;
  patch: string;
  regressionTest: string;
}

export interface RepairJob {
  id: string;
  intentId: string;
  status: 'queued' | 'patch_proposed' | 'approved_and_deployed';
  createdAt: string;
  diagnosis: string;
  artifact: RepairArtifact;
  approvalRequired: true;
  deployedBuild?: DemoBuild;
}

export interface DemoSessionState {
  sessionId: string;
  build: DemoBuild;
  invoice: DemoInvoiceRecord | null;
  intent: Intent | null;
  invoiceCreateCount: number;
  repairJob: RepairJob | null;
}

export interface DemoApi {
  reset(): Promise<DemoSessionState>;
  getState(): Promise<DemoSessionState>;
  sendInvoice(intent: Intent, requestId: string): Promise<{ success: boolean; state: DemoSessionState; error?: string }>;
  requestRepair(intentId: string): Promise<{ success: boolean; state: DemoSessionState; repairJob: RepairJob }>;
  deployRepair(jobId: string): Promise<{ success: boolean; state: DemoSessionState }>;
  resumeIntent(intentId: string): Promise<{ success: boolean; state: DemoSessionState }>;
}
