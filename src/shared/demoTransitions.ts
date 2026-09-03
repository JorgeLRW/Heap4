import type { Intent } from '../client/heap/intentTypes';
import { DeliveryProviderConfigurationError, sendInvoiceDelivery } from '../server/services/DeliveryService';
import {
  buildAccessUrl,
  createAccessToken,
  evaluateGrantUsability,
  hashAccessToken,
} from './accessGrants';
import type {
  AuthorizedContact,
  CustomerDeliveryPolicy,
  DemoSessionState,
  InvoiceAccessGrant,
  InvoiceAccessView,
  ProcurementPortalReceipt,
  RecoveryApproval,
  RecoveryScenarioId,
  RepairJob,
  ScopedAccessGrantResult,
} from './demoApiTypes';
import { appendUserContext, createRepairJob } from './repairPipeline';

export const FAILURE_MESSAGE =
  'DELIVERY_PROVIDER_CONFIGURATION_ERROR: Missing TLS cert for outbound gateway mail.acme.example:587';

interface RecoveryScenarioDefinition {
  policy: CustomerDeliveryPolicy;
  contacts: AuthorizedContact[];
  procurementPortalAvailable: boolean;
}

const ACME_CONTACTS: AuthorizedContact[] = [
  {
    id: 'contact_dana_lee',
    customerId: 'ACME',
    name: 'Dana Lee',
    email: 'dana.lee@acme.example',
    role: 'acting_ap_approver',
    active: true,
    notes: 'Acting AP approver through September 6.',
  },
  {
    id: 'contact_billing_archive',
    customerId: 'ACME',
    name: 'Acme Billing Archive',
    email: 'billing@acme.example',
    role: 'archival_billing',
    active: true,
    notes: 'Retained for archival correspondence; not a designated AP approver.',
  },
];

const RECOVERY_SCENARIOS: Record<RecoveryScenarioId, RecoveryScenarioDefinition> = {
  portal_outage: {
    policy: {
      id: 'policy_acme_ap_2026_09',
      customerId: 'ACME',
      version: '2026-09-03',
      sourceText:
        'Acme AP prefers finalized invoices through the vendor portal. Email may be used for notices, but invoice attachments above $10,000 are prohibited. If the portal is unavailable, temporary external links are acceptable for designated AP approvers when access expires within one hour. Dana Lee is acting approver through September 6. billing@acme.example is retained for archival correspondence.',
      enforcement: {
        externalLinksAllowed: true,
        maximumLinkMinutes: 60,
        externalLinkContactIds: ['contact_dana_lee'],
        procurementPortalAllowed: true,
        procurementPortalContactIds: ['contact_dana_lee'],
        confirmationRequiredForExternalLink: true,
      },
    },
    contacts: ACME_CONTACTS,
    procurementPortalAvailable: false,
  },
  portal_only: {
    policy: {
      id: 'policy_acme_portal_only_2026_09',
      customerId: 'ACME',
      version: '2026-09-03',
      sourceText:
        'External links are prohibited. Finalized invoices must be delivered through the Acme procurement portal to an active AP approver. Dana Lee is acting approver through September 6. Email may be used for status notices only; billing@acme.example remains an archival mailbox.',
      enforcement: {
        externalLinksAllowed: false,
        maximumLinkMinutes: 0,
        externalLinkContactIds: [],
        procurementPortalAllowed: true,
        procurementPortalContactIds: ['contact_dana_lee'],
        confirmationRequiredForExternalLink: true,
      },
    },
    contacts: ACME_CONTACTS,
    procurementPortalAvailable: true,
  },
};

function getRecoveryScenario(scenario: RecoveryScenarioId): RecoveryScenarioDefinition {
  return cloneDemoState(RECOVERY_SCENARIOS[scenario]);
}

export function cloneDemoState<T>(value: T): T {
  return structuredClone(value);
}

export function createInitialDemoState(sessionId: string): DemoSessionState {
  const scenario = getRecoveryScenario('portal_outage');
  return {
    sessionId,
    build: 'demo-build-a',
    invoice: null,
    intent: null,
    invoiceCreateCount: 0,
    repairJob: null,
    accessGrant: null,
    recoveryApproval: null,
    recoveryScenario: 'portal_outage',
    customerPolicy: scenario.policy,
    authorizedContacts: scenario.contacts,
    procurementPortalAvailable: scenario.procurementPortalAvailable,
    procurementPortalReceipt: null,
  };
}

