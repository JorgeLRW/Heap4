import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  RepairCommandSpec,
  RepairProcessResult,
  RepairSandboxAdapter,
} from '../src/shared/repairSandboxExecution';
import { REPAIR_WORKSPACE } from '../src/shared/repairSandboxExecution';

const ALLOWED_WORKSPACE_FILES = new Set([
  'package.json',
  'src/server/services/DeliveryService.ts',
  'tests/reproduce.test.ts',
  'tests/deliveryService.test.ts',
  'tests/affectedWorkflow.test.ts',
  'scripts/scope-audit.mjs',
]);

function assertSandboxId(value: string): string {
  if (!/^[a-z0-9_-]{8,96}$/i.test(value)) {
    throw new Error('The local repair sandbox ID is invalid.');
  }
  return value;
}

function normalizeRelativePath(value: string): string {
  const normalized = value.replaceAll('\\', '/');
  if (!ALLOWED_WORKSPACE_FILES.has(normalized)) {
    throw new Error(`Local repair sandbox denied write to ${value}.`);
  }
  return normalized;
}

function stringValue(value: string | Buffer | undefined): string {
  if (typeof value === 'string') return value;
  return value ? value.toString() : '';
}

export class LocalRepairSandbox implements RepairSandboxAdapter {
  readonly executionMode = 'local_bounded_process' as const;
  readonly logicalWorkspace = REPAIR_WORKSPACE;
  readonly sandboxId: string;
  private readonly root: string;
  private prepared = false;

  constructor(sandboxId: string) {
    this.sandboxId = assertSandboxId(sandboxId);
    this.root = path.join(os.tmpdir(), 'heap-4-sandboxes', this.sandboxId);
  }

  async prepare(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    this.prepared = true;
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    this.assertPrepared();
    const normalized = normalizeRelativePath(relativePath);
    const target = path.resolve(this.root, ...normalized.split('/'));
    this.assertInsideWorkspace(target);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, { encoding: 'utf8', flag: 'w' });
  }

  async run(spec: RepairCommandSpec): Promise<RepairProcessResult> {
    this.assertPrepared();
    if (
      spec.argv[0] !== 'node' ||
      spec.cwd !== '.' ||
      spec.argv.slice(1).some((argument) => !/^[A-Za-z0-9._/-]+$/.test(argument))
    ) {
      throw new Error(`Local repair sandbox denied command: ${spec.argv.join(' ')}`);
    }

    const args = [
      '--permission',
      `--allow-fs-read=${this.root}`,
      `--allow-fs-write=${this.root}`,
      ...spec.argv.slice(1),
    ];

    return new Promise((resolve) => {
      execFile(
        process.execPath,
        args,
        {
          cwd: this.root,
          timeout: spec.timeoutMs,
          windowsHide: true,
          maxBuffer: 256 * 1024,
          env: {
            CI: '1',
            NODE_ENV: 'test',
            NODE_NO_WARNINGS: '1',
            SystemRoot: process.env.SystemRoot,
            TEMP: this.root,
            TMP: this.root,
          },
        },
        (error, stdout, stderr) => {
          const code =
            typeof error?.code === 'number'
              ? error.code
              : error
                ? 1
                : 0;
          resolve({
            exitCode: code,
            stdout: stringValue(stdout),
            stderr: stringValue(stderr),
            timedOut: Boolean(error?.killed),
            truncated: error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
          });
        },
      );
    });
  }

  async destroy(): Promise<void> {
    const sandboxesRoot = path.resolve(os.tmpdir(), 'heap-4-sandboxes');
    const resolved = path.resolve(this.root);
    const relative = path.relative(sandboxesRoot, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Refused to clean up a path outside the Heap 4 sandbox root.');
    }
    await rm(resolved, { recursive: true, force: true });
    this.prepared = false;
  }

  private assertPrepared(): void {
    if (!this.prepared) throw new Error('The local repair sandbox is not prepared.');
  }

  private assertInsideWorkspace(target: string): void {
    const relative = path.relative(this.root, target);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Local repair sandbox path escaped the workspace.');
    }
  }
}
