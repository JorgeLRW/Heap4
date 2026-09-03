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
  /** Set when the recipient reached the invoice without the email route. */
  accessGrantedVia?: 'secure_share_link';
}

/**
 * A scoped, expiring, revocable capability that lets the recipient read one
 * invoice while the outbound email route is broken. The plaintext token is
 * never persisted; only its SHA-256 digest is stored.
 */
export interface InvoiceAccessGrant {
  id: string;
  intentId: string;
  invoiceId: string;
  contactId: string;
  audience: string;
  scope: 'read_invoice_only';
  tokenHash: string;
  issuedAt: string;
  expiresAt: string;
  issuedVia: 'webmcp_agent' | 'user';
  revokedAt?: string;
  revokedReason?: string;
  /** Set the first time the recipient endpoint successfully resolves this grant. */
  firstAccessedAt?: string;
}

/** The read-only projection returned to a holder of a valid share link. */
export interface InvoiceAccessView {
  invoiceId: string;
  customerId: string;
  amount: number;
  currency: 'USD';
  issuedTo: string;
  createdAt: string;
  expiresAt: string;
  scope: 'read_invoice_only';
}

/** Minimal record of the confirmation supplied in the user's agent conversation. */
export interface RecoveryApproval {
  intentId: string;
  route: 'secure_share_link';
  contactId: string;
  confirmedAt: string;
  channel: 'webmcp_agent_conversation' | 'user_interface';
}

export type RecoveryScenarioId = 'portal_outage' | 'portal_only';

export interface AuthorizedContact {
  id: string;
  customerId: string;
  name: string;
  email: string;
  role: 'acting_ap_approver' | 'archival_billing';
  active: boolean;
  notes: string;
}

export interface CustomerDeliveryPolicy {
  id: string;
  customerId: string;
  version: string;
  sourceText: string;
  enforcement: {
    externalLinksAllowed: boolean;
    maximumLinkMinutes: number;
    externalLinkContactIds: string[];
    procurementPortalAllowed: boolean;
    procurementPortalContactIds: string[];
    confirmationRequiredForExternalLink: boolean;
  };
}

export interface ProcurementPortalReceipt {
  id: string;
  intentId: string;
  invoiceId: string;
  contactId: string;
  portalAccount: string;
  uploadedAt: string;
  verifiedAt: string;
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

export type RepairExecutionMode = 'pending' | 'cloudflare_vm' | 'local_bounded_process' | 'edge_deterministic';

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
  accessGrant: InvoiceAccessGrant | null;
  recoveryApproval: RecoveryApproval | null;
  recoveryScenario: RecoveryScenarioId;
  customerPolicy: CustomerDeliveryPolicy;
  authorizedContacts: AuthorizedContact[];
  procurementPortalAvailable: boolean;
  procurementPortalReceipt: ProcurementPortalReceipt | null;
}

export interface ScopedAccessGrantResult {
  success: boolean;
  state: DemoSessionState;
  grant: InvoiceAccessGrant;
  approval: RecoveryApproval;
  /** Returned once, at issue time, and never persisted in plaintext. */
  accessUrl: string;
}

export interface DemoApi {
  reset(): Promise<DemoSessionState>;
  getState(): Promise<DemoSessionState>;
  sendInvoice(intent: Intent, requestId: string): Promise<{ success: boolean; state: DemoSessionState; error?: string }>;
  requestRepair(intentId: string): Promise<{ success: boolean; state: DemoSessionState; repairJob: RepairJob }>;
  appendIntentContext(intentId: string, text: string, source?: 'user' | 'agent'): Promise<{ success: boolean; state: DemoSessionState }>;
  deployRepair(jobId: string): Promise<{ success: boolean; state: DemoSessionState }>;
  resumeIntent(intentId: string): Promise<{ success: boolean; state: DemoSessionState }>;
  setRecoveryScenario(scenario: RecoveryScenarioId): Promise<DemoSessionState>;
  createScopedAccessGrant(
    intentId: string,
    contactId: string,
    expirationMinutes: number,
    scope: 'read_invoice_only',
    issuedVia: 'webmcp_agent' | 'user',
    userConfirmation: string,
  ): Promise<ScopedAccessGrantResult>;
  uploadInvoiceToProcurementPortal(
    intentId: string,
    contactId: string,
  ): Promise<{ success: boolean; state: DemoSessionState; receipt: ProcurementPortalReceipt }>;
  revokeAlternateAccess(intentId: string, reason: string): Promise<{ success: boolean; state: DemoSessionState }>;
  readInvoiceByAccessToken(token: string): Promise<{ success: boolean; invoice?: InvoiceAccessView; error?: string }>;
}
