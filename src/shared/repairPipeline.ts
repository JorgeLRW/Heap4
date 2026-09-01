import type { Intent } from '../client/heap/intentTypes';
import type {
  DemoSessionState,
  RepairArtifact,
  RepairJob,
  SandboxPlan,
  ValidationCheck,
} from './demoApiTypes';

const REPAIR_FILE = 'src/server/services/DeliveryService.ts';
const TEST_FILE = 'tests/deliveryService.test.ts';

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

function checks(status: ValidationCheck['status'] = 'pending'): ValidationCheck[] {
  return [
    {
      id: 'reproducer',
      label: 'Failure reproducer',
      status,
      detail: 'Original release fails with the captured provider configuration error.',
    },
    {
      id: 'regression',
      label: 'Regression assertion',
      status,
      detail: 'Patched release sends the existing invoice exactly once.',
    },
    {
      id: 'affected',
      label: 'Affected workflow checks',
      status,
      detail: 'Delivery and invoice workflow consumers remain green.',
    },
    {
      id: 'build',
      label: 'Bounded repair package build',
      status,
      detail: 'The candidate parses successfully and the workspace scope audit detects no out-of-policy writes.',
    },
  ];
}

function artifact(baseRevision: 'demo-build-a' | 'demo-build-b'): RepairArtifact {
  return {
    file: REPAIR_FILE,
    summary:
      'Repair only the stateless delivery adapter path. Preserve the persisted invoice, amount, and idempotent resume boundary.',
    patch: [
      '--- a/src/server/services/DeliveryService.ts',
      '+++ b/src/server/services/DeliveryService.ts',
      '@@ sendInvoiceDelivery',
      "- if (build === 'demo-build-a') { throw new DeliveryProviderConfigurationError(); }",
      '+ const gateway = loadOutboundGatewayConfig();',
      '+ assertValidTlsConfiguration(gateway);',
      '+ return deliverOnce(invoice, gateway);',
    ].join('\n'),
    regressionTest:
      'Given an already-created INV-2841, the repaired delivery step succeeds and invoiceCreateCount remains 1.',
    baseRevision,
    diffStat: '1 file changed · 3 additions · 1 deletion · no schema or dependency changes',
    reproduction:
      `POST /api/demo/intents/:intentId/send on ${baseRevision} returns HTTP 500 before the patch and succeeds after the patch.`,
    validationChecks: checks(),
    provenance: [
      'Interruption Capsule request correlation ID',
      'Server stack and source location',
      'Exact base revision',
      'Sandbox command and test transcript',
    ],
  };
}

function sandboxPlan(sourceRevision: 'demo-build-a' | 'demo-build-b'): SandboxPlan {
  return {
    id: id('sandbox'),
    instanceClass: 'lite',
    sourceRevision,
    workspace: '/workspace/heap-4-repair',
    fileScope: [REPAIR_FILE, TEST_FILE],
    validationScope: [
      'DeliveryService unit tests',
      'Invoice send integration flow',
      'No-duplicate invoice invariant',
      'TypeScript build',
    ],
    networkPolicy: 'deny_by_default',
    credentialPolicy: 'brokered_no_secrets_in_workspace',
    cleanup: 'destroy_after_artifact_capture',
    execution: {
      mode: 'pending',
      lifecycle: 'pending',
      attemptedWrites: [],
      commands: [],
    },
  };
}

export function createRepairJob(intent: Intent, now = new Date()): RepairJob {
  const createdAt = now.toISOString();
  return {
    id: id('repair'),
    intentId: intent.id,
    status: 'queued',
    createdAt,
    updatedAt: createdAt,
    autoStarted: true,
    currentStage: 'failure_captured',
    stageProgress: 0,
    riskClass: 'bounded_provider_adapter',
    diagnosis:
      'The invoice is already persisted. The novel failure is isolated to the outbound delivery adapter, so the repair is constrained to that adapter and its regression test.',
    artifact: artifact('demo-build-a'),
    sandbox: sandboxPlan('demo-build-a'),
    agent: {
      mode: 'bounded_policy',
      strategy: 'delivery_tls_adapter_v1',
      events: [
        {
          stage: 'observed',
          message: 'Correlated the HTTP 500 with the persisted invoice and failing delivery adapter.',
          timestamp: createdAt,
        },
      ],
    },
    approvalRequired: true,
  };
}

export function appendUserContext(
  state: DemoSessionState,
  intentId: string,
  text: string,
  source: 'user' | 'agent' = 'user',
): DemoSessionState {
  if (!state.intent || state.intent.id !== intentId) {
    throw new Error(`Intent ${intentId} was not found.`);
  }
  const trimmed = text.trim();
  if (trimmed.length < 2 || trimmed.length > 500) {
    throw new Error('Context must be between 2 and 500 characters.');
  }

  state.intent.userContext ??= [];
  state.intent.userContext.push({
    timestamp: new Date().toISOString(),
    text: trimmed,
    source,
  });
  state.intent.history.push({
    timestamp: new Date().toISOString(),
    note: `Additional ${source} context attached: ${trimmed}`,
  });
  return structuredClone(state);
}
