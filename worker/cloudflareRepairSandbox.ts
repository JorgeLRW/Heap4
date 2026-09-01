import { getSandbox } from '@cloudflare/sandbox';
import type {
  RepairCommandSpec,
  RepairProcessResult,
  RepairSandboxAdapter,
} from '../src/shared/repairSandboxExecution';
import { REPAIR_WORKSPACE } from '../src/shared/repairSandboxExecution';
import type { RepairSandbox } from './repairSandboxClass';

const ALLOWED_WORKSPACE_FILES = new Set([
  'package.json',
  'src/server/services/DeliveryService.ts',
  'tests/reproduce.test.ts',
  'tests/deliveryService.test.ts',
  'tests/affectedWorkflow.test.ts',
  'scripts/scope-audit.mjs',
]);

function normalizeRelativePath(value: string): string {
  const normalized = value.replaceAll('\\', '/');
  if (!ALLOWED_WORKSPACE_FILES.has(normalized)) {
    throw new Error(`Cloudflare repair sandbox denied write to ${value}.`);
  }
  return normalized;
}

export class CloudflareRepairSandbox implements RepairSandboxAdapter {
  readonly executionMode = 'cloudflare_vm' as const;
  readonly logicalWorkspace = REPAIR_WORKSPACE;
  readonly sandboxId: string;
  private readonly sandbox;

  constructor(namespace: DurableObjectNamespace<RepairSandbox>, sandboxId: string) {
    if (!/^[a-z0-9_-]{8,96}$/i.test(sandboxId)) {
      throw new Error('The Cloudflare repair sandbox ID is invalid.');
    }
    this.sandboxId = sandboxId;
    this.sandbox = getSandbox(namespace, sandboxId, {
      keepAlive: false,
      normalizeId: true,
      sleepAfter: '1m',
      containerTimeouts: {
        instanceGetTimeoutMS: 30_000,
        portReadyTimeoutMS: 90_000,
        waitIntervalMS: 300,
      },
    });
  }

  async prepare(): Promise<void> {
    await this.sandbox.mkdir(REPAIR_WORKSPACE, { recursive: true });
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    const normalized = normalizeRelativePath(relativePath);
    const target = `${REPAIR_WORKSPACE}/${normalized}`;
    const parent = target.slice(0, target.lastIndexOf('/'));
    await this.sandbox.mkdir(parent, { recursive: true });
    await this.sandbox.writeFile(target, content, { encoding: 'utf-8' });
  }

  async run(spec: RepairCommandSpec): Promise<RepairProcessResult> {
    const [executable, ...args] = spec.argv;
    if (
      executable !== 'node' ||
      spec.cwd !== '.' ||
      args.some((argument) => !/^[A-Za-z0-9._/-]+$/.test(argument))
    ) {
      throw new Error(`Cloudflare repair sandbox denied command: ${spec.argv.join(' ')}`);
    }

    const command: [string, ...string[]] = [executable, ...args];
    const process = await this.sandbox.exec(command, {
      cwd: REPAIR_WORKSPACE,
      env: { CI: '1', NODE_ENV: 'test', NODE_NO_WARNINGS: '1' },
      timeout: spec.timeoutMs,
    });
    const output = await process.output({
      encoding: 'utf8',
      maxBytes: 256 * 1024,
      timeout: spec.timeoutMs + 2_000,
    });
    return {
      exitCode: output.exitCode,
      stdout: output.stdout,
      stderr: output.stderr,
      timedOut: output.timedOut,
      truncated: output.truncated,
    };
  }

  async destroy(): Promise<void> {
    await this.sandbox.destroy();
  }
}