/** Adds fields introduced after a D1 session was written without discarding its workflow state. */
export function upgradeDemoState(state: DemoSessionState): DemoSessionState {
  const defaults = createInitialDemoState(state.sessionId);
  return {
    ...defaults,
    ...state,
    accessGrant: state.accessGrant
      ? { ...state.accessGrant, contactId: state.accessGrant.contactId ?? 'contact_billing_archive' }
      : null,
  };
}

export function setRecoveryScenarioTransition(
  state: DemoSessionState,
  scenarioId: RecoveryScenarioId,
): { success: true; state: DemoSessionState } {
  if (state.accessGrant && evaluateGrantUsability(state.accessGrant).usable) {
    throw new Error('Revoke the active access grant before changing customer policy.');
  }
  if (state.procurementPortalReceipt) {
    throw new Error('Reset the demo before changing policy after a portal delivery.');
  }

  const scenario = getRecoveryScenario(scenarioId);
  state.recoveryScenario = scenarioId;
  state.customerPolicy = scenario.policy;
  state.authorizedContacts = scenario.contacts;
  state.procurementPortalAvailable = scenario.procurementPortalAvailable;
  state.intent?.history.push({
    timestamp: new Date().toISOString(),
    note: `Customer delivery policy changed to ${scenario.policy.id}. No recovery action was selected automatically.`,
  });
  return { success: true, state: cloneDemoState(state) };
}

export function sendInvoiceTransition(
  state: DemoSessionState,
  intent: Intent,
  requestId: string,
): { success: boolean; state: DemoSessionState; error?: string } {
  // The client re-posts its intent draft; never let that overwrite a workflow
  // the server has already moved past 'active'.
  if (state.intent?.id === intent.id && state.intent.status !== 'active') {
    throw new Error(
      `Intent ${intent.id} is already ${state.intent.status} and cannot be dispatched again.`,
    );
  }

  state.intent = cloneDemoState(intent);

  if (!state.invoice) {
    state.invoice = {
      id: intent.entities.invoiceId,
      customerId: intent.entities.customerId,
      amount: intent.entities.amount,
      recipient: 'billing@acme.example',
      deliveryStatus: 'pending',
      createdAt: new Date().toISOString(),
    };
    state.invoiceCreateCount += 1;
  }

  state.intent.progress.invoiceCreated = true;
  state.intent.progress.completedSteps = [
    'Selected Acme Corp',
    'Created invoice INV-2841',
    'Persisted invoice in the server store',
  ];

  try {
    sendInvoiceDelivery(
      {
        id: state.invoice.id,
        recipient: state.invoice.recipient,
        amount: state.invoice.amount,
      },
      state.build,
    );
  } catch (error) {
    if (!(error instanceof DeliveryProviderConfigurationError)) throw error;

    state.intent.progress.deliveryCompleted = false;
    state.intent.progress.failedStep = 'DeliveryService.sendInvoiceDelivery';
    state.intent.progress.gap = 'Delivery is blocked by the outbound gateway configuration defect.';
    state.intent.status = 'blocked';
    state.intent.detectionSource = 'SERVER_ERROR';
    state.intent.runtimeContext = {
      request: {
        id: requestId,
        route: `POST /api/demo/intents/${intent.id}/send`,
        httpStatus: 500,
      },
      stack: ['DeliveryService.sendInvoiceDelivery', 'InvoiceService.dispatchInvoice'],
      source: {
        file: 'src/server/services/DeliveryService.ts',
        line: 42,
        symbol: 'sendInvoiceDelivery',
        linesRange: '37-46',
        snippet:
          "if (build === 'demo-build-a') { throw new DeliveryProviderConfigurationError(); }",
      },
      build: state.build,
      timestamp: new Date().toISOString(),
    };
    state.intent.history.push({
      timestamp: new Date().toISOString(),
      note: `HTTP 500 correlated to ${requestId} on ${state.build}. Invoice persisted; delivery did not complete.`,
    });

    // Start the engineering pipeline immediately. WebMCP observes and
    // collaborates with this job; it is not required to wake the worker.
    if (!state.repairJob) state.repairJob = createRepairJob(state.intent);

    return { success: false, error: FAILURE_MESSAGE, state: cloneDemoState(state) };
  }

  finishDelivery(state);
  return { success: true, state: cloneDemoState(state) };
}

