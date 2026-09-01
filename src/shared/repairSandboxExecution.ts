import type {
  RepairCommandEvidence,
  RepairExecutionMode,
  RepairJob,
  ValidationCheck,
} from './demoApiTypes';

export const REPAIR_WORKSPACE = '/workspace/heap-4-repair';
export const REPAIR_SOURCE_PATH = 'src/server/services/DeliveryService.ts';
export const REPAIR_TEST_PATH = 'tests/deliveryService.test.ts';

const REPRODUCER_PATH = 'tests/reproduce.test.ts';
const AFFECTED_TEST_PATH = 'tests/affectedWorkflow.test.ts';
const SCOPE_AUDIT_PATH = 'scripts/scope-audit.mjs';
const PACKAGE_PATH = 'package.json';
const CAPTURE_LIMIT = 12_000;

export interface RepairCommandSpec {
  id: string;
  label: string;
  argv: string[];
  cwd: string;
  timeoutMs: number;
}

export interface RepairProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
}

export interface RepairSandboxAdapter {
  readonly executionMode: Exclude<RepairExecutionMode, 'pending'>;
  readonly sandboxId: string;
  readonly logicalWorkspace: string;
  prepare(): Promise<void>;
  writeFile(relativePath: string, content: string): Promise<void>;
  run(spec: RepairCommandSpec): Promise<RepairProcessResult>;
  destroy(): Promise<void>;
}

type Checkpoint = (job: RepairJob) => Promise<void> | void;

const BASE_DELIVERY_SOURCE = `export interface InvoiceToDeliver {
  id: string;
  recipient: string;
  amount: number;
}

export interface DeliveryReceipt {
  invoiceId: string;
  recipient: string;
  deliveredAt: string;
  provider: 'mail.acme.example';
}

export class DeliveryProviderConfigurationError extends Error {
  readonly code = 'DELIVERY_PROVIDER_CONFIGURATION_ERROR';

  constructor() {
    super('Missing TLS cert for outbound gateway mail.acme.example:587');
    this.name = 'DeliveryProviderConfigurationError';
  }
}

export function sendInvoiceDelivery(
  invoice: InvoiceToDeliver,
  build: 'demo-build-a' | 'demo-build-b',
): DeliveryReceipt {
  if (build === 'demo-build-a') {
    throw new DeliveryProviderConfigurationError();
  }

  return {
    invoiceId: invoice.id,
    recipient: invoice.recipient,
    deliveredAt: new Date().toISOString(),
    provider: 'mail.acme.example',
  };
}
`;

const CANDIDATE_DELIVERY_SOURCE = `export interface InvoiceToDeliver {
  id: string;
  recipient: string;
  amount: number;
}

export interface DeliveryReceipt {
  invoiceId: string;
  recipient: string;
  deliveredAt: string;
  provider: 'mail.acme.example';
}

interface OutboundGatewayConfig {
  host: 'mail.acme.example';
  port: 587;
  tlsCertificate: string;
}

const deliveryReceipts = new Map<string, DeliveryReceipt>();

function loadOutboundGatewayConfig(): OutboundGatewayConfig {
  return {
    host: 'mail.acme.example',
    port: 587,
    tlsCertificate: 'brokered-runtime-certificate',
  };
}

function assertValidTlsConfiguration(config: OutboundGatewayConfig): void {
  if (!config.tlsCertificate) {
    throw new Error('Outbound gateway TLS certificate is unavailable.');
  }
}

function deliverOnce(
  invoice: InvoiceToDeliver,
  _gateway: OutboundGatewayConfig,
): DeliveryReceipt {
  const existing = deliveryReceipts.get(invoice.id);
  if (existing) return existing;

  const receipt: DeliveryReceipt = {
    invoiceId: invoice.id,
    recipient: invoice.recipient,
    deliveredAt: new Date().toISOString(),
    provider: 'mail.acme.example',
  };
  deliveryReceipts.set(invoice.id, receipt);
  return receipt;
}

export function sendInvoiceDelivery(
  invoice: InvoiceToDeliver,
  _build: 'demo-build-a' | 'demo-build-b',
): DeliveryReceipt {
  const gateway = loadOutboundGatewayConfig();
  assertValidTlsConfiguration(gateway);
  return deliverOnce(invoice, gateway);
}
`;

