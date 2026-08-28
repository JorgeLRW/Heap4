import type { Intent } from '../client/heap/intentTypes';
import type { DemoSessionState, RepairJob } from './demoApiTypes';

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

  if (state.build === 'demo-build-a') {
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
        symbol: 'DeliveryService.sendInvoiceDelivery',
        linesRange: '39-47',
        snippet:
          "if (demoFailureEnabled) { throw new Error('DELIVERY_PROVIDER_CONFIGURATION_ERROR'); }",
      },
      build: state.build,
      timestamp: new Date().toISOString(),
    };
    state.intent.history.push({
      timestamp: new Date().toISOString(),
      note: `HTTP 500 correlated to ${requestId} on ${state.build}. Invoice persisted; delivery did not complete.`,
    });

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

  if (!state.repairJob) {
    state.repairJob = {
      id: `repair_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`,
      intentId,
      status: 'patch_proposed',
      createdAt: new Date().toISOString(),
      diagnosis:
        'The invoice record is committed before delivery. The outbound gateway fails closed in demo-build-a. The safe change repairs only the delivery configuration and preserves the existing invoice.',
      artifact: {
        file: 'src/server/services/DeliveryService.ts',
        summary:
          'Load the outbound TLS configuration from the repaired deployment and keep delivery idempotent.',
        patch: [
          '--- a/src/server/services/DeliveryService.ts',
          '+++ b/src/server/services/DeliveryService.ts',
          '@@ sendInvoiceDelivery',
          '- if (this.demoFailureEnabled) {',
          '-   throw new Error("DELIVERY_PROVIDER_CONFIGURATION_ERROR");',
          '- }',
          '+ const gateway = loadOutboundGatewayConfig();',
          '+ assertValidTlsConfiguration(gateway);',
          '+ return deliverOnce(invoice, gateway);',
        ].join('\n'),
        regressionTest:
          'Given an already-created INV-2841 and demo-build-b, resuming delivery sends exactly once and invoiceCreateCount remains 1.',
      },
      approvalRequired: true,
    };
    state.intent!.history.push({
      timestamp: new Date().toISOString(),
      note: `Engineering repair ${state.repairJob.id} proposed a scoped patch. Deployment approval is required.`,
    });
  }

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

  state.build = 'demo-build-b';
  state.repairJob.status = 'approved_and_deployed';
  state.repairJob.deployedBuild = state.build;
  state.intent.status = 'resumable';
  if (state.intent.runtimeContext) state.intent.runtimeContext.build = state.build;
  state.intent.history.push({
    timestamp: new Date().toISOString(),
    note: `${repairJobId} approved and deployed as ${state.build}. Intent is now resumable.`,
  });
  return { success: true, state: cloneDemoState(state) };
}

export function resumeIntentTransition(
  state: DemoSessionState,
  intentId: string,
): { success: boolean; state: DemoSessionState } {
  assertIntent(state, intentId);
  if (state.intent!.status !== 'resumable' || state.build !== 'demo-build-b') {
    throw new Error(`Intent ${intentId} cannot resume until an approved repair is deployed.`);
  }
  if (!state.invoice) throw new Error('Invariant violation: the original invoice is missing.');
  if (state.invoiceCreateCount !== 1) {
    throw new Error('Invariant violation: duplicate invoice records were detected.');
  }

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