export function requestRepairTransition(
  state: DemoSessionState,
  intentId: string,
): { success: boolean; state: DemoSessionState; repairJob: RepairJob } {
  assertIntent(state, intentId);
  if (!['blocked', 'mitigated'].includes(state.intent!.status)) {
    throw new Error(`Intent ${intentId} is not blocked and does not need a repair.`);
  }

  // Failures auto-create the job. This endpoint is retained as a manual
  // re-open/refresh action for a user who wants to see the engineering packet.
  if (!state.repairJob) state.repairJob = createRepairJob(state.intent!);

  return {
    success: true,
    state: cloneDemoState(state),
    repairJob: cloneDemoState(state.repairJob),
  };
}

export function deployRepairTransition(
  state: DemoSessionState,
  repairJobId: string,
): { success: boolean; state: DemoSessionState } {
  if (!state.repairJob || state.repairJob.id !== repairJobId) {
    throw new Error(`Repair job ${repairJobId} was not found.`);
  }
  if (!state.intent || !['blocked', 'mitigated'].includes(state.intent.status)) {
    throw new Error('The interrupted intent is not in a deployable state.');
  }

  if (state.repairJob.status !== 'ready_for_review') {
    throw new Error(
      `Repair ${repairJobId} is still ${state.repairJob.status.replaceAll('_', ' ')}. All validation checks must pass before deployment.`,
    );
  }

  if (state.repairJob.artifact.validationChecks.some((check) => check.status !== 'passed')) {
    throw new Error('The repair artifact is not fully validated.');
  }

  state.build = 'demo-build-b';
  state.repairJob.status = 'approved_and_deployed';
  state.repairJob.currentStage = 'deployment_verified';
  state.repairJob.stageProgress = 100;
  state.repairJob.updatedAt = new Date().toISOString();
  state.repairJob.deployedBuild = state.build;
  state.repairJob.deploymentEvidence = {
    environment: 'canary',
    build: state.build,
    smokeTest: 'passed',
    canary: 'passed',
    rollbackReady: true,
    verifiedAt: new Date().toISOString(),
  };
  state.intent.status = 'resumable';
  if (state.intent.runtimeContext) state.intent.runtimeContext.build = state.build;
  state.intent.history.push({
    timestamp: new Date().toISOString(),
    note: `${repairJobId} approved and deployed as ${state.build}. Intent is now resumable.`,
  });
  return { success: true, state: cloneDemoState(state) };
}

export function appendIntentContextTransition(
  state: DemoSessionState,
  intentId: string,
  text: string,
  source: 'user' | 'agent' = 'user',
): { success: boolean; state: DemoSessionState } {
  return { success: true, state: appendUserContext(state, intentId, text, source) };
}

export function resumeIntentTransition(
  state: DemoSessionState,
  intentId: string,
): { success: boolean; state: DemoSessionState } {
  assertIntent(state, intentId);
  if (
    state.intent!.status !== 'resumable' ||
    state.build !== 'demo-build-b' ||
    state.repairJob?.deploymentEvidence?.smokeTest !== 'passed' ||
    state.repairJob?.deploymentEvidence?.canary !== 'passed'
  ) {
    throw new Error(`Intent ${intentId} cannot resume until an approved repair is deployed.`);
  }
  if (!state.invoice) throw new Error('Invariant violation: the original invoice is missing.');
  if (state.invoiceCreateCount !== 1) {
    throw new Error('Invariant violation: duplicate invoice records were detected.');
  }

  sendInvoiceDelivery(
    {
      id: state.invoice.id,
      recipient: state.invoice.recipient,
      amount: state.invoice.amount,
    },
    state.build,
  );
  finishDelivery(state);
  return { success: true, state: cloneDemoState(state) };
}

function assertIntent(state: DemoSessionState, intentId: string): void {
  if (!state.intent || state.intent.id !== intentId) {
    throw new Error(`Intent ${intentId} was not found.`);
  }
}

function finishDelivery(state: DemoSessionState): void {
  state.invoice!.deliveryStatus = 'sent';
  state.invoice!.sentAt = new Date().toISOString();
  state.intent!.progress.deliveryCompleted = true;
  state.intent!.progress.goalSatisfiedVia = 'email_delivery';
  state.intent!.status = 'completed';
  state.intent!.history.push({
    timestamp: new Date().toISOString(),
    note: 'Delivery completed exactly once. Original invoice and amount were preserved.',
  });
}

/**
 * Reaches the user's outcome through the allowlisted alternate route while the
 * email route is still defective. This never marks the invoice sent, never
 * touches the amount, and never creates a second invoice.
 */
