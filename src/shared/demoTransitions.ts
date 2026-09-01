import type { Intent } from '../client/heap/intentTypes';
import { DeliveryProviderConfigurationError, sendInvoiceDelivery } from '../server/services/DeliveryService';
import type { DemoSessionState, RepairJob } from './demoApiTypes';
import { appendUserContext, createRepairJob } from './repairPipeline';

export const FAILURE_MESSAGE =
  'DELIVERY_PROVIDER_CONFIGURATION_ERROR: Missing TLS cert for outbound gateway mail.acme.example:587';

export function cloneDemoState<T>(value: T): T {
  return structuredClone(value);
}

export function createInitialDemoState(sessionId: string): DemoSessionState {
  return {
    sessionId,
    build: 'demo-build-a',
    invoice: null,
    intent: null,
    invoiceCreateCount: 0,
    repairJob: null,
  };
}

export function sendInvoiceTransition(
  state: DemoSessionState,
  intent: Intent,
  requestId: string,
): { success: boolean; state: DemoSessionState; error?: string } {
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
  if (state.intent!.status !== 'blocked') {
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
  if (!state.intent || state.intent.status !== 'blocked') {
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
  state.intent!.status = 'completed';
  state.intent!.history.push({
    timestamp: new Date().toISOString(),
    note: 'Delivery completed exactly once. Original invoice and amount were preserved.',
  });
}
