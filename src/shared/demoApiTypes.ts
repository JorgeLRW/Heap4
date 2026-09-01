import type { Intent } from '../client/heap/intentTypes';

export type DemoBuild = 'demo-build-a' | 'demo-build-b';

export type RepairPipelineStatus =
  | 'queued'
  | 'diagnosing'
  | 'reproducing'
  | 'patching'
  | 'validating'
  | 'patch_proposed'
  | 'ready_for_review'
  | 'approved_and_deployed'
  | 'failed';

export type RepairPipelineStage =
  | 'failure_captured'
  | 'sandbox_created'
  | 'reproduction_confirmed'
  | 'patch_generated'
  | 'validation_complete'
  | 'deployment_verified';

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
  baseRevision: DemoBuild;
  diffStat: string;
  reproduction: string;
  validationChecks: ValidationCheck[];
  provenance: string[];
}

export interface ValidationCheck {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  detail: string;
}

export type RepairExecutionMode = 'pending' | 'cloudflare_vm' | 'local_bounded_process';

export interface RepairCommandEvidence {
  id: string;
  label: string;
  argv: string[];
  cwd: string;
  startedAt: string;
  completedAt: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
  digest: string;
}

export interface RepairAgentEvent {
  stage: 'observed' | 'diagnosed' | 'proposed' | 'mutated' | 'verified';
  message: string;
  timestamp: string;
  evidenceId?: string;
}

export interface SandboxExecutionEvidence {
  mode: RepairExecutionMode;
  lifecycle: 'pending' | 'provisioning' | 'running' | 'destroyed' | 'cleanup_failed';
  startedAt?: string;
  completedAt?: string;
  baseDigest?: string;
  candidateDigest?: string;
  workspaceDigest?: string;
  attemptedWrites: string[];
  commands: RepairCommandEvidence[];
  cleanupDetail?: string;
}

export interface SandboxPlan {
  id: string;
  instanceClass: 'lite' | 'standard';
  sourceRevision: DemoBuild;
  workspace: string;
  fileScope: string[];
  validationScope: string[];
  networkPolicy: 'deny_by_default';
  credentialPolicy: 'brokered_no_secrets_in_workspace';
  cleanup: 'destroy_after_artifact_capture';
  execution: SandboxExecutionEvidence;
}

export interface DeploymentEvidence {
  environment: 'preview' | 'canary' | 'production';
  build: DemoBuild;
  smokeTest: 'passed' | 'failed';
  canary: 'not_started' | 'passed' | 'rolled_back';
  rollbackReady: boolean;
  verifiedAt: string;
}

export interface RepairJob {
  id: string;
  intentId: string;
  status: RepairPipelineStatus;
  createdAt: string;
  updatedAt: string;
  autoStarted: boolean;
  currentStage: RepairPipelineStage;
  stageProgress: number;
  riskClass: 'bounded_provider_adapter';
  diagnosis: string;
  artifact: RepairArtifact;
  sandbox: SandboxPlan;
  agent: {
    mode: 'bounded_policy';
    strategy: 'delivery_tls_adapter_v1';
    events: RepairAgentEvent[];
  };
  approvalRequired: true;
  deployedBuild?: DemoBuild;
  deploymentEvidence?: DeploymentEvidence;
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
  appendIntentContext(intentId: string, text: string, source?: 'user' | 'agent'): Promise<{ success: boolean; state: DemoSessionState }>;
  deployRepair(jobId: string): Promise<{ success: boolean; state: DemoSessionState }>;
  resumeIntent(intentId: string): Promise<{ success: boolean; state: DemoSessionState }>;
}