export async function createScopedAccessGrantTransition(
  state: DemoSessionState,
  intentId: string,
  contactId: string,
  expirationMinutes: number,
  scope: 'read_invoice_only',
  issuedVia: 'webmcp_agent' | 'user',
  userConfirmation: string,
): Promise<ScopedAccessGrantResult> {
  assertIntent(state, intentId);
  const intent = state.intent!;

  if (intent.status === 'completed') {
    throw new Error(`Intent ${intentId} already reached its outcome through the primary route.`);
  }
  if (intent.status !== 'blocked') {
    throw new Error(
      `Intent ${intentId} is ${intent.status} and is not eligible for an alternate route.`,
    );
  }
  if (!intent.goal.alternateRoutes.includes('secure_share_link')) {
    throw new Error(`Intent ${intentId} does not allowlist the secure share link route.`);
  }
  if (!state.invoice) throw new Error('Invariant violation: the original invoice is missing.');
  if (state.invoiceCreateCount !== 1) {
    throw new Error('Invariant violation: duplicate invoice records were detected.');
  }
  if (state.accessGrant && evaluateGrantUsability(state.accessGrant).usable) {
    throw new Error(
      `Invoice ${state.invoice.id} already has an active share link. Revoke it before issuing another.`,
    );
  }

  const policy = state.customerPolicy;
  if (policy.customerId !== intent.entities.customerId) {
    throw new Error(`No delivery policy matches customer ${intent.entities.customerId}.`);
  }
  if (!policy.enforcement.externalLinksAllowed) {
    throw new Error('Customer policy prohibits external links. Replan with another capability.');
  }
  const contact = state.authorizedContacts.find(
    (candidate) => candidate.id === contactId && candidate.customerId === intent.entities.customerId,
  );
  if (!contact?.active) {
    throw new Error(`Contact ${contactId} is not an active contact for this customer.`);
  }
  if (!policy.enforcement.externalLinkContactIds.includes(contact.id)) {
    throw new Error(`Contact ${contact.name} is not eligible for external invoice access.`);
  }
  if (scope !== 'read_invoice_only') {
    throw new Error(`Scope ${String(scope)} is not permitted for invoice access.`);
  }
  if (
    !Number.isInteger(expirationMinutes) ||
    expirationMinutes < 1 ||
    expirationMinutes > policy.enforcement.maximumLinkMinutes
  ) {
    throw new Error(
      `Grant expiration must be between 1 and ${policy.enforcement.maximumLinkMinutes} minutes.`,
    );
  }
  const confirmation = userConfirmation.trim();
  if (confirmation.length < 3 || confirmation.length > 200) {
    throw new Error('An explicit user confirmation of 3 to 200 characters is required.');
  }

  const issuedAt = new Date();
  const token = createAccessToken();
  const grant: InvoiceAccessGrant = {
    id: `grant_${issuedAt.getTime().toString(36)}`,
    intentId,
    invoiceId: state.invoice.id,
    contactId: contact.id,
    audience: contact.email,
    scope,
    tokenHash: await hashAccessToken(token),
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + expirationMinutes * 60_000).toISOString(),
    issuedVia,
  };
  const approval: RecoveryApproval = {
    intentId,
    route: 'secure_share_link',
    contactId: contact.id,
    confirmedAt: issuedAt.toISOString(),
    channel: issuedVia === 'webmcp_agent' ? 'webmcp_agent_conversation' : 'user_interface',
  };

  state.accessGrant = grant;
  state.recoveryApproval = approval;
  state.invoice.accessGrantedVia = 'secure_share_link';
  intent.progress.goalSatisfiedVia = 'secure_share_link';
  intent.progress.completedSteps = [
    ...intent.progress.completedSteps,
    'Issued a scoped, expiring share link for INV-2841',
  ];
  // The defect is untouched, so a mitigated intent keeps its failure context
  // and its open repair job.
  if (intent.status === 'blocked') intent.status = 'mitigated';
  intent.history.push({
    timestamp: issuedAt.toISOString(),
    note: `User-confirmed secure share link route issued (${grant.id}); the email route remains broken.`,
  });

  return {
    success: true,
    state: cloneDemoState(state),
    grant: cloneDemoState(grant),
    approval: cloneDemoState(approval),
    accessUrl: buildAccessUrl(token),
  };
}