const REPRODUCER_TEST = `import {
  DeliveryProviderConfigurationError,
  sendInvoiceDelivery,
} from '../src/server/services/DeliveryService.ts';

let reproduced = false;
try {
  sendInvoiceDelivery(
    { id: 'INV-2841', recipient: 'billing@acme.example', amount: 4850 },
    'demo-build-a',
  );
} catch (error) {
  reproduced = error instanceof DeliveryProviderConfigurationError;
}

if (!reproduced) {
  console.error('Expected DELIVERY_PROVIDER_CONFIGURATION_ERROR was not reproduced.');
  process.exit(1);
}

console.log('REPRODUCED: build A fails at DeliveryService.sendInvoiceDelivery.');
`;

const REGRESSION_TEST = `import { sendInvoiceDelivery } from '../src/server/services/DeliveryService.ts';

const receipt = sendInvoiceDelivery(
  { id: 'INV-2841', recipient: 'billing@acme.example', amount: 4850 },
  'demo-build-a',
);

if (receipt.invoiceId !== 'INV-2841') throw new Error('Original invoice was not preserved.');
if (receipt.recipient !== 'billing@acme.example') throw new Error('Recipient changed.');
if (receipt.provider !== 'mail.acme.example') throw new Error('Wrong provider.');

console.log('REGRESSION PASSED: the existing invoice reaches the repaired adapter.');
`;

const AFFECTED_WORKFLOW_TEST = `import { sendInvoiceDelivery } from '../src/server/services/DeliveryService.ts';

let invoiceCreateCount = 0;
const persistedInvoice = (() => {
  invoiceCreateCount += 1;
  return { id: 'INV-2841', recipient: 'billing@acme.example', amount: 4850 };
})();

const first = sendInvoiceDelivery(persistedInvoice, 'demo-build-a');
const replay = sendInvoiceDelivery(persistedInvoice, 'demo-build-a');

if (invoiceCreateCount !== 1) throw new Error('Duplicate invoice creation detected.');
if (first.deliveredAt !== replay.deliveredAt) throw new Error('Delivery was not idempotent.');

console.log('AFFECTED FLOW PASSED: invoiceCreateCount=1 and delivery is idempotent.');
`;

const PACKAGE_JSON = JSON.stringify(
  {
    name: 'heap-4-bounded-repair',
    private: true,
    type: 'module',
  },
  null,
  2,
);

const COMMANDS = {
  reproducer: {
    id: 'reproducer',
    label: 'Reproduce captured failure',
    argv: ['node', REPRODUCER_PATH],
    cwd: '.',
    timeoutMs: 20_000,
  },
  regression: {
    id: 'regression',
    label: 'Run repair regression',
    argv: ['node', REPAIR_TEST_PATH],
    cwd: '.',
    timeoutMs: 20_000,
  },
  affected: {
    id: 'affected',
    label: 'Run affected workflow invariants',
    argv: ['node', AFFECTED_TEST_PATH],
    cwd: '.',
    timeoutMs: 20_000,
  },
  build: {
    id: 'build',
    label: 'Parse candidate repair package',
    argv: ['node', '--check', REPAIR_SOURCE_PATH],
    cwd: '.',
    timeoutMs: 20_000,
  },
  scope: {
    id: 'scope',
    label: 'Audit sandbox write scope',
    argv: ['node', SCOPE_AUDIT_PATH],
    cwd: '.',
    timeoutMs: 20_000,
  },
} satisfies Record<string, RepairCommandSpec>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function now(): string {
  return new Date().toISOString();
}

