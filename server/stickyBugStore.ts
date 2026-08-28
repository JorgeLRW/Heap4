import { StickyBug, StickyBugAttachment, generateStickyBugHash } from '../src/webmcp/stickyBugs';
import { SessionTelemetryPacket } from '../src/webmcp/types';

export class StickyBugStore {
  private bugs: Map<string, StickyBug> = new Map();

  constructor() {
    // Seed with a sample prior Sticky Bug
    const sampleHash = 'sb-8f2a1b-3c4d';
    this.bugs.set(sampleHash, {
      hash: sampleHash,
      title: 'Corrupted localStorage JSON chunk in user cart session',
      errorMessage: 'SyntaxError: Unexpected token { in JSON at position 0',
      stackTrace: 'SyntaxError: JSON.parse error at storage.ts:45\n  at loadUserCart (NexusApp.tsx:112)',
      url: 'http://localhost:5173',
      timestamp: new Date(Date.now() - 3600000 * 3).toISOString(),
      userId: 'usr_demo_alpha',
      status: 'hotfix_applied',
      attachedFiles: [
        {
          name: 'session_telemetry_dump.json',
          sizeBytes: 14280,
          type: 'application/json',
        },
      ],
      userSummary: 'Cart suddenly reset after pasting coupon code. WebMCP agent hot-fixed the storage key.',
      telemetryPacketId: 'pkt_seed_001',
      remediationAction: 'repair_storage_cache',
      remediationPath: 'WEBMCP_HOTFIX',
      assignedModel: 'Supervisor (GPT-4o) ➔ Fast State Worker (Ollama llama3.1)',
    });
  }

  /**
   * Ingest or update a sticky bug from a telemetry packet
   */
  public recordTelemetryAnomaly(
    packet: SessionTelemetryPacket,
    remediation?: {
      path: 'WEBMCP_HOTFIX' | 'CODEBASE_PR';
      toolName?: string;
      prId?: string;
      modelUsed?: string;
    }
  ): StickyBug {
    const errorMsg = packet.error?.message || 'Unknown browser anomaly';
    const stackTrace = packet.error?.stack || '';
    const hash = generateStickyBugHash(errorMsg, stackTrace, packet.url);

    let bug = this.bugs.get(hash);
    if (!bug) {
      bug = {
        hash,
        title: errorMsg.length > 80 ? errorMsg.substring(0, 80) + '...' : errorMsg,
        errorMessage: errorMsg,
        stackTrace,
        url: packet.url,
        timestamp: new Date().toISOString(),
        userId: packet.userId,
        status: 'triage_in_progress',
        attachedFiles: [],
        telemetryPacketId: packet.id,
      };
      this.bugs.set(hash, bug);
    }

    // Update status based on remediation
    if (remediation) {
      bug.remediationPath = remediation.path;
      bug.assignedModel = remediation.modelUsed;
      if (remediation.path === 'WEBMCP_HOTFIX') {
        bug.status = 'hotfix_applied';
        bug.remediationAction = remediation.toolName || 'WebMCP Hot-Fix';
      } else if (remediation.path === 'CODEBASE_PR') {
        bug.status = 'pr_opened';
        bug.remediationAction = remediation.prId ? `PR ${remediation.prId}` : 'Autonomous PR';
      }
    }

    return bug;
  }

  public getBug(hash: string): StickyBug | undefined {
    return this.bugs.get(hash);
  }

  public getAllBugs(): StickyBug[] {
    return Array.from(this.bugs.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  public submitBugDetails(
    hash: string,
    details: {
      userSummary?: string;
      attachments?: StickyBugAttachment[];
    }
  ): StickyBug | undefined {
    let bug = this.bugs.get(hash);
    if (!bug) {
      // Create user-initiated bug if hash not recorded yet
      bug = {
        hash,
        title: details.userSummary ? details.userSummary.substring(0, 80) : `User Report [${hash}]`,
        errorMessage: details.userSummary || 'User submitted sticky bug report',
        url: 'http://localhost:5173',
        timestamp: new Date().toISOString(),
        userId: 'usr_manual_report',
        status: 'captured',
        attachedFiles: [],
      };
      this.bugs.set(hash, bug);
    }

    if (details.userSummary) {
      bug.userSummary = details.userSummary;
    }

    if (details.attachments && details.attachments.length > 0) {
      bug.attachedFiles = [...bug.attachedFiles, ...details.attachments];
    }

    return bug;
  }
}