export function uploadInvoiceToProcurementPortalTransition(
  state: DemoSessionState,
  intentId: string,
  contactId: string,
): { success: true; state: DemoSessionState; receipt: ProcurementPortalReceipt } {
  assertIntent(state, intentId);
  const intent = state.intent!;
  if (intent.status !== 'blocked') {
    throw new Error(`Intent ${intentId} is ${intent.status}; portal delivery is no longer applicable.`);
  }
  if (!state.invoice || state.invoiceCreateCount !== 1) {
    throw new Error('Invariant violation: portal delivery requires exactly one persisted invoice.');
  }
  const policy = state.customerPolicy;
  if (!policy.enforcement.procurementPortalAllowed) {
    throw new Error('Customer policy prohibits procurement portal delivery.');
  }
  const contact = state.authorizedContacts.find(
    (candidate) => candidate.id === contactId && candidate.customerId === intent.entities.customerId,
  );
  if (!contact?.active || !policy.enforcement.procurementPortalContactIds.includes(contact.id)) {
    throw new Error(`Contact ${contactId} is not eligible for procurement portal delivery.`);
  }
  if (!state.procurementPortalAvailable) {
    throw new Error(
      'The Acme procurement portal is currently unavailable. Observe the failure and replan with the remaining capabilities.',
    );
  }

  const uploadedAt = new Date().toISOString();
  const receipt: ProcurementPortalReceipt = {
    id: `portal_${Date.now().toString(36)}`,
    intentId,
    invoiceId: state.invoice.id,
    contactId: contact.id,
    portalAccount: 'acme-vendor-0192',
    uploadedAt,
    verifiedAt: uploadedAt,
  };
  state.procurementPortalReceipt = receipt;
  intent.progress.goalSatisfiedVia = 'procurement_portal';
  intent.progress.completedSteps.push(`Uploaded ${state.invoice.id} to the Acme procurement portal`);
  intent.status = 'mitigated';
  intent.history.push({
    timestamp: uploadedAt,
    note: `Finalized invoice uploaded and verified in the procurement portal (${receipt.id}).`,
  });
  return { success: true, state: cloneDemoState(state), receipt: cloneDemoState(receipt) };
}

/** Withdraws the workaround capability once the primary route is healthy again. */
export function revokeAlternateAccessTransition(
  state: DemoSessionState,
  intentId: string,
  reason: string,
): { success: boolean; state: DemoSessionState } {
  assertIntent(state, intentId);
  const grant = state.accessGrant;
  if (!grant || grant.intentId !== intentId) {
    throw new Error(`Intent ${intentId} has no share link to revoke.`);
  }
  if (grant.revokedAt) throw new Error(`Share link ${grant.id} was already revoked.`);

  const revokedAt = new Date().toISOString();
  grant.revokedAt = revokedAt;
  grant.revokedReason = reason;

  const intent = state.intent!;
  if (state.invoice) delete state.invoice.accessGrantedVia;
  if (intent.progress.goalSatisfiedVia === 'secure_share_link') {
    delete intent.progress.goalSatisfiedVia;
  }
  // A mitigated intent falls back to blocked: the workaround is gone and the
  // primary route was never repaired.
  if (intent.status === 'mitigated') intent.status = 'blocked';
  intent.history.push({
    timestamp: revokedAt,
    note: `Share link ${grant.id} revoked: ${reason}`,
  });

  return { success: true, state: cloneDemoState(state) };
}

/** Projects the invoice down to the fields the share-link scope permits. */
export function toAccessView(
  invoice: NonNullable<DemoSessionState['invoice']>,
  expiresAt: string,
): InvoiceAccessView {
  return {
    invoiceId: invoice.id,
    customerId: invoice.customerId,
    amount: invoice.amount,
    currency: 'USD',
    issuedTo: invoice.recipient,
    createdAt: invoice.createdAt,
    expiresAt,
    scope: 'read_invoice_only',
  };
}

/**
 * Resolves a presented capability token against the session's single grant.
 * Stamps the grant's first-access time in place so a later `inspect_intent`
 * call can answer "did they already view it?" with a
 * server-authoritative fact instead of the agent guessing.
 */
export function readInvoiceByGrant(
  state: DemoSessionState,
): { success: true; invoice: NonNullable<DemoSessionState['invoice']>; grant: InvoiceAccessGrant } | { success: false; error: string } {
  const grant = state.accessGrant;
  if (!grant || !state.invoice) return { success: false, error: 'This share link is not valid.' };

  const usability = evaluateGrantUsability(grant);
  if (!usability.usable) {
    return {
      success: false,
      error: usability.reason === 'revoked' ? 'This share link was revoked.' : 'This share link has expired.',
    };
  }
  if (!grant.firstAccessedAt) grant.firstAccessedAt = new Date().toISOString();
  return { success: true, invoice: state.invoice, grant };
}