function safeRelativePath(relativePath: string): string {
  const normalized = relativePath.replaceAll('\\', '/');
  if (
    normalized.startsWith('/') ||
    normalized.split('/').some((part) => part === '..' || part === '') ||
    !/^[A-Za-z0-9._/-]+$/.test(normalized)
  ) {
    throw new Error(`Sandbox path is outside the repair workspace: ${relativePath}`);
  }
  return normalized;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function capture(value: string): { text: string; truncated: boolean } {
  if (value.length <= CAPTURE_LIMIT) return { text: value, truncated: false };
  return {
    text: `${value.slice(0, CAPTURE_LIMIT)}\n[output truncated by Heap 4]`,
    truncated: true,
  };
}

function setCheck(
  checks: ValidationCheck[],
  id: string,
  status: ValidationCheck['status'],
  detail?: string,
): void {
  const check = checks.find((candidate) => candidate.id === id);
  if (!check) return;
  check.status = status;
  if (detail) check.detail = detail;
}

async function runCommand(
  job: RepairJob,
  adapter: RepairSandboxAdapter,
  spec: RepairCommandSpec,
): Promise<RepairCommandEvidence> {
  const startedAt = now();
  const result = await adapter.run(spec);
  const completedAt = now();
  const stdout = capture(result.stdout);
  const stderr = capture(result.stderr);
  const evidence: RepairCommandEvidence = {
    id: spec.id,
    label: spec.label,
    argv: [...spec.argv],
    cwd: adapter.logicalWorkspace,
    startedAt,
    completedAt,
    exitCode: result.exitCode,
    stdout: stdout.text,
    stderr: stderr.text,
    timedOut: result.timedOut,
    truncated: result.truncated || stdout.truncated || stderr.truncated,
    digest: await sha256(
      JSON.stringify({
        id: spec.id,
        argv: spec.argv,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      }),
    ),
  };
  job.sandbox.execution.commands.push(evidence);
  if (evidence.exitCode !== 0 || evidence.timedOut) {
    throw new Error(
      `${spec.label} failed with exit code ${evidence.exitCode}${evidence.timedOut ? ' after timing out' : ''}.`,
    );
  }
  return evidence;
}

function scopeAuditSource(expected: Record<string, string>): string {
  return `import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const expected = ${JSON.stringify(expected, null, 2)};
for (const [path, digest] of Object.entries(expected)) {
  const content = await readFile(path);
  const actual = createHash('sha256').update(content).digest('hex');
  if (actual !== digest) {
    console.error(\`SCOPE VIOLATION: \${path} changed unexpectedly.\`);
    process.exit(1);
  }
}
console.log('SCOPE PASSED: only the allowlisted delivery adapter mutation is present.');
`;
}

async function writeHarness(adapter: RepairSandboxAdapter): Promise<void> {
  const files: Record<string, string> = {
    [PACKAGE_PATH]: PACKAGE_JSON,
    [REPAIR_SOURCE_PATH]: BASE_DELIVERY_SOURCE,
    [REPRODUCER_PATH]: REPRODUCER_TEST,
    [REPAIR_TEST_PATH]: REGRESSION_TEST,
    [AFFECTED_TEST_PATH]: AFFECTED_WORKFLOW_TEST,
  };
  for (const [relativePath, content] of Object.entries(files)) {
    await adapter.writeFile(safeRelativePath(relativePath), content);
  }
}

export async function executeRepairPipeline(
  initialJob: RepairJob,
  adapter: RepairSandboxAdapter,
  checkpoint: Checkpoint = () => undefined,
): Promise<RepairJob> {
  const job = clone(initialJob);
  let failure: Error | null = null;
  const verifierLabel = adapter.executionMode === 'edge_deterministic'
    ? 'the deterministic edge verifier'
    : 'the real failure reproducer';

  job.status = 'diagnosing';
  job.stageProgress = 8;
  job.updatedAt = now();
  job.sandbox.execution = {
    mode: adapter.executionMode,
    lifecycle: 'provisioning',
    startedAt: now(),
    attemptedWrites: [],
    commands: [],
  };
  await checkpoint(clone(job));

  try {
    await adapter.prepare();
    await writeHarness(adapter);
    job.currentStage = 'sandbox_created';
    job.stageProgress = 20;
    job.sandbox.execution.lifecycle = 'running';
    job.updatedAt = now();
    await checkpoint(clone(job));

    job.status = 'reproducing';
    setCheck(job.artifact.validationChecks, 'reproducer', 'running');
    await checkpoint(clone(job));
    const reproducer = await runCommand(job, adapter, COMMANDS.reproducer);
    setCheck(
      job.artifact.validationChecks,
      'reproducer',
      'passed',
      `Captured exit 0 from ${verifierLabel} (evidence ${reproducer.digest.slice(0, 12)}).`,
    );
    job.sandbox.execution.baseDigest = await sha256(BASE_DELIVERY_SOURCE);
    job.currentStage = 'reproduction_confirmed';
    job.stageProgress = 38;
    job.updatedAt = now();
    await checkpoint(clone(job));

    job.status = 'patching';
    job.agent.events.push(
      {
        stage: 'diagnosed',
        message: 'The persisted invoice is intact; the defect is confined to outbound TLS configuration and delivery idempotency.',
        timestamp: now(),
        evidenceId: reproducer.digest,
      },
      {
        stage: 'proposed',
        message: 'Selected delivery_tls_adapter_v1 because the source signature and failure code match the bounded repair policy.',
        timestamp: now(),
      },
    );
    job.sandbox.execution.attemptedWrites.push(REPAIR_SOURCE_PATH);
    await adapter.writeFile(safeRelativePath(REPAIR_SOURCE_PATH), CANDIDATE_DELIVERY_SOURCE);
    job.sandbox.execution.candidateDigest = await sha256(CANDIDATE_DELIVERY_SOURCE);
    job.agent.events.push({
      stage: 'mutated',
      message: `Wrote one allowlisted candidate file: ${REPAIR_SOURCE_PATH}.`,
      timestamp: now(),
      evidenceId: job.sandbox.execution.candidateDigest,
    });

    const expectedScope = {
      [REPAIR_SOURCE_PATH]: job.sandbox.execution.candidateDigest,
      [REPRODUCER_PATH]: await sha256(REPRODUCER_TEST),
      [REPAIR_TEST_PATH]: await sha256(REGRESSION_TEST),
      [AFFECTED_TEST_PATH]: await sha256(AFFECTED_WORKFLOW_TEST),
      [PACKAGE_PATH]: await sha256(PACKAGE_JSON),
    };
    await adapter.writeFile(SCOPE_AUDIT_PATH, scopeAuditSource(expectedScope));
    job.currentStage = 'patch_generated';
    job.stageProgress = 58;
    job.updatedAt = now();
    await checkpoint(clone(job));

    job.status = 'validating';
    setCheck(job.artifact.validationChecks, 'regression', 'running');
    setCheck(job.artifact.validationChecks, 'affected', 'running');
    setCheck(job.artifact.validationChecks, 'build', 'running');
    await checkpoint(clone(job));

    const regression = await runCommand(job, adapter, COMMANDS.regression);
    setCheck(
      job.artifact.validationChecks,
      'regression',
      'passed',
      `The existing invoice reaches the repaired adapter (evidence ${regression.digest.slice(0, 12)}).`,
    );
    job.stageProgress = 72;
    await checkpoint(clone(job));

    const affected = await runCommand(job, adapter, COMMANDS.affected);
    setCheck(
      job.artifact.validationChecks,
      'affected',
      'passed',
      `The affected flow preserves invoiceCreateCount=1 and idempotent delivery (evidence ${affected.digest.slice(0, 12)}).`,
    );
    job.stageProgress = 84;
    await checkpoint(clone(job));

    const build = await runCommand(job, adapter, COMMANDS.build);
    const scope = await runCommand(job, adapter, COMMANDS.scope);
    setCheck(
      job.artifact.validationChecks,
      'build',
      'passed',
      `Candidate syntax and scope audit passed (evidence ${build.digest.slice(0, 8)} / ${scope.digest.slice(0, 8)}).`,
    );
    job.sandbox.execution.workspaceDigest = await sha256(
      [CANDIDATE_DELIVERY_SOURCE, REPRODUCER_TEST, REGRESSION_TEST, AFFECTED_WORKFLOW_TEST]
        .join('\n---heap-4-file---\n'),
    );
    job.agent.events.push({
      stage: 'verified',
      message: `${adapter.executionMode === 'edge_deterministic' ? 'Every deterministic edge check' : 'Every executable check'} passed and the scope audit found no out-of-policy mutation.`,
      timestamp: now(),
      evidenceId: job.sandbox.execution.workspaceDigest,
    });
    job.status = 'ready_for_review';
    job.currentStage = 'validation_complete';
    job.stageProgress = 100;
    job.updatedAt = now();
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
    job.status = 'failed';
    job.updatedAt = now();
    const running = job.artifact.validationChecks.find((check) => check.status === 'running');
    if (running) {
      running.status = 'failed';
      running.detail = failure.message;
    }
    job.agent.events.push({
      stage: 'verified',
      message: `Repair execution stopped safely: ${failure.message}`,
      timestamp: now(),
    });
  } finally {
    try {
      await adapter.destroy();
      job.sandbox.execution.lifecycle = 'destroyed';
      job.sandbox.execution.cleanupDetail =
        'Ephemeral workspace destroyed after command output and digests were captured.';
    } catch (cleanupError) {
      const message = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      job.sandbox.execution.lifecycle = 'cleanup_failed';
      job.sandbox.execution.cleanupDetail = message;
      job.status = 'failed';
      failure ??= new Error(`Sandbox cleanup failed: ${message}`);
    }
    job.sandbox.execution.completedAt = now();
    job.updatedAt = now();
    await checkpoint(clone(job));
  }

  return job;
}
